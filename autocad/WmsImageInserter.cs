// WmsImageInserter.cs - 图片插入 CAD 模型空间
// 将 base64 图片数据按真实地理坐标插入到 AutoCAD 模型空间

using System;
using System.IO;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace WmsMapPlugin
{
  /// <summary>
  /// 图片插入器，负责将 base64 编码的图片数据按地理坐标插入到 AutoCAD 模型空间
  /// 流程：base64 解码 -> 持久化 PNG -> 创建 RasterImageDef -> 创建 RasterImage -> 按地理范围设置尺寸 -> 插入模型空间
  /// </summary>
  public class WmsImageInserter
  {
    // WMS 返回图片的有效性最小阈值（bytes），低于此值视为错误响应
    private const int MinImageSize = 1000;

    private readonly Action<string, string> logAction;

    /// <summary>
    /// 创建图片插入器实例
    /// </summary>
    public WmsImageInserter(Action<string, string> logAction)
    {
      this.logAction = logAction ?? ((level, msg) => { });
    }

    /// <summary>
    /// 插入图片到 CAD 模型空间（按真实地理坐标定位）
    /// </summary>
    /// <param name="base64Data">base64 编码的图片数据（可包含 data:image/png;base64, 前缀）</param>
    /// <param name="filename">原始文件名（用于持久化）</param>
    /// <param name="geoMinX">地理范围最小 X（投影坐标，米）</param>
    /// <param name="geoMinY">地理范围最小 Y（投影坐标，米）</param>
    /// <param name="geoMaxX">地理范围最大 X（投影坐标，米）</param>
    /// <param name="geoMaxY">地理范围最大 Y（投影坐标，米）</param>
    /// <param name="crs">坐标系 EPSG 编号（如 EPSG:4534）</param>
    /// <param name="imgWidth">图片像素宽度</param>
    /// <param name="imgHeight">图片像素高度</param>
    /// <returns>插入结果信息</returns>
    public InsertResult InsertImage(string base64Data, string filename,
      double? geoMinX, double? geoMinY, double? geoMaxX, double? geoMaxY,
      string crs, int imgWidth, int imgHeight)
    {
      if (string.IsNullOrEmpty(base64Data))
      {
        logAction("WARN", "插入图片失败：base64 数据为空");
        return new InsertResult { Success = false, Message = "图片数据为空" };
      }

      try
      {
        // 1. 解析 base64 数据（去除 data URI 前缀）
        string pureBase64 = StripDataUriPrefix(base64Data);
        byte[] imageBytes;
        try
        {
          imageBytes = Convert.FromBase64String(pureBase64);
        }
        catch (FormatException ex)
        {
          logAction("ERROR", "base64 解码失败: " + ex.Message);
          return new InsertResult { Success = false, Message = "base64 格式错误" };
        }

        logAction("INFO", string.Format("图片解码成功，大小: {0} bytes", imageBytes.Length));
        if (imageBytes.Length < MinImageSize)
        {
          logAction("WARN", "插入图片失败：图片过小，疑似 WMS 空白/错误响应");
          return new InsertResult { Success = false, Message = "WMS 返回空白或错误图片" };
        }

        // 2. 持久化 PNG 文件
        string imagePath = SavePersistentImage(imageBytes, filename);
        logAction("INFO", "图片已持久化: " + imagePath);

        // 4. 计算每像素世界坐标位移（CoordinateSystem3d 的 uVector/vVector = 每像素位移）
        double widthMeters, heightMeters;
        double insertX, insertY;

        if (geoMinX.HasValue && geoMinY.HasValue && geoMaxX.HasValue && geoMaxY.HasValue)
        {
          insertX = geoMinX.Value;
          insertY = geoMinY.Value;
          // CoordinateSystem3d 的 uVector/vVector = 图片总宽度/总高度（世界坐标）
          widthMeters = geoMaxX.Value - geoMinX.Value;
          heightMeters = geoMaxY.Value - geoMinY.Value;
          logAction("INFO", string.Format("地理配准插入: 原点({0:F2},{1:F2}) 宽{2:F2} 高{3:F2} CRS={4}",
            insertX, insertY, widthMeters, heightMeters, crs ?? "未知"));
        }
        else
        {
          // 没有 geoBounds，用 DPI 估算（降级方案）
          ImageDimensions dimensions = CalculateDimensions(imageBytes);
          insertX = 0;
          insertY = 0;
          widthMeters = dimensions.WidthMm / 1000.0;
          heightMeters = dimensions.HeightMm / 1000.0;
          logAction("WARN", string.Format("无地理范围，降级 DPI 估算: 原点(0,0) 宽{0:F2}m 高{1:F2}m", widthMeters, heightMeters));
        }

        // 4. 插入到 CAD 模型空间（真正的 RasterImage API 调用）
        InsertToModelSpace(imagePath, insertX, insertY, widthMeters, heightMeters);

        // 5. 隐藏图像边框（FRAME=0 对图纸内所有 RasterImage 生效，含动态背景图）
        try
        {
          Application.SetSystemVariable("FRAME", 0);
        }
        catch (Exception ex)
        {
          logAction("WARN", "设置 FRAME=0 失败: " + ex.Message);
        }

        // 6. 自动缩放到影像实际范围（用户无需手动回车/缩放查找）
        try
        {
          var editor = Application.DocumentManager.MdiActiveDocument.Editor;
          var view = editor.GetCurrentView();
          view.CenterPoint = new Point2d(insertX + widthMeters / 2, insertY + heightMeters / 2);
          // 保持当前视口宽高比，取能容纳影像的尺寸（加 10% 边距）
          double viewRatio = view.Width / view.Height;
          double imgRatio = widthMeters / heightMeters;
          if (imgRatio > viewRatio)
          {
            view.Width = widthMeters * 1.1;
            view.Height = view.Width / viewRatio;
          }
          else
          {
            view.Height = heightMeters * 1.1;
            view.Width = view.Height * viewRatio;
          }
          editor.SetCurrentView(view);
          editor.Regen();
          logAction("INFO", "已自动缩放到影像范围");
        }
        catch (Exception ex)
        {
          logAction("WARN", "自动缩放失败: " + ex.Message);
        }

        // 7. 在 AutoCAD 命令行输出提示
        NotifyUser(filename, widthMeters, heightMeters, crs);

        logAction("INFO", "图片已按地理坐标插入到 CAD 模型空间");
        return new InsertResult
        {
          Success = true,
          Message = "图片已插入",
          WidthMm = widthMeters * 1000,
          HeightMm = heightMeters * 1000
        };
      }
      catch (Exception ex)
      {
        logAction("ERROR", "插入图片失败: " + ex.Message);
        return new InsertResult { Success = false, Message = "插入失败: " + ex.Message };
      }
    }

    /// <summary>
    /// 去除 data URI 前缀（如 data:image/png;base64,）
    /// </summary>
    private string StripDataUriPrefix(string base64Data)
    {
      if (base64Data.Contains(","))
      {
        return base64Data.Substring(base64Data.IndexOf(",") + 1);
      }
      return base64Data;
    }

    /// <summary>
    /// PNG 像素尺寸
    /// </summary>
    private struct PngDimensions
    {
      public int Width;
      public int Height;
    }

    /// <summary>
    /// 从 PNG 字节数据解析图像像素尺寸（读取 IHDR 块）
    /// PNG 格式: 签名(8) + IHDR长度(4) + "IHDR"(4) + 宽度(4) + 高度(4)...
    /// </summary>
    private PngDimensions ParsePngDimensions(byte[] pngBytes)
    {
      if (pngBytes.Length < 24)
        throw new ArgumentException("PNG 数据不足，无法解析");
      // 宽度在偏移16-19，高度在20-23（big-endian uint32）
      int width = (pngBytes[16] << 24) | (pngBytes[17] << 16) | (pngBytes[18] << 8) | pngBytes[19];
      int height = (pngBytes[20] << 24) | (pngBytes[21] << 16) | (pngBytes[22] << 8) | pngBytes[23];
      return new PngDimensions { Width = width, Height = height };
    }

    /// <summary>
    /// 持久化图片到 Contents/images/ 目录（RasterImageDef 是链接引用，文件不能删除）
    /// </summary>
    private string SavePersistentImage(byte[] imageBytes, string filename)
    {
      // 清洗 filename：只取文件名部分
      filename = Path.GetFileName(filename);
      if (string.IsNullOrEmpty(filename) || filename.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
      {
        filename = "insert-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".png";
      }

      // 保存到 DLL 所在目录下的 images/ 文件夹
      string dllDir = Path.GetDirectoryName(typeof(WmsImageInserter).Assembly.Location);
      string imageDir = Path.Combine(dllDir, "images");
      if (!Directory.Exists(imageDir))
      {
        Directory.CreateDirectory(imageDir);
      }

      string imagePath = Path.Combine(imageDir, filename);
      File.WriteAllBytes(imagePath, imageBytes);
      return imagePath;
    }

    // PNG 文件签名（8 字节）
    private static readonly byte[] PngSignature = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    /// <summary>
    /// 从 PNG 文件字节头解析真实像素尺寸，并换算物理尺寸（基于 150 DPI）
    /// 解析失败时回退估算值 800x600
    /// </summary>
    private ImageDimensions CalculateDimensions(byte[] imageBytes)
    {
      double widthPx = 800;
      double heightPx = 600;

      uint pngWidth, pngHeight;
      if (TryReadPngDimensions(imageBytes, out pngWidth, out pngHeight))
      {
        widthPx = pngWidth;
        heightPx = pngHeight;
      }

      double dpi = 150.0;
      double widthMm = (widthPx / dpi) * 25.4;
      double heightMm = (heightPx / dpi) * 25.4;

      return new ImageDimensions
      {
        WidthPx = widthPx,
        HeightPx = heightPx,
        WidthMm = widthMm,
        HeightMm = heightMm,
        Dpi = dpi
      };
    }

    /// <summary>
    /// 从 PNG 字节数据解析像素尺寸
    /// </summary>
    private static bool TryReadPngDimensions(byte[] data, out uint width, out uint height)
    {
      width = 0;
      height = 0;

      if (data == null || data.Length < 24) return false;

      for (int i = 0; i < PngSignature.Length; i++)
      {
        if (data[i] != PngSignature[i]) return false;
      }

      if (data[12] != 0x49 || data[13] != 0x48 || data[14] != 0x44 || data[15] != 0x52) return false;

      width = ((uint)data[16] << 24) | ((uint)data[17] << 16) | ((uint)data[18] << 8) | data[19];
      height = ((uint)data[20] << 24) | ((uint)data[21] << 16) | ((uint)data[22] << 8) | data[23];

      return width > 0 && height > 0;
    }

    /// <summary>
    /// 使用 AutoCAD RasterImage API 将图片按真实地理坐标插入到模型空间
    /// </summary>
    /// <param name="imagePath">持久化的图片文件路径</param>
    /// <param name="insertX">插入点 X（投影坐标，米）</param>
    /// <param name="insertY">插入点 Y（投影坐标，米）</param>
    /// <param name="widthMeters">图片宽度（米）</param>
    /// <param name="heightMeters">图片高度（米）</param>
    private void InsertToModelSpace(string imagePath, double insertX, double insertY,
      double widthMeters, double heightMeters)
    {
      var doc = Application.DocumentManager.MdiActiveDocument;
      if (doc == null)
      {
        throw new InvalidOperationException("没有活动的 AutoCAD 文档");
      }
      Database db = doc.Database;

      // WebView2 回调不在命令上下文中，必须 LockDocument
      using (DocumentLock docLock = doc.LockDocument())
      using (Transaction tr = db.TransactionManager.StartTransaction())
      {
        // 1. 获取或创建图像字典（Image Dictionary）
        ObjectId imgDictId = RasterImageDef.GetImageDictionary(db);
        if (imgDictId.IsNull)
        {
          imgDictId = RasterImageDef.CreateImageDictionary(db);
        }
        DBDictionary imgDict = (DBDictionary)tr.GetObject(imgDictId, OpenMode.ForRead);

        // 2. 创建 RasterImageDef（图片定义），用文件名作为字典中的键
        string imageDefName = Path.GetFileNameWithoutExtension(imagePath);
        // 确保名称唯一：如果已存在，追加序号
        imageDefName = RasterImageDef.SuggestName(imgDict, imageDefName);

        RasterImageDef imageDef = new RasterImageDef();
        imageDef.SourceFileName = imagePath;
        imageDef.Load();

        imgDict.UpgradeOpen();
        ObjectId imageDefId = imgDict.SetAt(imageDefName, imageDef);
        tr.AddNewlyCreatedDBObject(imageDef, true);

        // 3. 打开模型空间（写模式）
        BlockTable blkTbl = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        BlockTableRecord modelSpace = (BlockTableRecord)tr.GetObject(
          blkTbl[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

        // 4. 创建 RasterImage 实体并设置地理配准几何
        using (RasterImage rasterImage = new RasterImage())
        {
          rasterImage.ImageDefId = imageDefId;

          // 通过 CoordinateSystem3d 一次性设置插入点 + 宽度 + 高度
          // X 向量长度 = 图片宽度（米），Y 向量长度 = 图片高度（米）
          Point3d insertPoint = new Point3d(insertX, insertY, 0);
          Vector3d widthVector = new Vector3d(widthMeters, 0, 0);
          Vector3d heightVector = new Vector3d(0, heightMeters, 0);
          rasterImage.Orientation = new CoordinateSystem3d(insertPoint, widthVector, heightVector);

          // 5. 加入模型空间
          modelSpace.AppendEntity(rasterImage);
          tr.AddNewlyCreatedDBObject(rasterImage, true);

          // 6. 建立 Reactor 关联（必须，否则 RasterImageDef 显示为 unreferenced）
          RasterImage.EnableReactors(true);
          rasterImage.AssociateRasterDef(imageDef);
        }

        // 7. 提交事务
        tr.Commit();
      }

      logAction("INFO", string.Format("RasterImage 已插入: 原点({0:F2},{1:F2}) 宽{2:F2}m 高{3:F2}m",
        insertX, insertY, widthMeters, heightMeters));
    }

    /// <summary>
    /// 在 AutoCAD 命令行通知用户插入结果
    /// </summary>
    private void NotifyUser(string filename, double widthMeters, double heightMeters, string crs)
    {
      try
      {
        var doc = Application.DocumentManager.MdiActiveDocument;
        if (doc != null)
        {
          doc.Editor.WriteMessage(string.Format(
            "\n[WMS] 影像已插入: {0} ({1:F2}m x {2:F2}m, {3})",
            filename ?? "unknown.png",
            widthMeters,
            heightMeters,
            crs ?? "无坐标系"));
        }
      }
      catch (Exception ex)
      {
        logAction("WARN", "命令行通知失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 图片物理尺寸信息
    /// </summary>
    public class ImageDimensions
    {
      public double WidthPx { get; set; }
      public double HeightPx { get; set; }
      public double WidthMm { get; set; }
      public double HeightMm { get; set; }
      public double Dpi { get; set; }
    }

    /// <summary>
    /// 插入操作结果
    /// </summary>
    public class InsertResult
    {
      public bool Success { get; set; }
      public string Message { get; set; }
      public double WidthMm { get; set; }
      public double HeightMm { get; set; }
    }
  }
}
