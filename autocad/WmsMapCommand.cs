// WmsMapCommand.cs - AutoCAD 插件入口点
// TODO: 引用 AutoCAD API 后，删除下方 Stubs 区域，改用 using Autodesk.AutoCAD.Runtime;

using System;
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

    /// <summary>
    /// 插件初始化，AutoCAD 加载插件时调用
    /// </summary>
    public void Initialize()
    {
      // 插件加载时不自动创建面板，等待 WMSMAP 命令触发
    }

    /// <summary>
    /// 插件关闭时调用
    /// </summary>
    public void Terminate()
    {
      panel?.Dispose();
      panel = null;
    }

    /// <summary>
    /// WMSMAP 命令入口，在 AutoCAD 命令行输入 WMSMAP 触发
    /// </summary>
    [CommandMethod("WMSMAP")]
    public void WmsMapCommandMethod()
    {
      if (panel != null)
      {
        // 面板已存在，显示并激活
        panel.Visible = true;
        return;
      }

      // 创建新面板实例
      panel = new WmsPanel();
      panel.Visible = true;
    }
  }
}
