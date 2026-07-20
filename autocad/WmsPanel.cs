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
      AllowAutoHide = false;

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

      // 将 WebView2 添加到面板
      Add("WMS 地图", webView);

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
        await webView.EnsureCoreWebView2Async();
      }
      catch (Exception)
      {
        // 初始化失败，不加载页面
        return;
      }

      // 允许 file:// 协议下的脚本执行
      webView.CoreWebView2.Settings.IsScriptEnabled = true;

      // 创建通信桥并注册消息接收事件
      bridge = new WmsBridge(webView);
      webView.CoreWebView2.WebMessageReceived += bridge.OnWebMessageReceived;

      // 计算 shared/map.html 的绝对路径
      // DLL 位于 autocad/bin/ 下，shared/ 在项目根目录
      string dllDir = Path.GetDirectoryName(typeof(WmsPanel).Assembly.Location);
      string projectRoot = Path.GetFullPath(Path.Combine(dllDir, "..", ".."));
      string htmlPath = Path.Combine(projectRoot, "shared", "map.html");

      if (File.Exists(htmlPath))
      {
        // 使用 file:// 协议加载本地 HTML
        string htmlUri = new Uri(htmlPath).AbsoluteUri;
        webView.CoreWebView2.Navigate(htmlUri);
      }
    }

    /// <summary>
    /// 释放资源
    /// </summary>
    public new void Dispose()
    {
      if (webView != null)
      {
        if (webView.CoreWebView2 != null && bridge != null)
        {
          webView.CoreWebView2.WebMessageReceived -= bridge.OnWebMessageReceived;
        }
        webView.Dispose();
        webView = null;
      }
      bridge = null;
      base.Dispose();
    }
  }
}
