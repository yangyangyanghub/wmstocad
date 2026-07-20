// WMS Map Plugin - WMS Layer Operations
// Task 8: WMS 图层操作模块

(function() {
  'use strict';

  var currentLayer = null;
  var currentServiceId = null;
  var currentLayerName = null;
  var requestTimer = null;

  // 创建 WMS 图层
  function createWmsLayer(service, layerName) {
    return L.tileLayer.wms(service.url, {
      layers: layerName,
      format: service.format || 'image/png',
      transparent: true,
      version: service.version || '1.1.1',
      srs: service.srs || 'EPSG:4490'
    });
  }

  // 带超时的 fetch 探测（用于检测 WMS 服务是否可达）
  function probeService(url, timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    var controller = null;
    var hasAbort = typeof AbortController !== 'undefined';

    if (hasAbort) {
      controller = new AbortController();
    }

    var timeoutId = setTimeout(function() {
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
        throw err;
      });
  }

  // 切换图层（带 300ms 防抖 + 1 次重试）
  function switchLayer(serviceId, layerName) {
    if (requestTimer) {
      clearTimeout(requestTimer);
    }

    return new Promise(function(resolve, reject) {
      requestTimer = setTimeout(function() {
        doSwitch(serviceId, layerName, 0)
          .then(resolve)
          .catch(reject);
      }, 300);
    });
  }

  // 实际切换逻辑（含重试）
  function doSwitch(serviceId, layerName, retryCount) {
    var map = window.wmsMap;
    if (!map) {
      return Promise.reject(new Error('地图未初始化'));
    }

    var service = window.wmsLayers ? window.wmsLayers.findService(serviceId) : null;
    if (!service) {
      return Promise.reject(new Error('服务未找到: ' + serviceId));
    }

    // 移除旧图层
    if (currentLayer) {
      map.removeLayer(currentLayer);
      currentLayer = null;
    }

    // 创建新图层
    var newLayer = createWmsLayer(service, layerName);

    // 探测服务可达性（超时 5s）
    return probeService(service.url)
      .then(function() {
        newLayer.addTo(map);
        currentLayer = newLayer;
        currentServiceId = serviceId;
        currentLayerName = layerName;

        // 同步全局引用
        window.wmsLayer = newLayer;

        console.log('WMS layer switched:', serviceId + '/' + layerName);
        return true;
      })
      .catch(function(err) {
        // 超时或网络错误：重试 1 次
        if (retryCount < 1) {
          console.warn('WMS 请求失败，重试中...', err);
          return doSwitch(serviceId, layerName, retryCount + 1);
        }
        console.error('WMS 请求失败（已重试）:', err);
        throw new Error('地图服务连接失败');
      });
  }

  // 获取当前图层
  function getCurrentLayer() {
    return currentLayer;
  }

  // 获取当前服务 ID
  function getCurrentServiceId() {
    return currentServiceId;
  }

  // 获取当前图层名
  function getCurrentLayerName() {
    return currentLayerName;
  }

  // 暴露全局 API
  window.wmsWms = {
    switchLayer: switchLayer,
    createLayer: createWmsLayer,
    getCurrentLayer: getCurrentLayer,
    getCurrentServiceId: getCurrentServiceId,
    getCurrentLayerName: getCurrentLayerName
  };

  console.log('WMS module initialized');

})();
