// WmsMapCommand.cs - AutoCAD 插件入口点
// TODO: 引用 AutoCAD API 后，删除下方 Stubs 区域，改用 using Autodesk.AutoCAD.Runtime;

using Autodesk.AutoCAD.Runtime;

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
#endregion

namespace WmsMapPlugin
{
  /// <summary>
  /// AutoCAD 插件主入口，实现 IExtensionApplication 接口
  /// </summary>
  public class WmsMapCommand : IExtensionApplication
  {
    /// <summary>
    /// 插件初始化，AutoCAD 加载插件时调用
    /// </summary>
    public void Initialize()
    {
      // TODO: Task 12 实现 - 初始化 WebView2 面板
    }

    /// <summary>
    /// 插件关闭时调用
    /// </summary>
    public void Terminate()
    {
      // TODO: Task 12 实现 - 清理资源
    }

    /// <summary>
    /// WMSMAP 命令入口，在 AutoCAD 命令行输入 WMSMAP 触发
    /// </summary>
    [CommandMethod("WMSMAP")]
    public void WmsMapCommandMethod()
    {
      // TODO: Task 12 实现 - 显示 WebView2 面板
    }
  }
}
