/**
 * WMS 地图插件 - WPS JSAPI 主入口
 *
 * 负责插件初始化、Ribbon 按钮事件绑定、任务窗格管理、
 * 图层配置读取、iframe 通信、日志转发、图片插入幻灯片。
 *
 * 双上下文架构（WPS 加载项与 Office 加载项不同，需注意）：
 *  - WPS 加载项启动时自动创建 index.html，从加载项根目录引入 main.js，
 *    因此 main.js 必须位于 wps/ 根目录（不能在子目录）。
 *  - 该根目录页面（下文称"宿主页"）负责 Ribbon 回调。
 *  - CreateTaskPane 创建的任务窗格 taskpane.html 是另一个独立窗口，
 *    它也会加载同一份 main.js，负责管理 map iframe。
 *  - 两个窗口通过 wps.PluginStorage（同插件跨网页共享）+ 轮询 交换指令。
 */

(function () {
  "use strict";

  // 插件状态
  var pluginState = {
    initialized: false,
    taskpaneVisible: false,
    taskPaneId: null,
    layersConfig: null,
    ribbonUI: null,
    wpsVersion: null
  };

  // 日志文件名（写入系统临时目录，插件目录在 WPS 中通常不可写）
  var LOG_FILE = "wms-plugin.log";

  // 日志文件大小上限：约 2MB
  var MAX_LOG_SIZE = 2 * 1024 * 1024;

  // WPS 最低版本要求
  var MIN_WPS_VERSION = 2019;

  // PluginStorage 键名（宿主页 <-> 任务窗格页 通信）
  var TASKPANE_ID_KEY = "wms_taskpane_id";
  var REQ_KEY = "wms_req";            // 宿主页 -> 任务窗格：{op:'insert'|'refresh', t}
  var RESULT_KEY = "wms_result";      // 任务窗格 -> 宿主页：{success, message, t}

  // 轮询间隔（毫秒）
  var POLL_INTERVAL = 500;

  /**
   * 获取加载项根目录 URL（WPS 全局函数 GetUrlPath，个别版本挂载在 Util 下）
   * @returns {string} 以 / 结尾的目录 URL
   */
  function getUrlPath() {
    if (typeof GetUrlPath === "function") {
      return GetUrlPath();
    }
    if (typeof Util !== "undefined" && typeof Util.GetUrlPath === "function") {
      return Util.GetUrlPath();
    }
    // 兜底：从当前页面地址推导
    return location.href.replace(/[^/]*$/, "");
  }

  /**
   * 拼接目录 URL 与文件名（容错：目录是否以 / 结尾均正确）
   * @param {string} dir - 目录 URL
   * @param {string} file - 文件名（可带前导 /）
   * @returns {string} 拼接后的 URL
   */
  function joinUrlPath(dir, file) {
    return dir.replace(/\/+$/, "") + "/" + file.replace(/^\/+/, "");
  }

  /**
   * 弹出提示框（WPS 无 wps.Alert，统一回退到浏览器 alert）
   * @param {string} text - 提示内容
   * @param {string} title - 标题（WPS alert 无标题参数，仅保留兼容）
   */
  function showAlert(text, title) {
    try {
      if (typeof wps !== "undefined" && typeof wps.alert === "function") {
        wps.alert(text);
        return;
      }
    } catch (e) {
      // 忽略，走浏览器 alert
    }
    try {
      alert(text);
    } catch (e) {
      // 极端情况也失败则静默
    }
  }

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

    // 尝试使用 WPS FileSystem API 写入日志文件（临时目录）
    try {
      if (typeof wps !== "undefined" && wps.FileSystem) {
        var logPath = wps.Env.GetTempPath() + "/" + LOG_FILE;
        // 限制日志文件大小：超过约 2MB 时删除旧文件后重新写（清空重写）
        try {
          if (typeof wps.FileSystem.stat === "function" && wps.FileSystem.Exists(logPath)) {
            var logStat = wps.FileSystem.stat(logPath);
            var logSize = (logStat && typeof logStat.size === "number") ? logStat.size :
                          (logStat && typeof logStat.Size === "number") ? logStat.Size : 0;
            if (logSize > MAX_LOG_SIZE) {
              wps.FileSystem.Remove(logPath);
            }
          }
        } catch (sizeErr) {
          // 大小检查失败则直接追加，不影响主流程
        }
        // 追加写入（官方 API 名 AppendFile）
        if (typeof wps.FileSystem.AppendFile === "function") {
          wps.FileSystem.AppendFile(logPath, logLine);
        }
      }
    } catch (e) {
      // WPS FileSystem API 不可用时，仅使用 console
      // 不抛出异常，避免影响主流程
    }
  }

  /**
   * 检测 WPS 版本，确保满足最低要求
   * @returns {object} { compatible: boolean, version: string, message: string }
   */
  function detectWpsVersion() {
    var result = { compatible: true, version: "unknown", message: "" };

    try {
      if (typeof wps === "undefined") {
        result.version = "N/A";
        result.message = "非 WPS 环境，跳过版本检测";
        writeLog("WARN", result.message);
        return result;
      }

      // 获取 WPS 版本号（演示应用对象，取不到再尝试全局 Application）
      var version = null;
      try {
        if (wps.WppApplication) {
          var app = wps.WppApplication();
          if (app && app.Version) {
            version = app.Version;
          }
        }
      } catch (e) {
        // 继续尝试其他方式
      }
      if (version == null) {
        try {
          version = wps.Application.Version;
        } catch (e2) {
          // 均取不到则标记为未知
        }
      }
      if (version == null) {
        result.message = "无法获取 WPS 版本号";
        writeLog("WARN", result.message);
        return result;
      }

      result.version = String(version);
      pluginState.wpsVersion = result.version;

      // 解析主版本号（WPS 版本号格式如 "11.1.0.12345" 或 "2019"）
      var majorVersion = parseInt(result.version.split(".")[0], 10);

      if (isNaN(majorVersion)) {
        result.message = "无法解析 WPS 版本号: " + result.version;
        writeLog("WARN", result.message);
        return result;
      }

      // WPS 2019 对应主版本号 11+（WPS Office 2019 内部版本为 11.x）
      // 简化判断：版本号 >= 2019 或 >= 11 均视为兼容
      if (majorVersion >= MIN_WPS_VERSION || majorVersion >= 11) {
        result.compatible = true;
        result.message = "WPS 版本 " + result.version + "，满足要求";
      } else {
        result.compatible = false;
        result.message = "WPS 版本 " + result.version + " 低于最低要求 " + MIN_WPS_VERSION + "，部分功能可能不可用";
      }

      writeLog("INFO", result.message);
    } catch (e) {
      result.message = "版本检测失败: " + e.message;
      writeLog("WARN", result.message);
    }

    return result;
  }

  /**
   * 探测 wps 对象及其子对象暴露的成员（用于排查 API 可用性）
   */
  function probeWpsApis() {
    function listMembers(obj, label) {
      try {
        if (!obj) {
          writeLog("INFO", "探测 " + label + ": 不存在");
          return;
        }
        var names = [];
        for (var key in obj) {
          names.push(key);
        }
        // 补充函数名（部分 COM 包装对象不枚举原型链）
        try {
          var proto = Object.getPrototypeOf(obj);
          if (proto) {
            for (var p in proto) {
              if (names.indexOf(p) < 0) {
                names.push(p);
              }
            }
          }
        } catch (e) {
          // 忽略原型枚举失败
        }
        writeLog("INFO", "探测 " + label + " 成员(" + names.length + "): " + names.join(", "));
      } catch (e) {
        writeLog("WARN", "探测 " + label + " 失败: " + e.message);
      }
    }

    try {
      if (typeof wps !== "undefined") {
        listMembers(wps, "wps");
        listMembers(wps.FileSystem, "wps.FileSystem");
        listMembers(wps.Env, "wps.Env");
        listMembers(wps.WppApplication, "wps.WppApplication");
      } else {
        writeLog("INFO", "探测 wps: 未定义");
      }
    } catch (e) {
      writeLog("WARN", "探测 WPS API 失败: " + e.message);
    }
  }

  /**
   * 插件初始化（宿主页 Ribbon 加载后触发）
   */
  function initPlugin() {
    if (pluginState.initialized) {
      return;
    }

    writeLog("INFO", "插件初始化...");

    // 探测 WPS API 成员（仅诊断用，方便排查二进制写入问题）
    probeWpsApis();

    // WPS 版本检测
    var versionCheck = detectWpsVersion();
    if (!versionCheck.compatible) {
      writeLog("WARN", "WPS 版本不兼容: " + versionCheck.message);
      showAlert(
        "WMS地图插件兼容性警告\n\n" + versionCheck.message + "\n建议升级到 WPS " + MIN_WPS_VERSION + " 或更高版本。",
        "兼容性提示"
      );
    }

    pluginState.initialized = true;
    writeLog("INFO", "插件初始化完成");
  }

  /**
   * 获取加载项本地绝对路径（目录，正斜杠分隔，WPS FileSystem 要求正斜杠）
   * 优先用 GetUrlPath()（已验证可用），去掉 file:/// 前缀即得到 Windows 绝对路径；
   * 失败时从 location.href 推导。
   * @returns {string|null} 本地目录路径，非 file:// 环境返回 null
   */
  function getAddonLocalPath() {
    var dirUrl = null;

    // 优先 GetUrlPath()（CreateTaskPane 已验证返回加载项目录 URL）
    try {
      if (typeof GetUrlPath === "function") {
        dirUrl = GetUrlPath();
      } else if (typeof Util !== "undefined" && typeof Util.GetUrlPath === "function") {
        dirUrl = Util.GetUrlPath();
      }
    } catch (e) {
      dirUrl = null;
    }

    // 兜底：从 location.href 推导（file:///C:/.../taskpane.html）
    if (!dirUrl) {
      var href = location.href;
      if (href.indexOf("file:///") === 0) {
        dirUrl = href.substring(7).replace(/[^/]*$/, "");
      }
    }
    if (!dirUrl) {
      return null;
    }

    // 去掉 file:// 协议前缀（如果有），再去掉前导斜杠（GetUrlPath 可能直接返回 /C:/...）
    // WPS FileSystem 只接受 C:/Users/... 这种不带前导斜杠的路径
    var localPath = dirUrl.replace(/^file:\/\/+/, "");
    localPath = localPath.replace(/^\/([A-Za-z]:\/)/, "$1");
    return decodeURIComponent(localPath);
  }

  /**
   * 用 WPS FileSystem API 读取本地文件（file:// 协议下 fetch 被 CORS 拦截，只能读绝对路径）
   * @param {string} absPath - 本地绝对路径
   * @returns {string|null} 文件内容，读取失败返回 null
   */
  function readLocalFile(absPath) {
    try {
      if (typeof wps !== "undefined" && wps.FileSystem) {
        if (typeof wps.FileSystem.ReadFile === "function") {
          return wps.FileSystem.ReadFile(absPath);
        }
        if (typeof wps.FileSystem.readFileString === "function") {
          return wps.FileSystem.readFileString(absPath);
        }
      }
    } catch (e) {
      writeLog("WARN", "FileSystem 读取失败: " + e.message);
    }
    return null;
  }

  /**
   * 读取图层配置文件
   * WPS 环境优先用 FileSystem 读绝对路径（file:// 下 fetch 不可用），
   * 非 WPS 环境（浏览器调试）回退 fetch。
   * @returns {Promise<object>} 解析后的图层配置
   */
  function loadLayersConfig() {
    if (pluginState.layersConfig) {
      return Promise.resolve(pluginState.layersConfig);
    }

    // WPS 环境：FileSystem 读绝对路径（正斜杠）
    var addonDir = getAddonLocalPath();
    if (addonDir) {
      var jsonText = readLocalFile(addonDir + "shared/layers.json");
      if (jsonText) {
        try {
          var config = JSON.parse(jsonText);
          pluginState.layersConfig = config;
          writeLog("INFO", "图层配置加载成功（FileSystem），共 " + config.services.length + " 个服务");
          return Promise.resolve(config);
        } catch (e) {
          writeLog("ERROR", "图层配置解析失败: " + e.message);
        }
      } else {
        writeLog("WARN", "FileSystem 读取图层配置失败，尝试 fetch 回退 (路径: " + addonDir + "shared/layers.json)");
      }
    }

    // 回退：浏览器环境（调试），相对加载项根目录
    return fetch(joinUrlPath(getUrlPath(), "shared/layers.json"))
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

  // ============================================================
  // 任务窗格页上下文（taskpane.html 加载本脚本时使用）
  // ============================================================

  /**
   * 判断当前页面是否为任务窗格页（存在 map-frame 即为任务窗格）
   * @returns {boolean}
   */
  function isTaskpanePage() {
    return !!document.getElementById("map-frame");
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
   * 等待 map iframe 加载完成后发送图层配置并注入图片监听
   */
  function setupMapIframe() {
    var iframe = document.getElementById("map-frame");
    if (!iframe) {
      writeLog("WARN", "任务窗格页中未找到 map-frame");
      return;
    }

    function loadAndSend() {
      // 图片请求监听器必须先注入，且不依赖配置加载结果（出图链路独立于配置）
      injectImageRequestListener(iframe);

      loadLayersConfig()
        .then(function (config) {
          sendConfigToIframe(iframe, config);
          updateStatus("图层配置已加载");
        })
        .catch(function (err) {
          updateStatus("配置加载失败: " + err.message);
          hideLoading();
        });
    }

    // iframe 可能还在加载，等待 load 事件后发送
    if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
      loadAndSend();
    } else {
      iframe.addEventListener("load", loadAndSend);
    }
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

      var timerId = null;

      // 一次性监听器，接收 iframe 返回的图片数据
      function onMessage(event) {
        var data = event.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "image-data") {
          window.removeEventListener("message", onMessage);
          clearTimeout(timerId);
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
      timerId = setTimeout(function () {
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
   *
   * 注意：二进制写入必须使用 ADODB.Stream（adTypeBinary 二进制模式）。
   * 不能使用 wps.FileSystem.WriteFile —— 该方法按 UTF-8 文本编码写入，
   * 会破坏 PNG 等二进制文件（非 ASCII 字节被转码，如 0x89 → C2 89），
   * 导致 AddPicture 插入损坏文件："日志成功但图片不可见"。
   * @param {Uint8Array} bytes - 图片二进制数据
   * @returns {string} 临时文件路径
   */
  function saveTempImage(bytes) {
    // 获取临时目录（WPS 加载项环境无 ActiveX，只能用 wps.Env.GetTempPath）
    var tempDir = "";
    try {
      if (typeof wps !== "undefined" && wps.Env && typeof wps.Env.GetTempPath === "function") {
        tempDir = wps.Env.GetTempPath();
      }
    } catch (e) {
      // 继续回退
    }
    if (!tempDir) {
      throw new Error("无法获取临时目录路径（wps.Env.GetTempPath 不可用）");
    }

    var fileName = "wms_map_" + Date.now() + ".png";
    // 统一正斜杠（WPS FileSystem + AddPicture 要求正斜杠，混合斜杠可能导致图片不可见）
    var filePath = tempDir.replace(/\\/g, "/") + "/" + fileName;

    // 使用 wps.FileSystem.writeAsBinaryString 写入二进制数据。
    // WPS 加载项是 V8/Chromium 环境，没有 ActiveXObject/ADODB.Stream/VBArray。
    // wps.FileSystem.WriteFile 按 UTF-8 文本编码（破坏二进制），不能用。
    // writeAsBinaryString 接受"二进制字符串"（每字符 0-255，Latin-1），二进制安全。
    // API 探测确认存在：wps.FileSystem 成员含 writeAsBinaryString + writeSliceAsBinaryString。

    // 将 Uint8Array 转为二进制字符串（分块避免 O(n²) 拼接和 apply 参数上限）
    var CHUNK_SIZE = 8192;
    var chunks = [];
    for (var i = 0; i < bytes.length; i += CHUNK_SIZE) {
      var end = Math.min(i + CHUNK_SIZE, bytes.length);
      var slice = new Array(end - i);
      for (var j = i; j < end; j++) {
        slice[j - i] = bytes[j];
      }
      chunks.push(String.fromCharCode.apply(null, slice));
    }
    var binaryString = chunks.join("");
    writeLog("INFO", "二进制字符串转换完成: " + binaryString.length + " 字符 (原始 " + bytes.length + " 字节)");

    var written = false;
    try {
      if (typeof wps.FileSystem.writeAsBinaryString === "function") {
        wps.FileSystem.writeAsBinaryString(filePath, binaryString);
        written = true;
        writeLog("INFO", "writeAsBinaryString 调用完成");
      } else {
        throw new Error("wps.FileSystem.writeAsBinaryString 不可用");
      }
    } catch (e) {
      throw new Error("二进制写入临时文件失败: " + e.message);
    }

    // 写入后校验：确认文件存在且字节数与原始数据一致（防止编码写入导致文件损坏）
    try {
      if (typeof wps.FileSystem.Exists === "function" && wps.FileSystem.Exists(filePath)) {
        // 用 stat 获取文件大小（wps.FileSystem.stat 返回对象，含 size 字段）
        if (typeof wps.FileSystem.stat === "function") {
          var stat = wps.FileSystem.stat(filePath);
          var actualSize = (stat && typeof stat.size === "number") ? stat.size :
                           (stat && typeof stat.Size === "number") ? stat.Size : -1;
          if (actualSize >= 0 && actualSize !== bytes.length) {
            throw new Error("临时文件写入校验失败: 期望 " + bytes.length + " 字节，实际 " + actualSize + " 字节");
          }
          writeLog("INFO", "临时文件大小校验通过: " + actualSize + " 字节");
        }
      }
    } catch (e) {
      if (e.message && e.message.indexOf("临时文件写入校验失败") === 0) {
        throw e;
      }
      // 校验工具不可用时仅记录，不影响主流程
      writeLog("WARN", "临时文件写入校验不可用: " + e.message);
    }

    writeLog("INFO", "临时图片已保存: " + filePath + " (" + bytes.length + " 字节)");
    return filePath;
  }

  /**
   * 删除临时文件
   * @param {string} filePath - 文件路径
   */
  function deleteTempFile(filePath) {
    try {
      // WPS 加载项环境无 ActiveX，用 wps.FileSystem.Remove
      if (typeof wps !== "undefined" && wps.FileSystem && typeof wps.FileSystem.Remove === "function") {
        wps.FileSystem.Remove(filePath);
      }
      writeLog("INFO", "临时文件已删除: " + filePath);
    } catch (e) {
      writeLog("WARN", "删除临时文件失败: " + e.message);
    }
  }

  /**
   * 获取活动演示文稿对象（带多级回退）
   * @returns {object|null} 演示文稿对象，获取失败返回 null
   */
  function getActivePresentation() {
    // 优先 wps.ActivePresentation（API 探测确认 wps 上有此成员）
    try {
      if (typeof wps !== "undefined" && wps.ActivePresentation) {
        return wps.ActivePresentation;
      }
    } catch (e) {
      // 继续回退
    }
    try {
      if (typeof wps !== "undefined" && wps.WppApplication) {
        var app = wps.WppApplication();
        if (app && app.ActivePresentation) {
          return app.ActivePresentation;
        }
      }
    } catch (e) {
      // 继续回退
    }
    try {
      if (typeof window.ActivePresentation !== "undefined") {
        return window.ActivePresentation;
      }
    } catch (e) {
      // 继续回退
    }
    return null;
  }

  /**
   * 获取当前活动幻灯片
   * WPP 获取当前幻灯片的正确路径：Window.View.Slide 或 SlideShowWindow.View.Slide
   * presentation.Slides.CurrentSlide 在 WPP 中不可靠，不能用作首选。
   * @param {object} presentation - 活动演示文稿
   * @returns {object|null} 幻灯片对象
   */
  function getCurrentSlide(presentation) {
    // 路径1：通过 Application.ActiveWindow.View.Slide 获取当前编辑视图的幻灯片
    try {
      var app = null;
      if (typeof wps !== "undefined" && wps.WppApplication) {
        app = wps.WppApplication();
      }
      if (app && app.ActiveWindow && app.ActiveWindow.View && app.ActiveWindow.View.Slide) {
        return app.ActiveWindow.View.Slide;
      }
    } catch (e) {
      // 继续回退
    }

    // 路径2：通过 SlideShowWindow.View.Slide 获取放映视图的幻灯片
    try {
      if (typeof wps !== "undefined" && wps.SlideShowWindows && wps.SlideShowWindows.Count > 0) {
        var showWin = wps.SlideShowWindows.Item(1);
        if (showWin && showWin.View && showWin.View.Slide) {
          return showWin.View.Slide;
        }
      }
    } catch (e) {
      // 继续回退
    }

    // 路径3：presentation.Slides.CurrentSlide（部分版本支持）
    try {
      if (presentation && presentation.Slides && presentation.Slides.CurrentSlide) {
        return presentation.Slides.CurrentSlide;
      }
    } catch (e) {
      // 继续回退
    }

    // 路径4：通过 SlideIndex 获取（部分版本在 Window 上暴露 SlideIndex）
    try {
      var app2 = null;
      if (typeof wps !== "undefined" && wps.WppApplication) {
        app2 = wps.WppApplication();
      }
      if (app2 && app2.ActiveWindow && typeof app2.ActiveWindow.View !== "undefined") {
        var view = app2.ActiveWindow.View;
        // View.SlideIndex 是当前幻灯片的 1-based 索引
        if (typeof view.SlideIndex === "number" && presentation && presentation.Slides) {
          return presentation.Slides.Item(view.SlideIndex);
        }
      }
    } catch (e) {
      // 继续回退
    }

    // 最后回退：第一张幻灯片（仅当以上都失败时）
    try {
      if (presentation && presentation.Slides && typeof presentation.Slides.Item === "function") {
        writeLog("WARN", "无法获取当前幻灯片，回退到第一张");
        return presentation.Slides.Item(1);
      }
    } catch (e) {
      // 继续回退
    }
    return null;
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
   * 出图并插入到当前幻灯片（在任务窗格页执行）
   * @returns {Promise<string>} 成功提示信息
   */
  function insertMapImageIntoSlide() {
    updateStatus("正在获取地图图片...");

    return requestImageFromIframe()
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
          // 获取活动演示文稿（WppApplication 回退链）
          var presentation = getActivePresentation();
          if (!presentation) {
            throw new Error("无法获取活动演示文稿");
          }

          // 获取当前幻灯片（多层回退）
          var slide = getCurrentSlide(presentation);
          if (!slide) {
            throw new Error("无法获取当前幻灯片");
          }

          // 诊断：记录当前幻灯片索引（确认插入到了正确的幻灯片）
          try {
            var slideIdx = slide.SlideIndex || slide.slideIndex || "?";
            writeLog("INFO", "目标幻灯片索引: " + slideIdx);
          } catch (diagErr) {
            writeLog("WARN", "无法获取幻灯片索引: " + diagErr.message);
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
          // 桌面 WPS 加载项（VBA 兼容）签名：AddPicture(FileName, LinkToFile, SaveWithDocument, Left, Top, Width, Height, Anchor)
          // 关键约束：LinkToFile=msoFalse 时 SaveWithDocument 必须为 msoTrue（已满足）
          // 单位：Left/Top/Width/Height 都是磅（pt）
          var shape = slide.Shapes.AddPicture(
            tempPath,
            false,  // LinkToFile: 不链接
            true,   // SaveWithDocument: 嵌入
            pos.left,
            pos.top,
            pos.width,
            pos.height
          );

          // 诊断：验证 AddPicture 返回有效 Shape（防御 shape 为 null/undefined 静默失败）
          if (!shape) {
            throw new Error("AddPicture 返回空对象");
          }
          try {
            writeLog("INFO", "Shape 插入成功: Id=" + (shape.Id || "N/A") + " Name=" + (shape.Name || "N/A") + " Type=" + (shape.Type || "N/A"));
          } catch (diagErr) {
            writeLog("WARN", "Shape 诊断日志写入失败: " + diagErr.message);
          }

          writeLog("INFO", "图片已插入到幻灯片，位置: (" + pos.left + "," + pos.top + ") 尺寸: " + pos.width + "x" + pos.height);
          updateStatus("地图图片已插入");
          return "地图图片已插入到当前幻灯片";
        } catch (e) {
          writeLog("ERROR", "插入图片失败: " + e.message);
          throw e;
        }
        // 注意：不在此处删除临时文件。
        // WPS JSAPI 的 AddPicture 可能是异步排队执行的——函数返回后 WPS 后台才读文件嵌入。
        // 立即删除会导致嵌入空白形状（"插入成功但不可见"）。
        // temp 目录由系统定期清理，延迟删除反而更安全。
      });
  }

  /**
   * 任务窗格页初始化：管理 map iframe + 轮询宿主页指令
   */
  function initTaskpanePage() {
    writeLog("INFO", "任务窗格页面初始化...");
    setupLogForwarding();
    setupMapIframe();
    pollPluginStorage();
  }

  /**
   * 向宿主页回写执行结果（成功或失败）
   * @param {boolean} success - 是否成功
   * @param {string} message - 结果信息
   */
  function writeResult(success, message) {
    try {
      if (typeof wps !== "undefined" && wps.PluginStorage) {
        wps.PluginStorage.setItem(RESULT_KEY, JSON.stringify({
          success: success,
          message: message,
          t: Date.now()
        }));
      }
    } catch (e) {
      writeLog("WARN", "回写结果失败: " + e.message);
    }
  }

  /**
   * 刷新任务窗格页的图层配置（清缓存后重新读取并发送到 iframe）
   */
  function refreshLayersInTaskpane() {
    writeLog("INFO", "任务窗格页收到刷新指令");
    showLoading();
    updateStatus("正在刷新图层配置...");

    // 清除缓存，强制重新读取
    pluginState.layersConfig = null;

    loadLayersConfig()
      .then(function (config) {
        var iframe = document.getElementById("map-frame");
        if (iframe) {
          sendConfigToIframe(iframe, config);
        }
        var serviceCount = config.services ? config.services.length : 0;
        var projCount = config.availableProjections ? config.availableProjections.length : 0;
        updateStatus("配置已刷新：" + serviceCount + " 个服务，" + projCount + " 个投影");
        hideLoading();
        writeLog("INFO", "图层配置刷新完成");
        writeResult(true, "图层配置已刷新：" + serviceCount + " 个服务，" + projCount + " 个投影");
      })
      .catch(function (err) {
        writeLog("ERROR", "刷新图层配置失败: " + err.message);
        updateStatus("配置刷新失败: " + err.message);
        hideLoading();
        writeResult(false, "图层配置刷新失败: " + err.message);
      });
  }

  /**
   * 轮询宿主页通过 PluginStorage 下发的指令（插入/刷新）
   */
  function pollPluginStorage() {
    var lastReqT = 0;

    setInterval(function () {
      try {
        if (typeof wps === "undefined" || !wps.PluginStorage) {
          return;
        }
        var reqRaw = wps.PluginStorage.getItem(REQ_KEY);
        if (!reqRaw) {
          return;
        }
        var req;
        try {
          req = JSON.parse(reqRaw);
        } catch (e) {
          return;
        }
        if (!req.t || req.t === lastReqT) {
          return;
        }
        lastReqT = req.t;

        if (req.op === "insert") {
          insertMapImageIntoSlide()
            .then(function (msg) {
              writeResult(true, msg);
            })
            .catch(function (err) {
              writeResult(false, "图片插入失败: " + err.message);
            });
        } else if (req.op === "refresh") {
          refreshLayersInTaskpane();
        }
      } catch (e) {
        // 轮询异常静默，避免打断下一次
      }
    }, POLL_INTERVAL);
  }

  // ============================================================
  // 宿主页上下文（Ribbon 回调所在页面）
  // ============================================================

  /**
   * 打开地图任务窗格
   * 由 ribbon.xml 中 "打开地图" 按钮的 onAction 调用
   */
  function openMapPane() {
    writeLog("INFO", "openMapPane() 被调用");

    try {
      if (typeof wps === "undefined") {
        // 非 WPS 环境（开发调试），仅记录状态
        writeLog("WARN", "WPS JSAPI 不可用，使用调试模式");
        pluginState.taskpaneVisible = true;
        invalidateRibbon();
        return;
      }

      // 若已创建过任务窗格，直接复用（官方 API GetTaskPane + Visible）
      var taskPaneId = null;
      try {
        taskPaneId = wps.PluginStorage.getItem(TASKPANE_ID_KEY);
      } catch (e) {
        // 忽略读取失败
      }
      if (taskPaneId) {
        try {
          var existing = wps.GetTaskPane(taskPaneId);
          if (existing) {
            existing.Visible = true;
            pluginState.taskPaneId = taskPaneId;
            pluginState.taskpaneVisible = true;
            writeLog("INFO", "任务窗格已复用，ID: " + taskPaneId);
            invalidateRibbon();
            return;
          }
        } catch (e) {
          writeLog("WARN", "复用任务窗格失败，重新创建: " + e.message);
        }
      }

      // 创建任务窗格：CreateTaskPane(url[, title])，返回对象后设属性
      var taskPaneUrl = joinUrlPath(getUrlPath(), "taskpane.html");
      var taskPane = wps.CreateTaskPane(taskPaneUrl, "WMS地图");
      // 停靠右侧（默认即右侧，设置失败不影响）
      try {
        taskPane.DockPosition = wps.Enum.JSKsoEnum_msoCTPDockPositionRight;
      } catch (e) {
        // 枚举不可用时保持默认
      }
      try {
        taskPane.Width = 400;
      } catch (e) {
        // 宽度设置失败保持默认
      }
      taskPane.Visible = true;

      pluginState.taskPaneId = taskPane.ID;
      pluginState.taskpaneVisible = true;
      // 持久化 ID，页面刷新后仍可复用
      try {
        wps.PluginStorage.setItem(TASKPANE_ID_KEY, taskPane.ID);
      } catch (e) {
        // 存储失败不影响本次显示
      }
      writeLog("INFO", "任务窗格已创建，ID: " + taskPane.ID);
      invalidateRibbon();
    } catch (e) {
      writeLog("ERROR", "创建任务窗格失败: " + e.message);
      pluginState.taskpaneVisible = false;
    }
  }

  /**
   * 关闭地图任务窗格
   */
  function closeMapPane() {
    writeLog("INFO", "closeMapPane() 被调用");

    try {
      if (typeof wps !== "undefined") {
        var taskPaneId = null;
        try {
          taskPaneId = wps.PluginStorage.getItem(TASKPANE_ID_KEY);
        } catch (e) {
          // 忽略读取失败
        }
        if (taskPaneId) {
          try {
            var taskPane = wps.GetTaskPane(taskPaneId);
            if (taskPane) {
              taskPane.Visible = false;
            }
          } catch (e) {
            writeLog("ERROR", "获取任务窗格失败: " + e.message);
          }
        }
      }
    } catch (e) {
      writeLog("ERROR", "关闭任务窗格失败: " + e.message);
    }

    pluginState.taskpaneVisible = false;
    invalidateRibbon();
  }

  /**
   * 插入地图图片到幻灯片（宿主页：下发指令给任务窗格页执行）
   * 由 ribbon.xml 中 "插入地图" 按钮的 onAction 调用
   */
  function insertMapImage() {
    writeLog("INFO", "insertMapImage() 被调用");

    // 检查任务窗格是否打开
    if (!pluginState.taskpaneVisible) {
      showAlert("请先打开地图任务窗格", "提示");
      writeLog("WARN", "任务窗格未打开，无法插入地图");
      return;
    }

    try {
      if (typeof wps === "undefined" || !wps.PluginStorage) {
        showAlert("WPS JSAPI 不可用，无法插入地图", "错误");
        return;
      }
      // 下发插入指令，任务窗格页轮询执行出图并插入
      wps.PluginStorage.setItem(REQ_KEY, JSON.stringify({
        op: "insert",
        t: Date.now()
      }));
      writeLog("INFO", "已向任务窗格下发插入指令");
    } catch (e) {
      writeLog("ERROR", "下发插入指令失败: " + e.message);
      showAlert("下发插入指令失败: " + e.message, "错误");
    }
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
   * Ribbon 加载完成回调
   * 由 ribbon.xml 的 onLoad 属性调用（WPS 约定入口为 OnAddinLoad，两者均注册）
   * @param {object} ribbonUI - Ribbon UI 对象
   */
  function onRibbonLoad(ribbonUI) {
    writeLog("INFO", "Ribbon UI 加载完成");
    pluginState.ribbonUI = ribbonUI;

    // 初始化插件
    initPlugin();
    return true;
  }

  /**
   * 刷新图层配置（宿主页：下发指令给任务窗格页执行）
   * 由 ribbon.xml 中 "刷新配置" 按钮的 onAction 调用
   */
  function refreshLayersConfig() {
    writeLog("INFO", "refreshLayersConfig() 被调用 - 下发刷新指令");

    try {
      if (typeof wps === "undefined" || !wps.PluginStorage) {
        showAlert("WPS JSAPI 不可用，无法刷新配置", "错误");
        return;
      }
      wps.PluginStorage.setItem(REQ_KEY, JSON.stringify({
        op: "refresh",
        t: Date.now()
      }));
      writeLog("INFO", "已向任务窗格下发刷新指令");
    } catch (e) {
      writeLog("ERROR", "下发刷新指令失败: " + e.message);
      showAlert("下发刷新指令失败: " + e.message, "错误");
    }
  }

  /**
   * 显示关于对话框
   * 由 ribbon.xml 中 "关于" 按钮的 onAction 调用
   */
  function showAbout() {
    writeLog("INFO", "showAbout() 被调用");

    var versionInfo = pluginState.wpsVersion || "未知";
    var aboutText = "WMS 地图插件 v1.0.0\n\n" +
      "功能：在 WPS PPT 中打开可交互地图，\n" +
      "支持图层切换、投影转换和地图插入。\n\n" +
      "WPS 版本：" + versionInfo + "\n" +
      "最低要求：WPS " + MIN_WPS_VERSION + "+";

    showAlert(aboutText, "关于 WMS 地图插件");
  }

  /**
   * 刷新 Ribbon UI 按钮状态
   */
  function invalidateRibbon() {
    try {
      if (pluginState.ribbonUI && typeof pluginState.ribbonUI.Invalidate === "function") {
        pluginState.ribbonUI.Invalidate();
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

  /**
   * 宿主页轮询任务窗格页的执行结果（插入/刷新完成提示）
   */
  function pollInsertResult() {
    var lastResultT = 0;

    setInterval(function () {
      try {
        if (typeof wps === "undefined" || !wps.PluginStorage) {
          return;
        }
        var raw = wps.PluginStorage.getItem(RESULT_KEY);
        if (!raw) {
          return;
        }
        var res;
        try {
          res = JSON.parse(raw);
        } catch (e) {
          return;
        }
        if (!res.t || res.t === lastResultT) {
          return;
        }
        lastResultT = res.t;

        showAlert(res.message, res.success ? "提示" : "错误");
      } catch (e) {
        // 轮询异常静默，避免打断下一次
      }
    }, POLL_INTERVAL);
  }

  // 将函数注册到全局作用域，供 ribbon.xml 的 onAction 调用
  // WPS 官方约定 Ribbon 入口为 OnAddinLoad，同时保留 onRibbonLoad 兼容
  window.openMapPane = openMapPane;
  window.insertMapImage = insertMapImage;
  window.closeMapPane = closeMapPane;
  window.refreshLayersConfig = refreshLayersConfig;
  window.showAbout = showAbout;
  window.onRibbonLoad = onRibbonLoad;
  window.OnAddinLoad = onRibbonLoad;
  window.getPluginState = getPluginState;
  window.getInsertMapEnabled = getInsertMapEnabled;

  // 按页面上下文分流：
  //  - 任务窗格页（taskpane.html）：管理 map iframe，轮询宿主指令
  //  - 宿主页（WPS 自动生成的 index.html）：注册 Ribbon 回调，轮询执行结果
  if (isTaskpanePage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initTaskpanePage);
    } else {
      initTaskpanePage();
    }
  } else {
    // 设置结果轮询（尽早注册）
    pollInsertResult();

    // 页面加载完成后初始化插件
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initPlugin);
    } else {
      initPlugin();
    }
  }

  // 页面卸载时记录关闭日志
  window.addEventListener("beforeunload", function () {
    writeLog("INFO", "插件即将关闭/卸载");
  });
})();
