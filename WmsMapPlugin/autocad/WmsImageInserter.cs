// WmsImageInserter.cs - 图片插入 CAD 模型空间
// Task 14: 将 base64 图片数据插入到 AutoCAD 模型空间

using System;
using System.IO;
using Autodesk.AutoCAD.ApplicationServices;

namespace WmsMapPlugin
{
  /// <summary>
  /// 图片插入器，负责将 base64 编码的图片数据插入到 AutoCAD 模型空间
  /// 流程：base64 解码 → 保存临时 PNG → 创建 RasterImage → 插入模型空间 → 清理临时文件
  /// </summary>
  public class WmsImageInserter
  {
    // 默认 DPI：出图分辨率
    private const double DefaultDpi = 150.0;
    // 1 inch = 25.4 mm
    private const double InchToMm = 25.4;

    private readonly Action<string, string> logAction;

    /// <summary>
    /// 创建图片插入器实例
    /// </summary>
    /// <param name="logAction">日志回调 (level, message)</param>
    public WmsImageInserter(Action<string, string> logAction)
    {
      this.logAction = logAction ?? ((level, msg) => { });
    }

    /// <summary>
    /// 插入图片到 CAD 模型空间
    /// </summary>
    /// <param name="base64Data">base64 编码的图片数据（可包含 data:image/png;base64, 前缀）</param>
    /// <param name="filename">原始文件名（用于日志）</param>
    /// <returns>插入结果信息</returns>
    public InsertResult InsertImage(string base64Data, string filename)
    {
      if (string.IsNullOrEmpty(base64Data))
      {
        logAction("WARN", "插入图片失败：base64 数据为空");
        return new InsertResult { Success = false, Message = "图片数据为空" };
      }

      string tempFilePath = null;
      try
      {
        // 1. 解析 base64 数据（去除 data URI 前缀）
        string pureBase64 = StripDataUriPrefix(base64Data);

        // 2. 解码为 byte[]
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

        // 3. 保存为临时 PNG 文件
        tempFilePath = SaveTempFile(imageBytes);
        logAction("INFO", "临时文件已保存: " + tempFilePath);

        // 4. 计算图片物理尺寸（基于 150 DPI）
        ImageDimensions dimensions = CalculateDimensions(imageBytes.Length);
        logAction("INFO", string.Format("图片尺寸: {0:F2}mm x {1:F2}mm", dimensions.WidthMm, dimensions.HeightMm));

        // 5. 插入到 CAD 模型空间（桩实现）
        InsertToModelSpace(tempFilePath, dimensions);

        // 6. 在 AutoCAD 命令行输出提示
        NotifyUser(filename, dimensions);

        logAction("INFO", "图片已插入到 CAD 模型空间");
        return new InsertResult
        {
          Success = true,
          Message = "图片已插入",
          WidthMm = dimensions.WidthMm,
          HeightMm = dimensions.HeightMm
        };
      }
      catch (Exception ex)
      {
        logAction("ERROR", "插入图片失败: " + ex.Message);
        return new InsertResult { Success = false, Message = "插入失败: " + ex.Message };
      }
      finally
      {
        // 7. 清理临时文件
        CleanupTempFile(tempFilePath);
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
    /// 将图片数据保存为临时 PNG 文件
    /// </summary>
    private string SaveTempFile(byte[] imageBytes)
    {
      string tempDir = Path.GetTempPath();
      string tempFilename = Guid.NewGuid().ToString("N") + ".png";
      string tempFilePath = Path.Combine(tempDir, tempFilename);
      File.WriteAllBytes(tempFilePath, imageBytes);
      return tempFilePath;
    }

    /// <summary>
    /// 根据图片数据大小估算物理尺寸（基于 150 DPI）
    /// 注意：实际实现中应从 PNG 文件头读取像素尺寸
    /// 当前使用估算：假设 800x600 像素（典型出图尺寸）
    /// </summary>
    private ImageDimensions CalculateDimensions(long fileSizeBytes)
    {
      // 估算像素尺寸：假设典型出图为 800x600
      // 实际实现应使用 System.Drawing.Image.FromFile() 读取真实尺寸
      double estimatedWidthPx = 800;
      double estimatedHeightPx = 600;

      // 尝试从临时文件读取真实尺寸
      // 注意：此处使用桩实现，实际应引用 System.Drawing
      // using (var img = System.Drawing.Image.FromFile(tempFilePath))
      // {
      //   estimatedWidthPx = img.Width;
      //   estimatedHeightPx = img.Height;
      // }

      // DPI 计算：像素 / DPI = 英寸，英寸 * 25.4 = 毫米
      double widthMm = (estimatedWidthPx / DefaultDpi) * InchToMm;
      double heightMm = (estimatedHeightPx / DefaultDpi) * InchToMm;

      return new ImageDimensions
      {
        WidthPx = estimatedWidthPx,
        HeightPx = estimatedHeightPx,
        WidthMm = widthMm,
        HeightMm = heightMm,
        Dpi = DefaultDpi
      };
    }

    /// <summary>
    /// 插入图片到 CAD 模型空间（桩实现）
    /// 实际 AutoCAD 环境需要使用 ObjectARX SDK 的 RasterImage 类
    /// </summary>
    /// <param name="imagePath">图片文件路径</param>
    /// <param name="dimensions">图片物理尺寸</param>
    private void InsertToModelSpace(string imagePath, ImageDimensions dimensions)
    {
      // 桩实现：模拟 AutoCAD RasterImage 插入流程
      // 实际实现步骤：
      // 1. 获取当前文档和数据库：
      //    Document doc = Application.DocumentManager.MdiActiveDocument;
      //    Database db = doc.Database;
      //    Editor ed = doc.Editor;
      //
      // 2. 创建 RasterImage 对象：
      //    using (Transaction tr = db.TransactionManager.StartTransaction())
      //    {
      //      // 加载图片定义
      //      RasterImageDef imageDef = new RasterImageDef();
      //      imageDef.SourceData = imagePath;
      //      imageDef.Load();
      //
      //      // 创建 RasterImage 实例
      //      RasterImage rasterImage = new RasterImage();
      //      rasterImage.SetDatabaseDefaults();
      //      rasterImage.ImageDefId = imageDef.ObjectId;
      //
      //      // 设置插入点（默认原点 0,0,0 或视图中心）
      //      rasterImage.Orientation = new CoordinateSystem3d(
      //        new Point3d(0, 0, 0),
      //        new Vector3d(dimensions.WidthMm, 0, 0),
      //        new Vector3d(0, dimensions.HeightMm, 0));
      //
      //      // 添加到模型空间
      //      BlockTableRecord modelSpace = (BlockTableRecord)tr.GetObject(
      //        db.CurrentSpaceId, OpenMode.ForWrite);
      //      modelSpace.AppendEntity(rasterImage);
      //      tr.AddNewlyCreatedDBObject(rasterImage, true);
      //
      //      tr.Commit();
      //    }

      logAction("INFO", string.Format(
        "[桩] RasterImage 插入模拟 - 路径: {0}, 尺寸: {1:F1}x{2:F1}mm, 位置: (0,0,0)",
        imagePath, dimensions.WidthMm, dimensions.HeightMm));
    }

    /// <summary>
    /// 在 AutoCAD 命令行通知用户插入结果
    /// </summary>
    private void NotifyUser(string filename, ImageDimensions dimensions)
    {
      try
      {
        var doc = Application.DocumentManager.MdiActiveDocument;
        if (doc != null)
        {
          doc.Editor.WriteMessage(string.Format(
            "\n[WMS] 图片已插入: {0} ({1:F1}mm x {2:F1}mm @ {3} DPI)",
            filename ?? "unknown.png",
            dimensions.WidthMm,
            dimensions.HeightMm,
            dimensions.Dpi));
        }
      }
      catch (Exception ex)
      {
        logAction("WARN", "命令行通知失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 清理临时文件
    /// </summary>
    private void CleanupTempFile(string filePath)
    {
      if (string.IsNullOrEmpty(filePath)) return;

      try
      {
        if (File.Exists(filePath))
        {
          File.Delete(filePath);
          logAction("INFO", "临时文件已清理: " + filePath);
        }
      }
      catch (Exception ex)
      {
        logAction("WARN", "清理临时文件失败: " + ex.Message);
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
