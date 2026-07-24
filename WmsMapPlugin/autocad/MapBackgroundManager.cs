// MapBackgroundManager.cs - 动态地理配准背景图层
// 架构：ViewChanged 设标志 -> Application.Idle 在主线程处理 -> 安全修改数据库
// 之前 ViewChanged + Timer 在线程池线程直接操作数据库导致 AccessViolation

using System;
using System.Collections.Generic;
using System.IO;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace WmsMapPlugin
{
  public class WmsLayerInfo
  {
    public string Url { get; set; }
    public string LayerName { get; set; }
    public string Crs { get; set; }
    public string Format { get; set; }
  }

  /// <summary>
  /// 待处理的图片更新（从 WebView2 回调线程存入，Idle 中取出执行）
  /// </summary>
  internal class PendingImageUpdate
  {
    public string ImagePath;
    public double MinX;
    public double MinY;
    public double Width;
    public double Height;
  }

  /// <summary>
  /// 动态背景图层管理器：Application.Idle + 命令队列模式
  ///
  /// 线程安全设计：
  /// - ViewChanged 事件（可能在任意线程）只设 viewDirty 标志
  /// - UpdateBackgroundFromBase64（WebView2 回调线程）只写文件 + 设 pendingImage
  /// - Application.Idle（主线程）统一处理所有 AutoCAD 数据库操作
  /// </summary>
  public class MapBackgroundManager : IDisposable
  {
    private Document doc;
    private List<WmsLayerInfo> activeLayers;
    private bool disposed;
    private ObjectId rasterImageId;
    private ObjectId rasterImageDefId;
    private string currentImagePath;

    // 命令队列（线程安全）
    private readonly object queueLock = new object();
    private bool viewDirty;
    private PendingImageUpdate pendingImage;
    private bool isUpdating;

    // 视图推送节流
    private DateTime lastPushTime = DateTime.MinValue;
    private static readonly TimeSpan PushInterval = TimeSpan.FromMilliseconds(300);

    public Action<double, double, double, double, string> ViewBoundsChangedHandler { get; set; }
    public List<WmsLayerInfo> ActiveLayers { get { return activeLayers; } }

    public void Initialize(Document document)
    {
      doc = document;
      activeLayers = new List<WmsLayerInfo>();
      rasterImageId = ObjectId.Null;
      rasterImageDefId = ObjectId.Null;
      currentImagePath = null;
      viewDirty = false;
      pendingImage = null;
      isUpdating = false;

      // ViewChanged 只设标志，不访问任何 AutoCAD API
      doc.ViewChanged += OnViewChanged;

      // Application.Idle 在主线程触发，处理所有数据库操作
      Autodesk.AutoCAD.ApplicationServices.Application.Idle += OnApplicationIdle;

      Logger.Write("INFO", "MapBackgroundManager 已初始化（Idle + 命令队列模式）");
    }

    /// <summary>
    /// ViewChanged 回调：只设标志，不访问 AutoCAD API
    /// </summary>
    private void OnViewChanged(object sender, EventArgs e)
    {
      if (disposed) return;
      lock (queueLock) { viewDirty = true; }
    }

    /// <summary>
    /// Application.Idle 回调：主线程，安全处理数据库操作
    /// </summary>
    private void OnApplicationIdle(object sender, EventArgs e)
    {
      if (disposed || doc == null) return;

      // 1. 处理视图推送（节流 300ms）
      if (!isUpdating && activeLayers.Count > 0)
      {
        bool needPush = false;
        lock (queueLock)
        {
          if (viewDirty && DateTime.Now - lastPushTime >= PushInterval)
          {
            viewDirty = false;
            needPush = true;
          }
        }
        if (needPush)
        {
          lastPushTime = DateTime.Now;
          PushViewBoundsToFrontend();
        }
      }

      // 2. 处理图片更新
      if (!isUpdating)
      {
        PendingImageUpdate update = null;
        lock (queueLock)
        {
          if (pendingImage != null)
          {
            update = pendingImage;
            pendingImage = null;
            isUpdating = true;
          }
        }
        if (update != null)
        {
          try
          {
            UpdateRasterImage(update.ImagePath, update.MinX, update.MinY, update.Width, update.Height);
          }
          finally
          {
            lock (queueLock) { isUpdating = false; }
          }
        }
      }
    }

    /// <summary>
    /// 推送 CAD 视图范围到前端（主线程调用）
    /// </summary>
    private void PushViewBoundsToFrontend()
    {
      if (disposed || doc == null || ViewBoundsChangedHandler == null) return;
      try
      {
        var view = doc.Editor.GetCurrentView();
        double cx = view.CenterPoint.X, cy = view.CenterPoint.Y;
        double hw = view.Width / 2.0, hh = view.Height / 2.0;
        double minX = cx - hw, minY = cy - hh, maxX = cx + hw, maxY = cy + hh;
        string crs = activeLayers.Count > 0 ? (activeLayers[0].Crs ?? "EPSG:4490") : "EPSG:4490";
        ViewBoundsChangedHandler(minX, minY, maxX, maxY, crs);
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "推送视图范围失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 接收前端发来的 WMS 图片 base64（WebView2 回调线程调用）
    /// 只写文件 + 设 pendingImage，不访问数据库
    /// </summary>
    public void UpdateBackgroundFromBase64(string base64Data, double minX, double minY, double width, double height)
    {
      if (disposed || string.IsNullOrEmpty(base64Data) || doc == null) return;
      Logger.Write("INFO", string.Format("UpdateBackgroundFromBase64: minX={0:F2} minY={1:F2} width={2:F2} height={3:F2}", minX, minY, width, height));
      if (width <= 0 || height <= 0)
      {
        Logger.Write("WARN", string.Format("跳过更新：尺寸无效 width={0} height={1}", width, height));
        return;
      }
      try
      {
        string pureBase64 = base64Data.Contains(",") ? base64Data.Substring(base64Data.IndexOf(",") + 1) : base64Data;
        byte[] imageBytes = Convert.FromBase64String(pureBase64);
        if (imageBytes.Length < 1000)
        {
          Logger.Write("WARN", "跳过背景更新：WMS 图片过小，疑似空白/错误响应 (" + imageBytes.Length + " bytes)");
          return;
        }

        // 写入临时文件（线程安全操作）
        string dllDir = Path.GetDirectoryName(typeof(MapBackgroundManager).Assembly.Location);
        string imageDir = Path.Combine(dllDir, "images");
        if (!Directory.Exists(imageDir)) Directory.CreateDirectory(imageDir);
        string imagePath = Path.Combine(imageDir, "bg_" + DateTime.Now.ToString("yyyyMMddHHmmssfff") + ".png");
        File.WriteAllBytes(imagePath, imageBytes);
        Logger.Write("INFO", "图片已写入: " + imagePath + " (" + imageBytes.Length + " bytes)");

        // 存入队列，等待 Idle 处理
        var update = new PendingImageUpdate
        {
          ImagePath = imagePath,
          MinX = minX,
          MinY = minY,
          Width = width,
          Height = height
        };
        lock (queueLock) { pendingImage = update; }
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "准备背景图片失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 更新 RasterImage（主线程 Idle 中调用，安全上下文）
    /// 1. 删除旧 RasterImage + RasterImageDef
    /// 2. 删除旧图片文件
    /// 3. 创建新 RasterImageDef + RasterImage
    /// </summary>
    private void UpdateRasterImage(string imagePath, double insertX, double insertY, double width, double height)
    {
      Database db = doc.Database;

      // 步骤1：删除旧 RasterImage + RasterImageDef（单独事务）
      if (rasterImageId.IsValid && !rasterImageId.IsNull)
      {
        try
        {
          using (DocumentLock docLock = doc.LockDocument())
          using (Transaction tr = db.TransactionManager.StartTransaction())
          {
            RasterImage oldImage = (RasterImage)tr.GetObject(rasterImageId, OpenMode.ForWrite);
            ObjectId oldDefId = oldImage.ImageDefId;
            oldImage.Erase();
            // 同时删除 RasterImageDef，避免图像字典膨胀
            if (oldDefId.IsValid && !oldDefId.IsNull)
            {
              try { ((RasterImageDef)tr.GetObject(oldDefId, OpenMode.ForWrite)).Erase(); }
              catch { }
            }
            tr.Commit();
          }
        }
        catch (Exception ex)
        {
          Logger.Write("WARN", "删除旧 RasterImage 失败: " + ex.Message);
        }
        rasterImageId = ObjectId.Null;
        rasterImageDefId = ObjectId.Null;
      }

      // 步骤2：删除旧图片文件（RasterImageDef 已删除，文件应已解锁）
      if (!string.IsNullOrEmpty(currentImagePath) && File.Exists(currentImagePath))
      {
        try { File.Delete(currentImagePath); }
        catch { /* 文件可能仍被锁定，忽略 */ }
      }

      // 步骤3：创建新 RasterImageDef + RasterImage
      using (DocumentLock docLock = doc.LockDocument())
      using (Transaction tr = db.TransactionManager.StartTransaction())
      {
        try
        {
          if (!File.Exists(imagePath))
          {
            Logger.Write("ERROR", "图片文件不存在: " + imagePath);
            return;
          }
          Logger.Write("INFO", "开始创建 RasterImage: " + imagePath);

          // 获取或创建图像字典
          ObjectId imgDictId = RasterImageDef.GetImageDictionary(db);
          if (imgDictId.IsNull) imgDictId = RasterImageDef.CreateImageDictionary(db);
          DBDictionary imgDict = (DBDictionary)tr.GetObject(imgDictId, OpenMode.ForRead);

          string defName = RasterImageDef.SuggestName(imgDict, "WMS_BG");
          Logger.Write("INFO", "图像定义名称: " + defName);

          RasterImageDef imageDef = new RasterImageDef();
          imageDef.SourceFileName = imagePath;
          imageDef.Load();
          Logger.Write("INFO", "RasterImageDef.Load 成功");

          imgDict.UpgradeOpen();
          ObjectId imageDefId = imgDict.SetAt(defName, imageDef);
          tr.AddNewlyCreatedDBObject(imageDef, true);
          Logger.Write("INFO", "RasterImageDef 已存入字典");

          // 创建 RasterImage 实体
          BlockTable blkTbl = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
          BlockTableRecord modelSpace = (BlockTableRecord)tr.GetObject(blkTbl[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

          using (RasterImage rasterImage = new RasterImage())
          {
            rasterImage.ImageDefId = imageDefId;
            Logger.Write("INFO", "ImageDefId 已设置");

            rasterImage.Orientation = new CoordinateSystem3d(
              new Point3d(insertX, insertY, 0),
              new Vector3d(width, 0, 0),
              new Vector3d(0, height, 0));
            Logger.Write("INFO", "Orientation 已设置");

            modelSpace.AppendEntity(rasterImage);
            tr.AddNewlyCreatedDBObject(rasterImage, true);
            Logger.Write("INFO", "RasterImage 已加入模型空间");

            RasterImage.EnableReactors(true);
            rasterImage.AssociateRasterDef(imageDef);
            Logger.Write("INFO", "AssociateRasterDef 完成");

            rasterImageId = rasterImage.ObjectId;
            rasterImageDefId = imageDefId;
          }
          currentImagePath = imagePath;
          tr.Commit();
          Logger.Write("INFO", "事务已提交，背景图层更新成功");
        }
        catch (Autodesk.AutoCAD.Runtime.Exception ex)
        {
          Logger.Write("ERROR", "AutoCAD 异常: " + ex.Message + "\n堆栈: " + ex.StackTrace);
          tr.Abort();
        }
        catch (Exception ex)
        {
          Logger.Write("ERROR", "创建 RasterImage 失败: " + ex.Message + "\n堆栈: " + ex.StackTrace);
          tr.Abort();
        }
      }
    }

    /// <summary>
    /// 更新活动图层列表（WebView2 回调线程调用）
    /// </summary>
    public void UpdateActiveLayers(List<WmsLayerInfo> layers)
    {
      activeLayers = layers ?? new List<WmsLayerInfo>();
      Logger.Write("INFO", "活动图层已更新: " + activeLayers.Count + " 个");
      if (activeLayers.Count > 0)
      {
        // 触发视图推送
        lock (queueLock) { viewDirty = true; }
      }
      else
      {
        // 没有可见图层，标记需要移除背景
        lock (queueLock) { pendingImage = null; }
        RemoveRasterImage();
      }
    }

    /// <summary>
    /// 移除背景图层（主线程安全调用）
    /// </summary>
    private void RemoveRasterImage()
    {
      if (doc == null || !rasterImageId.IsValid || rasterImageId.IsNull) return;
      try
      {
        using (DocumentLock docLock = doc.LockDocument())
        using (Transaction tr = doc.Database.TransactionManager.StartTransaction())
        {
          RasterImage img = (RasterImage)tr.GetObject(rasterImageId, OpenMode.ForWrite);
          ObjectId defId = img.ImageDefId;
          img.Erase();
          if (defId.IsValid && !defId.IsNull)
          {
            try { ((RasterImageDef)tr.GetObject(defId, OpenMode.ForWrite)).Erase(); }
            catch { }
          }
          tr.Commit();
        }
        rasterImageId = ObjectId.Null;
        rasterImageDefId = ObjectId.Null;

        // 删除图片文件
        if (!string.IsNullOrEmpty(currentImagePath) && File.Exists(currentImagePath))
        {
          try { File.Delete(currentImagePath); } catch { }
          currentImagePath = null;
        }
        Logger.Write("INFO", "背景图层已移除");
      }
      catch (Exception ex)
      {
        Logger.Write("WARN", "移除背景图层失败: " + ex.Message);
      }
    }

    public void Refresh()
    {
      lock (queueLock) { viewDirty = true; }
    }

    public void Dispose()
    {
      if (disposed) return;
      disposed = true;
      try { if (doc != null) doc.ViewChanged -= OnViewChanged; } catch { }
      try { Autodesk.AutoCAD.ApplicationServices.Application.Idle -= OnApplicationIdle; } catch { }
      try { RemoveRasterImage(); } catch { }

      // 清理 images 目录中残留的临时文件
      try
      {
        string dllDir = Path.GetDirectoryName(typeof(MapBackgroundManager).Assembly.Location);
        string imageDir = Path.Combine(dllDir, "images");
        if (Directory.Exists(imageDir))
        {
          foreach (string f in Directory.GetFiles(imageDir, "bg_*.png"))
          {
            try { File.Delete(f); } catch { }
          }
        }
      }
      catch { }

      Logger.Write("INFO", "MapBackgroundManager 已释放");
    }
  }
}
