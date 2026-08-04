// WmsMapCommand.cs - AutoCAD 插件入口点

using System;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.Windows;
// Autodesk.AutoCAD.Runtime 命名空间存在 Exception 类，与 System.Exception 冲突，用别名显式指定
using Exception = System.Exception;

namespace WmsMapPlugin
{
    /// <summary>
    /// AutoCAD 插件主入口，实现 IExtensionApplication 接口
    /// </summary>
    public class WmsMapCommand : IExtensionApplication
  {
    // 面板单例，避免重复创建
    private static WmsPanel panel;
    // 动态背景图层管理器
    private static MapBackgroundManager backgroundManager;
    // 插件加载前的 FRAME 值，退出时恢复，避免永久改变用户的图像边框显示设置
    private static int? originalFrameValue;

    /// <summary>
    /// 记录插件首次设置 FRAME 前的系统变量值（供 Terminate 恢复）
    /// </summary>
    public static void RecordOriginalFrame()
    {
      if (originalFrameValue.HasValue) return;
      try
      {
        originalFrameValue = Convert.ToInt32(
          Autodesk.AutoCAD.ApplicationServices.Application.GetSystemVariable("FRAME"));
      }
      catch
      {
        // 无文档上下文或变量不可用时跳过，退出时也不恢复
      }
    }

    /// <summary>
    /// 插件初始化，AutoCAD 加载插件时调用
    /// </summary>
    public void Initialize()
    {
      Logger.Write("INFO", "========== WMS 插件启动 ==========");
      Logger.Write("INFO", "启动时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
      Logger.Write("INFO", "插件版本: 1.0.0");
      RecordOriginalFrame();

      try
      {
        var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
        if (doc != null)
        {
          doc.Editor.WriteMessage("\n[WMS] 插件已加载，输入 WMSMAP 打开地图面板");
          // 背景管理器延迟到 WMSMAP 命令时初始化，避免 CAD 启动时 ViewChanged 触发崩溃
        }
      }
      catch (Exception ex)
      {
        Logger.Write("WARN", "初始化失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 插件关闭时调用
    /// </summary>
    public void Terminate()
    {
      Logger.Write("INFO", "关闭时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
      Logger.Write("INFO", "========== WMS 插件关闭 ==========");

      // 恢复用户原始的 FRAME 设置
      try
      {
        if (originalFrameValue.HasValue)
        {
          Autodesk.AutoCAD.ApplicationServices.Application.SetSystemVariable("FRAME", originalFrameValue.Value);
        }
      }
      catch (Exception ex)
      {
        Logger.Write("WARN", "恢复 FRAME 失败: " + ex.Message);
      }

      try
      {
        backgroundManager?.Dispose();
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "背景管理器释放异常: " + ex.Message);
      }
      backgroundManager = null;

      try
      {
        panel?.Dispose();
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "面板释放异常: " + ex.ToString());
      }
      panel = null;
    }

    /// <summary>
    /// 获取背景管理器实例（供 WmsBridge 调用更新图层列表）
    /// </summary>
    public static MapBackgroundManager GetBackgroundManager()
    {
      return backgroundManager;
    }

    /// <summary>
    /// WMSMAP 命令入口，在 AutoCAD 命令行输入 WMSMAP 触发
    /// </summary>
    [CommandMethod("WMSMAP")]
    public void WmsMapCommandMethod()
    {
      Logger.Write("INFO", "WMSMAP 命令被调用");

      try
      {
        // 首次执行 WMSMAP 时初始化背景管理器（Idle + 命令队列模式）
        if (backgroundManager == null)
        {
          var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
          if (doc != null)
          {
            backgroundManager = new MapBackgroundManager();
            backgroundManager.Initialize(doc);
          }
        }

        if (panel != null)
        {
          // 面板已存在，显示并激活
          panel.Visible = true;
          Logger.Write("INFO", "面板已存在，已激活显示");
          return;
        }

        // 创建新面板实例
        panel = new WmsPanel();
        panel.Visible = true;
        Logger.Write("INFO", "面板已创建并显示");
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "WMSMAP 命令执行异常: " + ex.ToString());
        try
        {
          var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
          if (doc != null)
          {
            doc.Editor.WriteMessage("\n[WMS 错误] 打开面板失败: " + ex.Message);
          }
        }
        catch { }
      }
    }
  }
}
