// WmsBridge.cs - C# 与 JavaScript 双向通信桥

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using Autodesk.AutoCAD.ApplicationServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WmsMapPlugin
{
  /// <summary>
  /// C# 与 JavaScript 之间的通信桥
  /// 负责：
  /// - C# 调用 JS 函数（通过 ExecuteScriptAsync）
  /// - JS 调用 C# 方法（通过 WebMessageReceived）
  /// - 数据序列化/反序列化（JSON）
  /// - 日志写入
  /// - layers.json 配置读取与发送
  /// </summary>
  public class WmsBridge : IDisposable
  {
    private readonly WebView2 webView;
    private readonly JavaScriptSerializer jsonSerializer;
    private readonly string layersJsonPath;
    private readonly WmsImageInserter imageInserter;
    private FileSystemWatcher layersWatcher;
    private DateTime lastLayersNotify = DateTime.MinValue;

    /// <summary>
    /// 创建通信桥实例
    /// </summary>
    /// <param name="webView">WebView2 控件引用</param>
    public WmsBridge(WebView2 webView)
    {
      this.webView = webView ?? throw new ArgumentNullException(nameof(webView));
      this.jsonSerializer = new JavaScriptSerializer();
      this.jsonSerializer.MaxJsonLength = int.MaxValue;

      // layers.json 路径：部署后 shared/ 在 DLL 同级目录下（Contents/shared/）
      string dllDir = Path.GetDirectoryName(typeof(WmsBridge).Assembly.Location);
      this.layersJsonPath = Path.Combine(dllDir, "shared", "layers.json");

      // 初始化图片插入器，日志回调走共享 Logger
      this.imageInserter = new WmsImageInserter((level, msg) => Logger.Write(level, msg));

      // 启动 layers.json 文件监控
      StartLayersWatcher();
    }

    /// <summary>
    /// 处理从 JS 接收到的 WebMessage 事件
    /// </summary>
    public void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
      try
      {
        string messageJson = e.WebMessageAsJson;
        // WebView2 返回的 JSON 是带引号的字符串，需要去掉外层引号
        if (messageJson.StartsWith("\"") && messageJson.EndsWith("\""))
        {
          messageJson = jsonSerializer.Deserialize<string>(messageJson);
        }

        var message = jsonSerializer.Deserialize<Dictionary<string, object>>(messageJson);
        if (message == null || !message.ContainsKey("type"))
        {
          Logger.Write("WARN", "收到无效消息: " + messageJson);
          return;
        }

        string type = message["type"] as string;
        if (string.IsNullOrEmpty(type))
        {
          Logger.Write("WARN", "消息缺少 type 字段");
          return;
        }

        switch (type)
        {
          case "ready":
            HandleReady(message);
            break;
          case "log":
            HandleLog(message);
            break;
          case "error":
            HandleError(message);
            break;
          case "image":
            HandleImage(message);
            break;
          case "insertImage":
            HandleInsertImage(message);
            break;
          case "refresh":
            HandleRefresh(message);
            break;
          case "layersChanged":
            HandleLayersChanged(message);
            break;
          case "backgroundImage":
            HandleBackgroundImage(message);
            break;
          default:
            Logger.Write("WARN", "未知消息类型: " + type);
            break;
        }
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "处理 WebMessage 异常: " + ex.ToString());
      }
    }

    /// <summary>
    /// 发送 JSON 数据到前端 JS
    /// 通过 ExecuteScriptAsync 调用 window.receiveFromHost(json)
    /// </summary>
    /// <param name="json">要发送的 JSON 字符串</param>
    public void SendToJs(string json)
    {
      if (webView == null || webView.CoreWebView2 == null)
      {
        Logger.Write("WARN", "WebView2 未初始化，无法发送消息到 JS");
        return;
      }

      try
      {
        // 将 JSON 转义为 JS 字符串参数
        string escapedJson = jsonSerializer.Serialize(json);
        string script = "window.receiveFromHost(" + escapedJson + ");";
        webView.CoreWebView2.ExecuteScriptAsync(script);
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "SendToJs 失败: " + ex.ToString());
      }
    }

    /// <summary>
    /// 读取 layers.json 并发送给前端
    /// </summary>
    public void SendLayersConfig()
    {
      try
      {
        if (!File.Exists(layersJsonPath))
        {
          Logger.Write("ERROR", "layers.json 不存在: " + layersJsonPath);
          SendToJs(jsonSerializer.Serialize(new { type = "error", message = "配置文件不存在" }));
          return;
        }

        string jsonContent = File.ReadAllText(layersJsonPath, Encoding.UTF8);
        // 解析验证 JSON 格式
        var config = jsonSerializer.Deserialize<Dictionary<string, object>>(jsonContent);
        if (config == null)
        {
          Logger.Write("ERROR", "layers.json 解析失败");
          return;
        }

        // 构造发送给前端的消息
        var message = new Dictionary<string, object>
        {
          { "type", "config" },
          { "data", config }
        };
        string messageJson = jsonSerializer.Serialize(message);
        SendToJs(messageJson);
        Logger.Write("INFO", "已发送 layers.json 配置到前端");
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "发送 layers.json 失败: " + ex.ToString());
      }
    }

    /// <summary>
    /// 处理前端就绪消息：发送 layers.json 配置
    /// </summary>
    private void HandleReady(Dictionary<string, object> message)
    {
      Logger.Write("INFO", "前端已就绪，发送配置");
      SendLayersConfig();
    }

    /// <summary>
    /// 处理日志消息：写入日志文件
    /// </summary>
    private void HandleLog(Dictionary<string, object> message)
    {
      string level = message.ContainsKey("level") ? message["level"] as string : "INFO";
      string msg = message.ContainsKey("message") ? message["message"] as string : "";
      Logger.Write(level ?? "INFO", "[JS] " + (msg ?? ""));
    }

    /// <summary>
    /// 处理错误消息：显示 AutoCAD 状态栏提示
    /// </summary>
    private void HandleError(Dictionary<string, object> message)
    {
      string errorMsg = message.ContainsKey("message") ? message["message"] as string : "未知错误";
      Logger.Write("ERROR", "[JS] " + errorMsg);

      // 在 AutoCAD 状态栏显示提示
      try
      {
        var doc = Application.DocumentManager.MdiActiveDocument;
        if (doc != null)
        {
          doc.Editor.WriteMessage("\n[WMS 错误] " + errorMsg);
        }
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "显示状态栏提示失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 处理图片消息：保存 base64 图片数据并插入 CAD 模型空间
    /// </summary>
    private void HandleImage(Dictionary<string, object> message)
    {
      string base64Data = message.ContainsKey("data") ? message["data"] as string : null;
      string filename = message.ContainsKey("filename") ? message["filename"] as string : "output.png";
      bool autoInsert = message.ContainsKey("autoInsert") && Convert.ToBoolean(message["autoInsert"]);

      if (string.IsNullOrEmpty(base64Data))
      {
        Logger.Write("WARN", "收到空图片数据");
        return;
      }

      // 清洗 filename：剥离目录部分，防止路径注入（如 "..\..\evil.png" 被剥成 "evil.png"）
      filename = Path.GetFileName(filename);
      if (string.IsNullOrEmpty(filename) || filename.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
      {
        Logger.Write("WARN", "非法的 filename，已拒绝保存图片");
        return;
      }

      try
      {
        // 解析 base64 数据（可能包含 data:image/png;base64, 前缀）
        string pureBase64 = base64Data;
        if (base64Data.Contains(","))
        {
          pureBase64 = base64Data.Substring(base64Data.IndexOf(",") + 1);
        }

        byte[] imageBytes = Convert.FromBase64String(pureBase64);

        // 保存到 DLL 所在目录下的 output/ 文件夹
        string dllDir = Path.GetDirectoryName(typeof(WmsBridge).Assembly.Location);
        string outputDir = Path.Combine(dllDir, "output");
        if (!Directory.Exists(outputDir))
        {
          Directory.CreateDirectory(outputDir);
        }

        string outputPath = Path.Combine(outputDir, filename);
        File.WriteAllBytes(outputPath, imageBytes);
        Logger.Write("INFO", "图片已保存: " + outputPath);

        // 构造返回结果
        var result = new Dictionary<string, object>
        {
          { "type", "imageSaved" },
          { "path", outputPath }
        };

        // 如果 autoInsert 为 true 或消息来自"插入地图"按钮，则插入到 CAD
        if (autoInsert)
        {
          var insertResult = imageInserter.InsertImage(base64Data, filename,
            null, null, null, null, null, 800, 600);
          result["inserted"] = insertResult.Success;
          result["insertMessage"] = insertResult.Message;
          if (insertResult.Success)
          {
            result["widthMm"] = insertResult.WidthMm;
            result["heightMm"] = insertResult.HeightMm;
          }
        }

        SendToJs(jsonSerializer.Serialize(result));
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "保存图片失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 处理插入图片到 CAD 消息：将 base64 图片数据插入到模型空间
    /// </summary>
    private void HandleInsertImage(Dictionary<string, object> message)
    {
      Logger.Write("INFO", "收到 insertImage 消息，开始插入图片到 CAD");
      string base64Data = message.ContainsKey("data") ? message["data"] as string : null;
      string filename = message.ContainsKey("filename") ? message["filename"] as string : "insert.png";

      if (string.IsNullOrEmpty(base64Data))
      {
        Logger.Write("WARN", "插入图片消息缺少数据");
        SendToJs(jsonSerializer.Serialize(new Dictionary<string, object>
        {
          { "type", "insertResult" },
          { "success", false },
          { "message", "图片数据为空" }
        }));
        return;
      }

      // 解析地理范围信息（用于 CAD 地理配准插入）
      double? geoMinX = null, geoMinY = null, geoMaxX = null, geoMaxY = null;
      string crs = null;
      int imgWidth = 800, imgHeight = 600;

      if (message.ContainsKey("geoBounds") && message["geoBounds"] is Dictionary<string, object> geoBounds)
      {
        geoMinX = ParseDouble(geoBounds, "minX");
        geoMinY = ParseDouble(geoBounds, "minY");
        geoMaxX = ParseDouble(geoBounds, "maxX");
        geoMaxY = ParseDouble(geoBounds, "maxY");
        Logger.Write("INFO", string.Format("地理范围: ({0:F2},{1:F2})-({2:F2},{3:F2})",
          geoMinX ?? 0, geoMinY ?? 0, geoMaxX ?? 0, geoMaxY ?? 0));
      }
      if (message.ContainsKey("crs"))
      {
        crs = message["crs"] as string;
        Logger.Write("INFO", "坐标系: " + crs);
      }
      if (message.ContainsKey("width") && message["width"] != null)
      {
        int.TryParse(message["width"].ToString(), out imgWidth);
      }
      if (message.ContainsKey("height") && message["height"] != null)
      {
        int.TryParse(message["height"].ToString(), out imgHeight);
      }

      try
      {
        var insertResult = imageInserter.InsertImage(base64Data, filename,
          geoMinX, geoMinY, geoMaxX, geoMaxY, crs, imgWidth, imgHeight);

        var result = new Dictionary<string, object>
        {
          { "type", "insertResult" },
          { "success", insertResult.Success },
          { "message", insertResult.Message }
        };

        if (insertResult.Success)
        {
          result["widthMm"] = insertResult.WidthMm;
          result["heightMm"] = insertResult.HeightMm;
        }

        SendToJs(jsonSerializer.Serialize(result));
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "插入图片失败: " + ex.Message);
        SendToJs(jsonSerializer.Serialize(new Dictionary<string, object>
        {
          { "type", "insertResult" },
          { "success", false },
          { "message", "插入失败: " + ex.Message }
        }));
      }
    }

    /// <summary>
    /// 从字典中安全解析 double 值
    /// </summary>
    private static double? ParseDouble(Dictionary<string, object> dict, string key)
    {
      if (!dict.ContainsKey(key) || dict[key] == null) return null;
      double val;
      if (double.TryParse(dict[key].ToString(), out val)) return val;
      return null;
    }

    /// <summary>
    /// 处理前端刷新配置请求：重新读取 layers.json 并发送
    /// </summary>
    private void HandleRefresh(Dictionary<string, object> message)
    {
      Logger.Write("INFO", "收到前端刷新配置请求");
      SendLayersConfig();
    }

    /// <summary>
    /// 处理前端图层可见性变化消息：更新 C# 端活动图层列表，触发 TransientManager 动态背景刷新
    /// 消息格式: { type: 'layersChanged', layers: [{url, layerName, crs, format}, ...] }
    /// </summary>
    private void HandleLayersChanged(Dictionary<string, object> message)
    {
      try
      {
        var layers = new List<WmsLayerInfo>();

        if (message.ContainsKey("layers") && message["layers"] is System.Collections.ArrayList arrList)
        {
          foreach (var item in arrList)
          {
            var dict = item as Dictionary<string, object>;
            if (dict == null) continue;

            layers.Add(new WmsLayerInfo
            {
              Url = dict.ContainsKey("url") ? dict["url"] as string : "",
              LayerName = dict.ContainsKey("layerName") ? dict["layerName"] as string : "",
              Crs = dict.ContainsKey("crs") ? dict["crs"] as string : "EPSG:4490",
              Format = dict.ContainsKey("format") ? dict["format"] as string : "image/png"
            });
          }
        }

        Logger.Write("INFO", "收到 layersChanged 消息: " + layers.Count + " 个可见图层");

        // 更新背景管理器的活动图层列表
        var bgManager = WmsMapCommand.GetBackgroundManager();
        if (bgManager != null)
        {
          bgManager.UpdateActiveLayers(layers);
        }
        else
        {
          Logger.Write("WARN", "背景管理器未初始化，无法更新图层");
        }
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "处理 layersChanged 失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 处理前端发来的背景图片（WMS 影像 base64），更新 TransientManager 动态背景
    /// 消息格式: { type: 'backgroundImage', data: base64, minX, minY, width, height }
    /// </summary>
    private void HandleBackgroundImage(Dictionary<string, object> message)
    {
      try
      {
        string base64Data = message.ContainsKey("data") ? message["data"] as string : null;
        if (string.IsNullOrEmpty(base64Data))
        {
          Logger.Write("WARN", "backgroundImage 消息缺少 data");
          return;
        }

        double minX = ParseDouble(message, "minX") ?? 0;
        double minY = ParseDouble(message, "minY") ?? 0;
        double width = ParseDouble(message, "width") ?? 0;
        double height = ParseDouble(message, "height") ?? 0;

        var bgManager = WmsMapCommand.GetBackgroundManager();
        if (bgManager != null)
        {
          bgManager.UpdateBackgroundFromBase64(base64Data, minX, minY, width, height);
        }
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "处理 backgroundImage 失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 设置背景管理器的视图范围变化回调（推送 CAD 视图范围到前端）
    /// 在 WmsPanel 初始化 WebView2 后调用
    /// </summary>
    public void SetupBackgroundCallback()
    {
      var bgManager = WmsMapCommand.GetBackgroundManager();
      if (bgManager == null || webView == null || webView.CoreWebView2 == null) return;

      bgManager.ViewBoundsChangedHandler = (minX, minY, maxX, maxY, crs) =>
      {
        try
        {
          // Timer 回调在后台线程，WebView2 必须在 UI 线程访问
          // 用 Control.Invoke 封送到 UI 线程
          if (webView.InvokeRequired)
          {
            webView.Invoke(new Action(() =>
            {
              PushViewBoundsScript(minX, minY, maxX, maxY, crs);
            }));
          }
          else
          {
            PushViewBoundsScript(minX, minY, maxX, maxY, crs);
          }
        }
        catch (Exception ex)
        {
          Logger.Write("ERROR", "推送视图范围到前端失败: " + ex.Message);
        }
      };

      Logger.Write("INFO", "背景管理器视图范围回调已设置");
    }

    /// <summary>
    /// 在 UI 线程上推送视图范围脚本到前端
    /// </summary>
    private void PushViewBoundsScript(double minX, double minY, double maxX, double maxY, string crs)
    {
      if (webView == null || webView.CoreWebView2 == null) return;
      string script = string.Format(
        "window.wmsAdapter && window.wmsAdapter.onViewChanged && window.wmsAdapter.onViewChanged({0:F6},{1:F6},{2:F6},{3:F6},'{4}');",
        minX, minY, maxX, maxY, crs);
      webView.CoreWebView2.ExecuteScriptAsync(script);
    }

    /// <summary>
    /// 启动 FileSystemWatcher 监控 layers.json 变化
    /// 文件变化时自动重新读取并发送给前端
    /// </summary>
    private void StartLayersWatcher()
    {
      try
      {
        string watchDir = Path.GetDirectoryName(layersJsonPath);
        string watchFile = Path.GetFileName(layersJsonPath);

        if (!Directory.Exists(watchDir))
        {
          Logger.Write("WARN", "layers.json 监控目录不存在: " + watchDir);
          return;
        }

        layersWatcher = new FileSystemWatcher(watchDir, watchFile)
        {
          NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size,
          EnableRaisingEvents = true
        };

        layersWatcher.Changed += OnLayersFileChanged;
        Logger.Write("INFO", "已启动 layers.json 文件监控: " + layersJsonPath);
      }
      catch (Exception ex)
      {
        Logger.Write("WARN", "启动 layers.json 监控失败: " + ex.Message);
      }
    }

    /// <summary>
    /// layers.json 文件变化回调，防抖后重新发送配置到前端
    /// </summary>
    private void OnLayersFileChanged(object sender, FileSystemEventArgs e)
    {
      // 防抖：1 秒内只触发一次
      if ((DateTime.Now - lastLayersNotify).TotalSeconds < 1)
      {
        return;
      }
      lastLayersNotify = DateTime.Now;

      try
      {
        Logger.Write("INFO", "检测到 layers.json 变化，自动刷新配置");
        SendLayersConfig();
      }
      catch (Exception ex)
      {
        Logger.Write("ERROR", "自动刷新配置失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 释放资源，停止文件监控
    /// </summary>
    public void Dispose()
    {
      try
      {
        if (layersWatcher != null)
        {
          layersWatcher.Changed -= OnLayersFileChanged;
          layersWatcher.EnableRaisingEvents = false;
          layersWatcher.Dispose();
          layersWatcher = null;
          Logger.Write("INFO", "layers.json 文件监控已停止");
        }
      }
      catch (Exception ex)
      {
        Logger.Write("WARN", "停止文件监控异常: " + ex.Message);
      }
    }
  }
}
