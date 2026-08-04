// WmsPanel.cs - WebView2 面板管理

using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Autodesk.AutoCAD.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WmsMapPlugin
{
  /// <summary>
  /// WebView2 面板，负责在 AutoCAD 中嵌入 Web 界面
  /// 继承 PaletteSet 实现可停靠、可浮动的侧边栏面板
  /// </summary>
  public class WmsPanel : PaletteSet
  {
    private WebView2 webView;
    private WmsBridge bridge;

    /// <summary>
    /// 面板唯一标识 GUID
    /// </summary>
    private static readonly Guid PanelGuid = new Guid("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");

    /// <summary>
    /// 创建 WMS 面板，初始化 WebView2 控件
    /// </summary>
    public WmsPanel() : base("WMS 地图", PanelGuid)
    {
      // 面板属性设置
      MinimumSize = new Size(300, 400);
      DockEnabled = DockSides.Left | DockSides.Right;

      // 创建并初始化 WebView2
      InitializeWebView();
    }

    /// <summary>
    /// 初始化 WebView2 控件并加载 map.html
    /// </summary>
    private void InitializeWebView()
    {
      webView = new WebView2();
      webView.Dock = DockStyle.Fill;
      webView.MinimumSize = new Size(200, 200);

      // 用 Panel 作为中间容器：AutoCAD PaletteSet.Add 内部会调用 ResyncToTheme
      // 尝试设置控件 BackColor 为透明，WebView2 不支持透明背景色会抛 ArgumentException
      // Panel 支持透明背景色，可以吸收主题同步，WebView2 放在 Panel 内部不受影响
      var container = new Panel();
      container.Dock = DockStyle.Fill;
      container.BackColor = Color.White;
      container.Controls.Add(webView);

      // 将中间容器添加到面板
      Add("WMS 地图", container);

      // 异步初始化 WebView2 环境并加载页面
      InitializeWebViewAsync();
    }

    /// <summary>
    /// 异步初始化 WebView2 并加载 HTML 页面
    /// </summary>
    private async void InitializeWebViewAsync()
    {
      try
      {
        // 显式指定用户数据目录到 Temp 下，避免 DLL 所在目录权限不足导致 E_ACCESSDENIED
        // AutoCAD 插件目录可能权限受限，WebView2 需要可写的用户数据目录
        string userDataFolder = Path.Combine(Path.GetTempPath(), "WmsMapPlugin_WebView2");
        if (!Directory.Exists(userDataFolder))
        {
          Directory.CreateDirectory(userDataFolder);
        }
        Logger.Write("INFO", "WebView2 用户数据目录: " + userDataFolder);
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(environment);
      }
      catch (Exception ex)
      {
        // 记录完整异常信息（含 HRESULT、InnerException、堆栈）用于诊断
        Logger.Write("ERROR", "WebView2 初始化失败: " + ex);
        if (ex.InnerException != null)
        {
          Logger.Write("ERROR", "  InnerException: " + ex.InnerException);
        }
        Logger.Write("ERROR", "  HRESULT: 0x" + ex.HResult.ToString("X8"));
        Logger.Write("ERROR", "  StackTrace: " + ex.StackTrace);

        // 初始化失败，显示错误提示
        ShowCrashNotice("地图组件初始化失败: " + ex.Message);
        return;
      }

      // 允许 file:// 协议下的脚本执行
      webView.CoreWebView2.Settings.IsScriptEnabled = true;

      // 注册 WebView2 进程崩溃检测
      webView.CoreWebView2.ProcessFailed += OnWebViewProcessFailed;

      // 创建通信桥并注册消息接收事件
      bridge = new WmsBridge(webView);
      webView.CoreWebView2.WebMessageReceived += bridge.OnWebMessageReceived;

      // 设置背景管理器的视图范围变化回调（推送 CAD 视图范围到前端）
      bridge.SetupBackgroundCallback();

      // 计算 shared/map.html 的绝对路径
      // 部署后 shared/ 在 DLL 同级目录下（Contents/shared/）
      string dllDir = Path.GetDirectoryName(typeof(WmsPanel).Assembly.Location);
      string htmlPath = Path.Combine(dllDir, "shared", "map.html");

      if (File.Exists(htmlPath))
      {
        // 使用 file:// 协议加载本地 HTML
        string htmlUri = new Uri(htmlPath).AbsoluteUri;
        webView.CoreWebView2.Navigate(htmlUri);
      }
      else
      {
        // map.html 缺失：写 ERROR 日志并在面板内显示中文错误页，不再静默空白
        Logger.Write("ERROR", "map.html 文件缺失，期望路径: " + htmlPath);
        webView.CoreWebView2.NavigateToString(BuildMissingHtmlErrorPage(htmlPath));
      }
    }

    /// <summary>
    /// 构建 map.html 缺失时的中文错误提示页
    /// </summary>
    private static string BuildMissingHtmlErrorPage(string expectedPath)
    {
      // 对路径中的特殊字符做 HTML 转义，防止注入
      string safePath = expectedPath
        .Replace("&", "&amp;")
        .Replace("<", "&lt;")
        .Replace(">", "&gt;");
      return "<!DOCTYPE html>"
        + "<html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
        + "<title>WMS 地图 - 文件缺失</title>"
        + "<style>"
        + "body{font-family:'Microsoft YaHei',sans-serif;margin:24px;color:#333;}"
        + "h2{color:#dc3545;font-size:18px;}"
        + "p{font-size:13px;line-height:1.8;}"
        + "code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:12px;word-break:break-all;}"
        + "</style></head><body>"
        + "<h2>地图页面文件缺失</h2>"
        + "<p>未找到地图界面文件 <code>map.html</code>，面板无法正常显示。</p>"
        + "<p>期望路径：<br><code>" + safePath + "</code></p>"
        + "<p>建议：请重新运行安装脚本 <code>install.ps1</code>，或检查插件部署目录是否完整。</p>"
        + "</body></html>";
    }

    /// <summary>
    /// WebView2 进程崩溃回调，显示恢复提示
    /// </summary>
    private void OnWebViewProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
    {
      ShowCrashNotice("地图组件异常，请关闭面板重新打开");
    }

    /// <summary>
    /// 在 AutoCAD 命令行显示崩溃/异常提示
    /// </summary>
    private void ShowCrashNotice(string message)
    {
      try
      {
        var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
        if (doc != null)
        {
          doc.Editor.WriteMessage("\n[WMS] " + message);
        }
      }
      catch
      {
        // 提示失败不影响主流程
      }

      // 同时在面板中显示提示
      try
      {
        if (webView != null && webView.IsHandleCreated)
        {
          webView.Visible = false;
          var noticeLabel = new Label
          {
            Text = message,
            Dock = DockStyle.Fill,
            TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
            Font = new System.Drawing.Font("Microsoft YaHei", 12),
            ForeColor = System.Drawing.Color.DarkRed,
            BackColor = System.Drawing.Color.White
          };
          // 清除现有控件，显示提示标签
          var container = webView.Parent;
          if (container != null)
          {
            container.Controls.Clear();
            container.Controls.Add(noticeLabel);
          }
        }
      }
      catch
      {
        // UI 更新失败不影响主流程
      }
    }

    /// <summary>
    /// 释放资源
    /// </summary>
    public new void Dispose()
    {
      if (webView != null)
      {
        if (webView.CoreWebView2 != null)
        {
          webView.CoreWebView2.ProcessFailed -= OnWebViewProcessFailed;
          if (bridge != null)
          {
            webView.CoreWebView2.WebMessageReceived -= bridge.OnWebMessageReceived;
          }
        }
        webView.Dispose();
        webView = null;
      }
      if (bridge != null)
      {
        bridge.Dispose();
        bridge = null;
      }
      base.Dispose();
    }
  }
}
