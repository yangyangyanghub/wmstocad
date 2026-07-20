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
   * 向 iframe 注入图片请求监听器
   * 在 iframe 加载完成后调用，使其能响应 "request-image" 消息
   * @param {HTMLIFrameElement} iframe - 目标 iframe
   */
  function injectImageRequestListener(iframe) {
    try {
      var iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        writeLog("WARN", "iframe.contentWindow 不可用，无法注入监听器");
        return;
      }

      // 检查是否已注入（避免重复注入）
      if (iframeWindow.__wmsImageListenerInjected) {
        return;
      }

      // 在 iframe 上下文中注册 postMessage 监听器
      iframeWindow.addEventListener("message", function (event) {
        var data = event.data;
        if (!data || data.type !== "request-image") return;

        // 调用 shared/js/output.js 暴露的 getMapImageBase64()
        if (typeof iframeWindow.getMapImageBase64 !== "function") {
          iframeWindow.parent.postMessage({
            type: "image-data",
            error: "getMapImageBase64 函数不可用"
          }, "*");
          return;
        }

        iframeWindow.getMapImageBase64()
          .then(function (base64) {
            iframeWindow.parent.postMessage({
              type: "image-data",
              data: base64
            }, "*");
          })
          .catch(function (err) {
            iframeWindow.parent.postMessage({
              type: "image-data",
              error: err.message || "出图失败"
            }, "*");
          });
      });

      iframeWindow.__wmsImageListenerInjected = true;
      writeLog("INFO", "已向 iframe 注入图片请求监听器");
    } catch (e) {
      writeLog("WARN", "注入 iframe 监听器失败（可能跨域）: " + e.message);
    }
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
        invalidateRibbon();
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
            injectImageRequestListener(iframe);
          } else {
            iframe.addEventListener("load", function onLoad() {
              sendConfigToIframe(iframe, config);
              injectImageRequestListener(iframe);
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
   * 向 iframe 请求地图图片（base64）
   * @returns {Promise<string>} base64 数据（data URL 格式）
   */
  function requestImageFromIframe() {
    return new Promise(function (resolve, reject) {
      var iframe = document.getElementById("map-frame");
      if (!iframe || !iframe.contentWindow) {
        reject(new Error("地图 iframe 不可用"));
        return;
      }

      // 一次性监听器，接收 iframe 返回的图片数据
      function onMessage(event) {
        var data = event.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "image-data") {
          window.removeEventListener("message", onMessage);
          if (data.error) {
            reject(new Error(data.error));
          } else if (!data.data) {
            reject(new Error("图片数据为空"));
          } else {
            resolve(data.data);
          }
        }
      }

      window.addEventListener("message", onMessage);

      // 发送请求
      iframe.contentWindow.postMessage({ type: "request-image" }, "*");
      writeLog("INFO", "已向 iframe 请求图片数据");

      // 超时处理（30 秒）
      setTimeout(function () {
        window.removeEventListener("message", onMessage);
        reject(new Error("请求图片超时"));
      }, 30000);
    });
  }

  /**
   * 将 base64 data URL 解码为二进制字节数组
   * @param {string} dataUrl - data:image/png;base64,... 格式
   * @returns {Uint8Array} 二进制数据
   */
  function decodeBase64ToBytes(dataUrl) {
    // 提取 base64 部分（去掉 data:image/xxx;base64, 前缀）
    var commaIndex = dataUrl.indexOf(",");
    var base64 = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 将二进制数据保存为临时文件
   * @param {Uint8Array} bytes - 图片二进制数据
   * @returns {string} 临时文件路径
   */
  function saveTempImage(bytes) {
    var tempDir = wps.Env ? wps.Env.TempPath : (wps.FileSystem ? wps.FileSystem.GetTempPath() : "");
    if (!tempDir) {
      // 回退：使用系统临时目录
      try {
        var shell = new ActiveXObject("WScript.Shell");
        tempDir = shell.ExpandEnvironmentStrings("%TEMP%");
      } catch (e) {
        throw new Error("无法获取临时目录路径");
      }
    }

    var fileName = "wms_map_" + Date.now() + ".png";
    var filePath = tempDir + "\\" + fileName;

    // 使用 WPS FileSystem API 写入
    if (wps.FileSystem && typeof wps.FileSystem.WriteAllBytes === "function") {
      wps.FileSystem.WriteAllBytes(filePath, bytes);
    } else {
      // 回退：使用 ADODB.Stream（WPS 内置支持）
      var stream = new ActiveXObject("ADODB.Stream");
      stream.Type = 1; // adTypeBinary
      stream.Open();
      // Uint8Array 转 VBArray
      var vbArray = new VBArray(bytes);
      stream.Write(vbArray);
      stream.SaveToFile(filePath, 2); // adSaveCreateOverWrite
      stream.Close();
    }

    writeLog("INFO", "临时图片已保存: " + filePath);
    return filePath;
  }

  /**
   * 删除临时文件
   * @param {string} filePath - 文件路径
   */
  function deleteTempFile(filePath) {
    try {
      if (wps.FileSystem && typeof wps.FileSystem.DeleteFile === "function") {
        wps.FileSystem.DeleteFile(filePath);
      } else {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        if (fso.FileExists(filePath)) {
          fso.DeleteFile(filePath, true);
        }
      }
      writeLog("INFO", "临时文件已删除: " + filePath);
    } catch (e) {
      writeLog("WARN", "删除临时文件失败: " + e.message);
    }
  }

  /**
   * 计算图片在幻灯片中的居中位置和尺寸（保持宽高比）
   * @param {number} imgWidth - 图片原始宽度（像素）
   * @param {number} imgHeight - 图片原始高度（像素）
   * @param {object} slideSize - { width, height } 幻灯片尺寸（磅）
   * @returns {object} { left, top, width, height } 插入参数（磅）
   */
  function calcCenteredPosition(imgWidth, imgHeight, slideSize) {
    // 留白边距（磅），避免图片贴边
    var margin = 36; // 0.5 英寸
    var availWidth = slideSize.width - margin * 2;
    var availHeight = slideSize.height - margin * 2;

    // 按宽高比缩放，取较小比例
    var ratioW = availWidth / imgWidth;
    var ratioH = availHeight / imgHeight;
    var scale = Math.min(ratioW, ratioH);

    var displayWidth = imgWidth * scale;
    var displayHeight = imgHeight * scale;

    // 居中
    var left = (slideSize.width - displayWidth) / 2;
    var top = (slideSize.height - displayHeight) / 2;

    return {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(displayWidth),
      height: Math.round(displayHeight)
    };
  }

  /**
   * 插入地图图片到幻灯片
   * 由 ribbon.xml 中 "插入地图" 按钮的 onAction 调用
   */
  function insertMapImage() {
    writeLog("INFO", "insertMapImage() 被调用");

    // 检查任务窗格是否打开
    if (!pluginState.taskpaneVisible) {
      try {
        wps.Alert("请先打开地图任务窗格", "提示", wps.AlertIcon.Information);
      } catch (e) {
        alert("请先打开地图");
      }
      writeLog("WARN", "任务窗格未打开，无法插入地图");
      return;
    }

    updateStatus("正在获取地图图片...");

    requestImageFromIframe()
      .then(function (dataUrl) {
        writeLog("INFO", "收到图片数据，长度: " + dataUrl.length);
        updateStatus("正在处理图片...");

        // 解码 base64
        var bytes = decodeBase64ToBytes(dataUrl);

        // 从 data URL 解析图片尺寸（通过 Image 对象）
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () {
            resolve({ bytes: bytes, imgWidth: img.width, imgHeight: img.height });
          };
          img.onerror = function () {
            // 默认尺寸
            resolve({ bytes: bytes, imgWidth: 800, imgHeight: 600 });
          };
          img.src = dataUrl;
        });
      })
      .then(function (result) {
        // 保存临时文件
        var tempPath = saveTempImage(result.bytes);

        try {
          // 获取当前幻灯片
          var presentation = wps.Application.ActivePresentation;
          var slide = presentation.Slides.CurrentSlide;
          if (!slide) {
            throw new Error("无法获取当前幻灯片");
          }

          // 获取幻灯片尺寸
          var slideWidth = presentation.PageSetup.SlideWidth;
          var slideHeight = presentation.PageSetup.SlideHeight;

          // 计算居中位置
          var pos = calcCenteredPosition(result.imgWidth, result.imgHeight, {
            width: slideWidth,
            height: slideHeight
          });

          // 插入图片
          // AddPicture(FileName, LinkToFile, SaveWithDocument, Left, Top, Width, Height)
          slide.Shapes.AddPicture(
            tempPath,
            false,  // LinkToFile: 不链接
            true,   // SaveWithDocument: 嵌入
            pos.left,
            pos.top,
            pos.width,
            pos.height
          );

          writeLog("INFO", "图片已插入到幻灯片，位置: (" + pos.left + "," + pos.top + ") 尺寸: " + pos.width + "x" + pos.height);
          updateStatus("地图图片已插入");
        } catch (e) {
          writeLog("ERROR", "插入图片失败: " + e.message);
          throw e;
        } finally {
          // 清理临时文件
          deleteTempFile(tempPath);
        }
      })
      .catch(function (err) {
        writeLog("ERROR", "插入地图失败: " + err.message);
        updateStatus("插入失败: " + err.message);
        try {
          wps.Alert("图片插入失败，请重试", "错误", wps.AlertIcon.Warning);
        } catch (e) {
          alert("图片插入失败，请重试");
        }
      });
  }

  /**
   * 获取"插入地图"按钮的启用状态
   * 由 ribbon.xml 中 "插入地图" 按钮的 getEnabled 调用
   * @returns {boolean} 按钮是否可用
   */
  function getInsertMapEnabled() {
    return pluginState.taskpaneVisible;
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

    // 刷新 Ribbon 按钮状态
    invalidateRibbon();
  }

  /**
   * 刷新 Ribbon UI 按钮状态
   */
  function invalidateRibbon() {
    try {
      if (typeof wps !== "undefined" && wps.RibbonUI) {
        wps.RibbonUI.Invalidate();
      }
    } catch (e) {
      // RibbonUI 不可用时忽略
    }
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
  window.getInsertMapEnabled = getInsertMapEnabled;

  // 设置日志转发（尽早注册）
  setupLogForwarding();

  // 页面加载完成后初始化插件
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlugin);
  } else {
    initPlugin();
  }
})();
