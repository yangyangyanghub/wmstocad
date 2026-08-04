// Logger.cs - 共享日志助手（带单文件轮转）

using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace WmsMapPlugin
{
  /// <summary>
  /// 插件共享日志助手
  /// - 日志文件：DLL 所在目录下的 logs/autocad-plugin.log
  /// - 轮转：写入前检查大小，超过 5MB 时先重命名为 autocad-plugin.old.log（覆盖旧的），再写新文件
  /// - 写入失败静默容错（日志不能搞崩插件），但通过 Debug.WriteLine 兜底，不再是完全无迹可寻的空 catch
  /// </summary>
  public static class Logger
  {
    // 单日志文件最大大小：5MB
    private const long MaxLogFileSize = 5L * 1024 * 1024;

    private static readonly object logLock = new object();
    private static readonly string logFilePath;
    private static readonly string oldLogFilePath;

    static Logger()
    {
      string logPath = null;
      string oldPath = null;
      try
      {
        string dllDir = Path.GetDirectoryName(typeof(Logger).Assembly.Location);
        string logDir = Path.Combine(dllDir, "logs");
        if (!Directory.Exists(logDir))
        {
          Directory.CreateDirectory(logDir);
        }
        logPath = Path.Combine(logDir, "autocad-plugin.log");
        oldPath = Path.Combine(logDir, "autocad-plugin.old.log");
      }
      catch (Exception ex)
      {
        // 日志路径初始化失败不抛异常，后续写日志将直接跳过
        Debug.WriteLine("[WmsMapPlugin] Logger 初始化失败: " + ex);
      }
      logFilePath = logPath;
      oldLogFilePath = oldPath;
    }

    /// <summary>
    /// 写入一行日志
    /// 格式：[timestamp] [level] message
    /// </summary>
    public static void Write(string level, string message)
    {
      try
      {
        if (string.IsNullOrEmpty(logFilePath)) return;

        string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
        string logLine = string.Format("[{0}] [{1}] {2}", timestamp, level, message);

        lock (logLock)
        {
          RotateIfNeeded();
          File.AppendAllText(logFilePath, logLine + Environment.NewLine, Encoding.UTF8);
        }
      }
      catch (Exception ex)
      {
        // 日志写入失败不应影响主流程，但保留 Debug 输出兜底
        Debug.WriteLine("[WmsMapPlugin] 日志写入失败: " + ex);
      }
    }

    /// <summary>
    /// 日志文件超过 5MB 时轮转为 autocad-plugin.old.log（覆盖旧的）
    /// </summary>
    private static void RotateIfNeeded()
    {
      if (!File.Exists(logFilePath)) return;
      if (new FileInfo(logFilePath).Length < MaxLogFileSize) return;

      if (File.Exists(oldLogFilePath))
      {
        File.Delete(oldLogFilePath);
      }
      File.Move(logFilePath, oldLogFilePath);
    }
  }
}
