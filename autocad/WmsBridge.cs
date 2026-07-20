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
  public class WmsBridge
  {
    private readonly WebView2 webView;
    private readonly JavaScriptSerializer jsonSerializer;
    private readonly string logFilePath;
    private readonly string layersJsonPath;
    private readonly object logLock = new object();

    /// <summary>
    /// 创建通信桥实例
    /// </summary>
    /// <param name="webView">WebView2 控件引用</param>
    public WmsBridge(WebView2 webView)
    {
      this.webView = webView ?? throw new ArgumentNullException(nameof(webView));
      this.jsonSerializer = new JavaScriptSerializer();
      this.jsonSerializer.MaxJsonLength = int.MaxValue;

      // 日志文件路径：DLL 所在目录下的 logs/autocad-plugin.log
      string dllDir = Path.GetDirectoryName(typeof(WmsBridge).Assembly.Location);
      string logDir = Path.Combine(dllDir, "logs");
      if (!Directory.Exists(logDir))
      {
        Directory.CreateDirectory(logDir);
      }
      this.logFilePath = Path.Combine(logDir, "autocad-plugin.log");

      // layers.json 路径：项目根目录 shared/layers.json
      // DLL 位于 autocad/bin/ 下，shared/ 在项目根目录
      string projectRoot = Path.GetFullPath(Path.Combine(dllDir, "..", ".."));
      this.layersJsonPath = Path.Combine(projectRoot, "shared", "layers.json");
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
          WriteLog("WARN", "收到无效消息: " + messageJson);
          return;
        }

        string type = message["type"] as string;
        if (string.IsNullOrEmpty(type))
        {
          WriteLog("WARN", "消息缺少 type 字段");
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
          default:
            WriteLog("WARN", "未知消息类型: " + type);
            break;
        }
      }
      catch (Exception ex)
      {
        WriteLog("ERROR", "处理 WebMessage 异常: " + ex.Message);
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
        WriteLog("WARN", "WebView2 未初始化，无法发送消息到 JS");
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
        WriteLog("ERROR", "SendToJs 失败: " + ex.Message);
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
          WriteLog("ERROR", "layers.json 不存在: " + layersJsonPath);
          SendToJs(jsonSerializer.Serialize(new { type = "error", message = "配置文件不存在" }));
          return;
        }

        string jsonContent = File.ReadAllText(layersJsonPath, Encoding.UTF8);
        // 解析验证 JSON 格式
        var config = jsonSerializer.Deserialize<Dictionary<string, object>>(jsonContent);
        if (config == null)
        {
          WriteLog("ERROR", "layers.json 解析失败");
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
        WriteLog("INFO", "已发送 layers.json 配置到前端");
      }
      catch (Exception ex)
      {
        WriteLog("ERROR", "发送 layers.json 失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 处理前端就绪消息：发送 layers.json 配置
    /// </summary>
    private void HandleReady(Dictionary<string, object> message)
    {
      WriteLog("INFO", "前端已就绪，发送配置");
      SendLayersConfig();
    }

    /// <summary>
    /// 处理日志消息：写入日志文件
    /// </summary>
    private void HandleLog(Dictionary<string, object> message)
    {
      string level = message.ContainsKey("level") ? message["level"] as string : "INFO";
      string msg = message.ContainsKey("message") ? message["message"] as string : "";
      WriteLog(level ?? "INFO", "[JS] " + (msg ?? ""));
    }

    /// <summary>
    /// 处理错误消息：显示 AutoCAD 状态栏提示
    /// </summary>
    private void HandleError(Dictionary<string, object> message)
    {
      string errorMsg = message.ContainsKey("message") ? message["message"] as string : "未知错误";
      WriteLog("ERROR", "[JS] " + errorMsg);

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
        WriteLog("ERROR", "显示状态栏提示失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 处理图片消息：保存 base64 图片数据
    /// </summary>
    private void HandleImage(Dictionary<string, object> message)
    {
      string base64Data = message.ContainsKey("data") ? message["data"] as string : null;
      string filename = message.ContainsKey("filename") ? message["filename"] as string : "output.png";

      if (string.IsNullOrEmpty(base64Data))
      {
        WriteLog("WARN", "收到空图片数据");
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
        WriteLog("INFO", "图片已保存: " + outputPath);

        // 通知前端保存成功
        var result = new Dictionary<string, object>
        {
          { "type", "imageSaved" },
          { "path", outputPath }
        };
        SendToJs(jsonSerializer.Serialize(result));
      }
      catch (Exception ex)
      {
        WriteLog("ERROR", "保存图片失败: " + ex.Message);
      }
    }

    /// <summary>
    /// 写入日志文件
    /// 格式：[timestamp] [level] message
    /// </summary>
    private void WriteLog(string level, string message)
    {
      try
      {
        string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
        string logLine = string.Format("[{0}] [{1}] {2}", timestamp, level, message);

        lock (logLock)
        {
          File.AppendAllText(logFilePath, logLine + Environment.NewLine, Encoding.UTF8);
        }
      }
      catch
      {
        // 日志写入失败不应影响主流程
      }
    }
  }
}
