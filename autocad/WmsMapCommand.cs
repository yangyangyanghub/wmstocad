// WmsMapCommand.cs - AutoCAD 插件入口点
// TODO: 引用 AutoCAD API 后，删除下方 Stubs 区域，改用 using Autodesk.AutoCAD.Runtime;

using System;
using System.IO;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.Windows;

#region AutoCAD API Stubs (临时桩，引用 AutoCAD API 后删除)
namespace Autodesk.AutoCAD.Runtime
{
  /// <summary>
  /// AutoCAD 插件初始化接口桩
  /// </summary>
  public interface IExtensionApplication
  {
    void Initialize();
    void Terminate();
  }

  /// <summary>
  /// AutoCAD 命令注册属性桩
  /// </summary>
  [System.AttributeUsage(System.AttributeTargets.Method)]
  public class CommandMethodAttribute : System.Attribute
  {
    public string CommandName { get; }
    public CommandMethodAttribute(string commandName)
    {
      CommandName = commandName;
    }
  }
}

namespace Autodesk.AutoCAD.ApplicationServices
{
  /// <summary>
  /// AutoCAD 应用程序入口桩
  /// </summary>
  public static class Application
  {
    public static DocumentManager DocumentManager { get; } = new DocumentManager();
  }

  /// <summary>
  /// 文档管理器桩
  /// </summary>
  public class DocumentManager
  {
    public Document MdiActiveDocument { get; } = new Document();
  }

  /// <summary>
  /// 文档桩
  /// </summary>
  public class Document
  {
    public Editor Editor { get; } = new Editor();
  }

  /// <summary>
  /// 编辑器桩，用于在 AutoCAD 命令行输出消息
  /// </summary>
  public class Editor
  {
    public void WriteMessage(string message)
    {
      // 桩实现：实际 AutoCAD 中会在命令行输出
      System.Diagnostics.Debug.WriteLine(message);
    }
  }
}

namespace Autodesk.AutoCAD.Windows
{
  /// <summary>
  /// 停靠位置枚举桩
  /// </summary>
  [System.Flags]
  public enum DockSides
  {
    None = 0,
    Left = 1,
    Right = 2,
    Top = 4,
    Bottom = 8
  }

  /// <summary>
  /// PaletteSet 面板容器桩，模拟 AutoCAD 侧边栏面板行为
  /// </summary>
  public class PaletteSet : System.IDisposable
  {
    public string Name { get; set; }
    public System.Drawing.Size MinimumSize { get; set; }
    public System.Drawing.Size DefaultSize { get; set; }
    public DockSides DockEnabled { get; set; }
    public bool AllowAutoHide { get; set; }
    public bool Visible { get; set; }

    public PaletteSet(string name)
    {
      Name = name;
    }

    public PaletteSet(string name, System.Guid guid)
    {
      Name = name;
    }

    /// <summary>
    /// 添加子控件到面板
    /// </summary>
    public void Add(System.Windows.Forms.Control control)
    {
      // 桩实现：实际 AutoCAD 中会将控件嵌入面板
    }

    /// <summary>
    /// 添加子控件到面板（带标题）
    /// </summary>
    public void Add(string title, System.Windows.Forms.Control control)
    {
      // 桩实现
    }

    public void Dispose()
    {
      // 桩实现
    }
  }
}
#endregion

namespace WmsMapPlugin
{
  /// <summary>
  /// AutoCAD 插件主入口，实现 IExtensionApplication 接口
  /// </summary>
  public class WmsMapCommand : IExtensionApplication
  {
    // 面板单例，避免重复创建
    private static WmsPanel panel;

    // 日志文件路径
    private static string logFilePath;
    private static readonly object logLock = new object();

    /// <summary>
    /// 插件初始化，AutoCAD 加载插件时调用
    /// </summary>
    public void Initialize()
    {
      InitLog();
      WriteLog("INFO", "========== WMS 插件启动 ==========");
      WriteLog("INFO", "启动时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
      WriteLog("INFO", "插件版本: 1.0.0");

      try
      {
        var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
        if (doc != null)
        {
          doc.Editor.WriteMessage("\n[WMS] 插件已加载，输入 WMSMAP 打开地图面板");
        }
      }
      catch (Exception ex)
      {
        WriteLog("WARN", "命令行提示失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 插件关闭时调用
    /// </summary>
    public void Terminate()
    {
      WriteLog("INFO", "关闭时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
      WriteLog("INFO", "========== WMS 插件关闭 ==========");

      try
      {
        panel?.Dispose();
      }
      catch (Exception ex)
      {
        WriteLog("ERROR", "面板释放异常: " + ex.ToString());
      }
      panel = null;
    }

    /// <summary>
    /// WMSMAP 命令入口，在 AutoCAD 命令行输入 WMSMAP 触发
    /// </summary>
    [CommandMethod("WMSMAP")]
    public void WmsMapCommandMethod()
    {
      WriteLog("INFO", "WMSMAP 命令被调用");

      try
      {
        if (panel != null)
        {
          // 面板已存在，显示并激活
          panel.Visible = true;
          WriteLog("INFO", "面板已存在，已激活显示");
          return;
        }

        // 创建新面板实例
        panel = new WmsPanel();
        panel.Visible = true;
        WriteLog("INFO", "面板已创建并显示");
      }
      catch (Exception ex)
      {
        WriteLog("ERROR", "WMSMAP 命令执行异常: " + ex.ToString());
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

    /// <summary>
    /// 初始化日志文件路径
    /// </summary>
    private static void InitLog()
    {
      try
      {
        string dllDir = Path.GetDirectoryName(typeof(WmsMapCommand).Assembly.Location);
        string logDir = Path.Combine(dllDir, "logs");
        if (!Directory.Exists(logDir))
        {
          Directory.CreateDirectory(logDir);
        }
        logFilePath = Path.Combine(logDir, "autocad-plugin.log");
      }
      catch
      {
        // 日志初始化失败不影响主流程
      }
    }

    /// <summary>
    /// 写入日志文件
    /// </summary>
    private static void WriteLog(string level, string message)
    {
      try
      {
        if (string.IsNullOrEmpty(logFilePath)) return;
        string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
        string logLine = string.Format("[{0}] [{1}] {2}", timestamp, level, message);
        lock (logLock)
        {
          File.AppendAllText(logFilePath, logLine + Environment.NewLine, System.Text.Encoding.UTF8);
        }
      }
      catch
      {
        // 日志写入失败不应影响主流程
      }
    }
  }
}
