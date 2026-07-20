// WMS Map Plugin - Error Handling & Logging Module
// Task 10: 共享前端错误处理与日志模块

(function() {
  'use strict';

  // ========== Toast UI ==========

  var TOAST_DURATION = 3000;
  var toastContainer = null;

  function ensureToastContainer() {
    if (toastContainer) return toastContainer;
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showToast(message, level) {
    var container = ensureToastContainer();
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (level || 'info');
    toast.textContent = message;
    container.appendChild(toast);

    // 触发动画
    requestAnimationFrame(function() {
      toast.classList.add('toast-show');
    });

    // 自动消失
    setTimeout(function() {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-hide');
      setTimeout(function() {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, TOAST_DURATION);
  }

  function showError(message) {
    showToast(message, 'error');
  }

  function showWarning(message) {
    showToast(message, 'warning');
  }

  function showInfo(message) {
    showToast(message, 'info');
  }

  // ========== Logger ==========

  var MAX_LOGS = 1000;
  var logs = [];

  function getTimestamp() {
    return new Date().toISOString();
  }

  function addLog(level, module, message, data) {
    var entry = {
      timestamp: getTimestamp(),
      level: level,
      module: module,
      message: message
    };
    if (data !== undefined) {
      entry.data = data;
    }
    logs.push(entry);

    // 限制日志数量
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(-MAX_LOGS);
    }

    // 同步到宿主
    sendToHost('log', entry);

    // 同时输出到 console
    var consoleFn = level === 'error' ? console.error :
                    level === 'warn' ? console.warn :
                    level === 'info' ? console.info : console.log;
    consoleFn('[' + level + '][' + module + '] ' + message, data || '');
  }

  function getLogs() {
    return logs.slice();
  }

  function clearLogs() {
    logs = [];
  }

  // 便捷日志方法
  var wmsLogger = {
    info: function(module, message, data) {
      addLog('info', module, message, data);
    },
    warn: function(module, message, data) {
      addLog('warn', module, message, data);
    },
    error: function(module, message, data) {
      addLog('error', module, message, data);
    },
    getLogs: getLogs,
    clear: clearLogs
  };

  // ========== WebView2 Communication ==========

  function isWebView2() {
    return !!(window.chrome && window.chrome.webview);
  }

  function sendToHost(type, data) {
    if (!isWebView2()) return;
    try {
      window.chrome.webview.postMessage({ type: type, data: data });
    } catch (e) {
      // 通信失败不影响前端功能
    }
  }

  // ========== Network Status Monitoring ==========

  function setupNetworkListener() {
    window.addEventListener('offline', function() {
      showWarning('网络连接已断开');
      wmsLogger.warn('network', '网络连接已断开');
    });

    window.addEventListener('online', function() {
      showInfo('网络已恢复');
      wmsLogger.info('network', '网络已恢复');

      // 触发地图重绘
      if (window.wmsMap && typeof window.wmsMap.invalidateSize === 'function') {
        window.wmsMap.invalidateSize();
      }
    });

    // 初始状态检查
    if (!navigator.onLine) {
      showWarning('网络连接已断开');
      wmsLogger.warn('network', '页面加载时网络已断开');
    }
  }

  // ========== Edge Case Detection ==========

  // 检测 WMS 返回空图片（尺寸极小）
  function checkEmptyImage(imgElement) {
    if (!imgElement) return false;
    var width = imgElement.naturalWidth || imgElement.width;
    var height = imgElement.naturalHeight || imgElement.height;
    // 宽高为 0 或极小（< 2px）视为空图片
    if (width < 2 || height < 2) {
      return true;
    }
    return false;
  }

  // 检测 WMS 响应的 Content-Type 是否为图片
  function checkContentType(response) {
    if (!response || !response.headers) return true;
    var contentType = response.headers.get('content-type') || '';
    if (contentType && contentType.indexOf('image') === -1) {
      return false;
    }
    return true;
  }

  // 包装 fetch 以记录 WMS 请求
  function logWmsRequest(url, startTime, response, error) {
    var duration = Date.now() - startTime;
    if (error) {
      wmsLogger.error('wms', 'WMS 请求失败', {
        url: url,
        status: 0,
        duration: duration,
        error: error.message || String(error)
      });
    } else {
      var status = response ? response.status : 0;
      var level = (response && response.ok) ? 'info' : 'warn';
      wmsLogger[level]('wms', 'WMS 请求完成', {
        url: url,
        status: status,
        duration: duration
      });
    }
  }

  // ========== Global Error Handler ==========

  function setupGlobalErrorHandler() {
    window.addEventListener('error', function(event) {
      wmsLogger.error('global', '未捕获异常', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    window.addEventListener('unhandledrejection', function(event) {
      wmsLogger.error('global', '未处理的 Promise 拒绝', {
        reason: event.reason ? (event.reason.message || String(event.reason)) : 'unknown'
      });
    });
  }

  // ========== Expose Global API ==========

  window.showError = showError;
  window.showWarning = showWarning;
  window.showInfo = showInfo;
  window.wmsLogger = wmsLogger;
  window.wmsErrorUtils = {
    checkEmptyImage: checkEmptyImage,
    checkContentType: checkContentType,
    logWmsRequest: logWmsRequest,
    sendToHost: sendToHost,
    isWebView2: isWebView2
  };

  // ========== Init ==========

  function init() {
    setupNetworkListener();
    setupGlobalErrorHandler();
    wmsLogger.info('error', '错误处理与日志模块已初始化');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
