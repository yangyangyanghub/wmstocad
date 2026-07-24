// WMS Map Plugin - Output Module
// GetMap 出图与截图功能

(function() {
  'use strict';

  var IMG_WIDTH = 800;
  var IMG_HEIGHT = 600;
  var GETMAP_TIMEOUT_MS = 30000;
  var RETRY_DELAY_MS = 1000;

  function setStatus(msg, isError) {
    var bar = document.getElementById('status-bar');
    if (bar) {
      bar.textContent = msg;
      bar.style.color = isError ? '#dc3545' : '#666';
    }
  }

  function getCurrentService() {
    if (!window.wmsLayers) return null;
    var visibleLayers = window.wmsLayers.getVisibleLayers();
    if (visibleLayers.length === 0) return null;
    return visibleLayers[0].service;
  }

  function getCurrentLayerName() {
    if (!window.wmsLayers) return '0';
    var visibleLayers = window.wmsLayers.getVisibleLayers();
    if (visibleLayers.length === 0) return '0';
    return visibleLayers[0].layer.name || '0';
  }

  function hostLog(level, message) {
    if (window.wmsAdapter && window.wmsAdapter.sendLog) {
      window.wmsAdapter.sendLog(level, message);
    }
  }

  function appendQuery(url, query) {
    var sep = url.indexOf('?') === -1 ? '?' : (/[?&]$/.test(url) ? '' : '&');
    return url + sep + query;
  }

  function fetchWithTimeout(url, timeoutMs) {
    var controller = null;
    var hasAbort = typeof AbortController !== 'undefined';

    if (hasAbort) {
      controller = new AbortController();
    }

    var timedOut = false;
    var timeoutId = setTimeout(function() {
      timedOut = true;
      if (controller) controller.abort();
    }, timeoutMs);

    var fetchOpts = controller ? { signal: controller.signal } : {};

    return fetch(url, fetchOpts)
      .then(function(resp) {
        clearTimeout(timeoutId);
        return resp;
      })
      .catch(function(err) {
        clearTimeout(timeoutId);
        if (timedOut) {
          throw new Error('TIMEOUT');
        }
        throw err;
      });
  }

  function doGetMap(url, retryCount, qaContext) {
    var startTime = Date.now();
    var lastResp = null;
    var utils = window.wmsErrorUtils || {};

    return fetchWithTimeout(url, GETMAP_TIMEOUT_MS)
      .then(function(resp) {
        lastResp = resp;
        hostLog('INFO', 'GetMap HTTP 状态: ' + resp.status);
        if (!resp.ok) {
          var httpErr = new Error('HTTP ' + resp.status);
          httpErr.isHttpError = true;
          throw httpErr;
        }

        var contentType = resp.headers.get('content-type') || '';
        var isImage = utils.checkContentType ? utils.checkContentType(resp) : contentType.indexOf('image') !== -1;
        if (!isImage) {
          throw new Error('响应非图片格式: ' + contentType);
        }

        return resp.blob();
      })
      .then(function(blob) {
        hostLog('INFO', 'GetMap Blob 大小: ' + blob.size + ' bytes');
        if (blob.size < 1000) {
          throw new Error('服务返回空白或错误图片: ' + blob.size + ' bytes');
        }
        return blob;
      })
      .then(function(blob) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onloadend = function() { resolve(reader.result); };
          reader.onerror = function() { reject(new Error('Base64 转换失败')); };
          reader.readAsDataURL(blob);
        });
      })
      .then(function(base64) {
        if (utils.logWmsRequest) {
          utils.logWmsRequest(url, startTime, lastResp, null, qaContext);
        }
        console.log('[Output] GetMap 出图成功，base64 长度:', base64.length);
        hostLog('INFO', 'GetMap 出图成功，base64 长度: ' + base64.length);
        return base64;
      })
      .catch(function(err) {
        if (utils.logWmsRequest) {
          utils.logWmsRequest(url, startTime, lastResp, err, qaContext);
        }

        var isTimeout = err && err.message === 'TIMEOUT';
        var isNetwork = err && err.name === 'TypeError';

        if ((isTimeout || isNetwork) && retryCount < 1) {
          console.warn('[Output] GetMap 请求失败，1 秒后重试:', err.message || err);
          return new Promise(function(resolve, reject) {
            setTimeout(function() {
              doGetMap(url, retryCount + 1, qaContext).then(resolve).catch(reject);
            }, RETRY_DELAY_MS);
          });
        }

        if (isTimeout) {
          hostLog('ERROR', 'GetMap 出图超时');
          throw new Error('GetMap 出图超时');
        }
        if (isNetwork) {
          hostLog('ERROR', 'GetMap 网络请求失败');
          throw new Error('GetMap 网络请求失败');
        }
        hostLog('ERROR', 'GetMap 出图失败: ' + (err.message || err));
        throw err;
      });
  }

  function getMapImage() {
    hostLog('INFO', 'getMapImage 开始执行');

    var map = window.wmsMap;
    if (!map) {
      hostLog('WARN', 'getMapImage: 地图未初始化');
      return Promise.reject(new Error('地图未初始化'));
    }

    hostLog('INFO', 'getMapImage: 地图对象就绪');

    var service = getCurrentService();
    if (!service) {
      var hasLayers = !!(window.wmsLayers && window.wmsLayers.getVisibleLayers().length);
      hostLog('WARN', 'getMapImage: 服务不可用 hasVisibleLayers=' + hasLayers);
      return Promise.reject(new Error('当前图层服务不可用'));
    }

    hostLog('INFO', 'getMapImage: 服务就绪, url=' + (service.url || 'undefined'));

    var layerName = getCurrentLayerName();
    var bounds = map.getBounds();
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();

    var bbox = sw.lng.toFixed(6) + ',' + sw.lat.toFixed(6) + ',' +
      ne.lng.toFixed(6) + ',' + ne.lat.toFixed(6);

    var query = 'SERVICE=WMS' +
      '&VERSION=1.1.1' +
      '&REQUEST=GetMap' +
      '&LAYERS=' + encodeURIComponent(layerName) +
      '&SRS=EPSG:4490' +
      '&BBOX=' + bbox +
      '&WIDTH=' + IMG_WIDTH +
      '&HEIGHT=' + IMG_HEIGHT +
      '&FORMAT=image/png';
    var url = appendQuery(service.url, query);

    setStatus('正在 GetMap 出图...');
    console.log('[Output] GetMap URL:', url);
    hostLog('INFO', 'GetMap URL: ' + url);

    var qaContext = { layerName: layerName, bbox: bbox };

    return doGetMap(url, 0, qaContext)
      .then(function(base64) {
        setStatus('GetMap 出图完成');
        return base64;
      });
  }

  function screenshotImage() {
    var mapEl = document.getElementById('map');
    if (!mapEl) {
      return Promise.reject(new Error('地图容器未找到'));
    }

    if (typeof html2canvas === 'undefined') {
      return Promise.reject(new Error('html2canvas 库未加载'));
    }

    setStatus('正在截图...');

    return html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      width: mapEl.clientWidth,
      height: mapEl.clientHeight
    }).then(function(canvas) {
      var base64 = canvas.toDataURL('image/png');
      setStatus('截图完成');
      return base64;
    });
  }

  function bindEvents() {
    var btnGetmap = document.getElementById('btn-getmap');
    var btnScreenshot = document.getElementById('btn-screenshot');

    if (btnGetmap) {
      btnGetmap.addEventListener('click', function() {
        window.wmsGetMapPromise = getMapImage();
        window.wmsGetMapPromise
          .then(function(base64) {
            console.log('[Output] GetMap 出图成功，长度:', base64.length);
          })
          .catch(function(err) {
            console.error('[Output] GetMap 出图失败:', err.message || err);
            if (err && err.message && err.message.indexOf('超时') !== -1) {
              setStatus('出图超时，请重试', true);
            } else if (err && err.message === '服务返回空图片') {
              setStatus('服务返回空图片', true);
            } else {
              setStatus('GetMap 出图失败，请检查网络连接', true);
            }
          });
      });
    }

    if (btnScreenshot) {
      btnScreenshot.addEventListener('click', function() {
        screenshotImage()
          .then(function(base64) {
            console.log('[Output] 截图成功，长度:', base64.length);
          })
          .catch(function(err) {
            console.error('[Output] 截图失败:', err.message || err);
            setStatus('截图失败，请使用 GetMap 出图', true);
          });
      });
    }
  }

  window.getMapImageBase64 = function() {
    return getMapImage();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }

  console.log('[Output] module initialized');
})();
