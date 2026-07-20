// WMS Map Plugin - Output Module
// Task 9: GetMap 出图与截图功能

(function() {
  'use strict';

  var IMG_WIDTH = 800;
  var IMG_HEIGHT = 600;

  // 更新状态栏
  function setStatus(msg, isError) {
    var bar = document.getElementById('status-bar');
    if (bar) {
      bar.textContent = msg;
      bar.style.color = isError ? '#dc3545' : '#666';
    }
  }

  // 获取当前 WMS 服务信息
  function getCurrentService() {
    var serviceId = window.wmsWms ? window.wmsWms.getCurrentServiceId() : null;
    if (!serviceId || !window.wmsLayers) return null;
    return window.wmsLayers.findService(serviceId);
  }

  // WMS GetMap 出图（主路径）
  function getMapImage() {
    var map = window.wmsMap;
    if (!map) {
      return Promise.reject(new Error('地图未初始化'));
    }

    var service = getCurrentService();
    if (!service) {
      return Promise.reject(new Error('当前图层服务不可用'));
    }

    var layerName = window.wmsWms.getCurrentLayerName() || '0';
    var bounds = map.getBounds();
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();

    // WMS 1.1.1 BBOX 格式: minx,miny,maxx,maxy（经纬度）
    var bbox = sw.lng.toFixed(6) + ',' + sw.lat.toFixed(6) + ',' +
               ne.lng.toFixed(6) + ',' + ne.lat.toFixed(6);

    var url = service.url +
      '?SERVICE=WMS' +
      '&VERSION=1.1.1' +
      '&REQUEST=GetMap' +
      '&LAYERS=' + encodeURIComponent(layerName) +
      '&SRS=EPSG:4490' +
      '&BBOX=' + bbox +
      '&WIDTH=' + IMG_WIDTH +
      '&HEIGHT=' + IMG_HEIGHT +
      '&FORMAT=image/png';

    setStatus('正在 GetMap 出图...');

    return fetch(url)
      .then(function(resp) {
        if (!resp.ok) {
          throw new Error('HTTP ' + resp.status);
        }
        var contentType = resp.headers.get('content-type') || '';
        if (contentType.indexOf('image') === -1) {
          throw new Error('响应非图片格式: ' + contentType);
        }
        return resp.blob();
      })
      .then(function(blob) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onloadend = function() {
            resolve(reader.result);
          };
          reader.onerror = function() {
            reject(new Error('Base64 转换失败'));
          };
          reader.readAsDataURL(blob);
        });
      })
      .then(function(base64) {
        setStatus('GetMap 出图完成');
        return base64;
      });
  }

  // html2canvas 截图（备选路径）
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

  // 绑定按钮事件
  function bindEvents() {
    var btnGetmap = document.getElementById('btn-getmap');
    var btnScreenshot = document.getElementById('btn-screenshot');

    if (btnGetmap) {
      btnGetmap.addEventListener('click', function() {
        getMapImage()
          .then(function(base64) {
            console.log('GetMap 出图成功, 长度:', base64.length);
          })
          .catch(function(err) {
            console.error('GetMap 出图失败:', err);
            setStatus('GetMap 出图失败，请检查网络连接', true);
          });
      });
    }

    if (btnScreenshot) {
      btnScreenshot.addEventListener('click', function() {
        screenshotImage()
          .then(function(base64) {
            console.log('截图成功, 长度:', base64.length);
          })
          .catch(function(err) {
            console.error('截图失败:', err);
            setStatus('截图失败，请使用 GetMap 出图', true);
          });
      });
    }
  }

  // 暴露全局 API（默认使用 GetMap 方式）
  window.getMapImageBase64 = function() {
    return getMapImage();
  };

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }

  console.log('Output module initialized');

})();
