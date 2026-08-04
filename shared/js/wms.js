// wms.js - WMS 图层创建与叠加管理（支持多图层叠加）
(function() {
  'use strict';

  // 创建 WMS 图层（供 layers.js 调用）
  // 返回 L.TileLayer.WMS 实例，CRS 跟随当前地图投影
  function createWmsLayer(service, layerName) {
    var map = window.wmsMap;
    if (!map) {
      console.error('[WMS] 地图未初始化');
      return null;
    }

    // 获取当前地图 CRS 编号
    var currentCrs = map.options.crs && map.options.crs.code
      ? map.options.crs.code
      : 'EPSG:4490';

    var isV130 = parseFloat(service.version || '1.1.1') >= 1.3;

    var wmsParams = {
      layers: layerName,
      format: service.format || 'image/png',
      transparent: true,
      version: service.version || '1.1.1'
    };

    // WMS 1.1.1 用 srs，1.3.0 用 crs
    if (isV130) {
      wmsParams.crs = currentCrs;
    } else {
      wmsParams.srs = currentCrs;
    }

    console.log('[WMS] 创建图层:', layerName, 'CRS:', currentCrs, 'URL:', service.url);
    return L.tileLayer.wms(service.url, wmsParams);
  }

  // 刷新所有可见图层（投影切换后调用）
  function refreshAllLayers() {
    if (!window.wmsLayers) return;
    var visibleLayers = window.wmsLayers.getVisibleLayers();

    // 先关闭所有可见图层，再重新打开
    visibleLayers.forEach(function(item) {
      window.wmsLayers.toggleLayer(item.service.id, item.layer.name, false);
    });
    visibleLayers.forEach(function(item) {
      window.wmsLayers.toggleLayer(item.service.id, item.layer.name, true);
    });
  }

  // 暴露全局 API
  window.wmsWms = {
    createWmsLayer: createWmsLayer,
    refreshAllLayers: refreshAllLayers
  };

  console.log('[WMS] 模块初始化完成');
})();
