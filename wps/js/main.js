/**
 * WMS 地图插件 - WPS JSAPI 主入口
 *
 * 负责插件初始化、Ribbon 按钮事件绑定、任务窗格管理、
 * 图层配置读取、iframe 通信、日志转发
 */

(function () {
  "use strict";

  // 插件状态
  var pluginState = {
    initialized: false,
    taskpaneVisible: false,
    layersConfig: null
  };

  // 日志文件路径（相对于插件目录）
  var LOG_FILE = "wps-plugin.log";

  /**
   * 写入日志到文件和控制台
   * @param {string} level - 日志级别 (INFO/WARN/ERROR)
   * @param {string} message - 日志内容
   */
  function writeLog(level, message) {
    var timestamp = new Date().toISOString();
    var logLine = "[" + timestamp + "] [" + level + "] " + message + "\n";

    // 控制台输出
    console.log("[WMS Plugin] " + logLine.trim());

    // 尝试使用 WPS FileSystem API 写入日志文件
    try {
      if (typeof wps !== "undefined" && wps.FileSystem) {
        var pluginPath = wps.FileSystem.GetCurrentPluginPath();
        var logPath = pluginPath + "/" + LOG_FILE;
        // 追加写入
        wps.FileSystem.AppendToFile(logPath, logLine);
      }
    } catch (e) {
      // WPS FileSystem API 不可用时，仅使用 console
      // 不抛出异常，避免影响主流程
    }
  }

  /**
   * 插件初始化
   */
  function initPlugin() {
    if (pluginState.initialized) {
      return;
    }

    writeLog("INFO", "插件初始化...");
    pluginState.initialized = true;
    writeLog("INFO", "插件初始化完成");
  }

  /**
   * 读取图层配置文件
   * @returns {Promise<object>} 解析后的图层配置
   */
  function loadLayersConfig() {
    if (pluginState.layersConfig) {
      return Promise.resolve(pluginState.layersConfig);
    }

    return fetch("../shared/layers.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("layers.json 加载失败: " + response.status);
        }
        return response.json();
      })
      .then(function (config) {
        pluginState.layersConfig = config;
        writeLog("INFO", "图层配置加载成功，共 " + config.services.length + " 个服务");
        return config;
      })
      .catch(function (err) {
        writeLog("ERROR", "图层配置加载失败: " + err.message);
        throw err;
      });
  }

  /**
   * 向 iframe 发送图层配置
   * @param {HTMLIFrameElement} iframe - 目标 iframe
   * @param {object} config - 图层配置
   */
  function sendConfigToIframe(iframe, config) {
    if (!iframe || !iframe.contentWindow) {
      writeLog("WARN", "iframe 不可用，无法发送配置");
      return;
    }

    iframe.contentWindow.postMessage({
      type: "layers-config",
      data: config
    }, "*");

    writeLog("INFO", "图层配置已发送到 iframe");
  }

  /**
   * 设置 iframe 日志监听
   * 接收 iframe 通过 postMessage 发送的日志
   * @param {Window} source - 消息来源窗口
   */
  function setupLogForwarding() {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || typeof data !== "object") {
        return;
      }

      // 处理来自 iframe 的日志消息
      if (data.type === "log") {
        var level = data.level || "INFO";
        var message = data.message || JSON.stringify(data);
        writeLog(level, "[iframe] " + message);
        return;
      }

      // 处理 iframe 加载完成消息
      if (data.type === "map-ready") {
        writeLog("INFO", "地图 iframe 加载完成");
        updateStatus("地图已就绪");
        hideLoading();
        return;
      }
    });
  }

  /**
   * 隐藏加载提示
   */
  function hideLoading() {
    var overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
    }
  }

  /**
   * 显示加载提示
   */
  function showLoading() {
    var overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
    }
  }

  /**
   * 更新状态栏文本
   * @param {string} text - 状态文本
   */
  function updateStatus(text) {
    var statusBar = document.getElementById("status-bar");
    if (statusBar) {
      statusBar.textContent = text;
    }
  }

  /**
   * 打开地图任务窗格
   * 由 ribbon.xml 中 "打开地图" 按钮的 onAction 调用
   */
  function openMapPane() {
    writeLog("INFO", "openMapPane() 被调用");

    // 通过 WPS JSAPI 创建或显示任务窗格
    try {
      if (typeof wps !== "undefined" && wps.Application) {
        var taskPane = wps.Application.CreateTaskPane(
          "WMS地图",
          "taskpane.html",
          {
            width: 400,
            minWidth: 300,
            visible: true
          }
        );
        pluginState.taskpaneVisible = true;
        writeLog("INFO", "任务窗格已创建/显示");
      } else {
        // 非 WPS 环境（开发调试），直接操作当前页面
        writeLog("WARN", "WPS JSAPI 不可用，使用调试模式");
        pluginState.taskpaneVisible = true;
      }
    } catch (e) {
      writeLog("ERROR", "创建任务窗格失败: " + e.message);
      pluginState.taskpaneVisible = true;
    }

    // 加载图层配置并发送给 iframe
    showLoading();
    updateStatus("正在加载图层配置...");

    loadLayersConfig()
      .then(function (config) {
        var iframe = document.getElementById("map-frame");
        if (iframe) {
          // iframe 可能还在加载，等待 load 事件后发送
          if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
            sendConfigToIframe(iframe, config);
          } else {
            iframe.addEventListener("load", function onLoad() {
              sendConfigToIframe(iframe, config);
              iframe.removeEventListener("load", onLoad);
            });
          }
        }
        updateStatus("图层配置已加载");
      })
      .catch(function (err) {
        updateStatus("配置加载失败: " + err.message);
        hideLoading();
      });
  }

  /**
   * 插入地图图片到幻灯片
   * 由 ribbon.xml 中 "插入地图" 按钮的 onAction 调用
   * Task 18 实现具体逻辑
   */
  function insertMapImage() {
    writeLog("INFO", "insertMapImage() 被调用");
    // TODO: Task 18 实现
  }

  /**
   * 关闭地图任务窗格
   */
  function closeMapPane() {
    writeLog("INFO", "closeMapPane() 被调用");

    try {
      if (typeof wps !== "undefined" && wps.Application) {
        wps.Application.CloseTaskPane("WMS地图");
      }
    } catch (e) {
      writeLog("ERROR", "关闭任务窗格失败: " + e.message);
    }

    pluginState.taskpaneVisible = false;
    updateStatus("就绪");
  }

  /**
   * 获取插件状态
   */
  function getPluginState() {
    return Object.assign({}, pluginState);
  }

  // 将函数注册到全局作用域，供 ribbon.xml 的 onAction 调用
  window.openMapPane = openMapPane;
  window.insertMapImage = insertMapImage;
  window.closeMapPane = closeMapPane;
  window.getPluginState = getPluginState;

  // 设置日志转发（尽早注册）
  setupLogForwarding();

  // 页面加载完成后初始化插件
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlugin);
  } else {
    initPlugin();
  }
})();
