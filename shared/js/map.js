// WMS Map Plugin - Map Initialization
// Task 6: Leaflet map init with EPSG:4490

(function() {
  'use strict';

  // 1. 注册 EPSG:4490 投影定义
  proj4.defs("EPSG:4490", "+proj=longlat +ellps=GRS80 +no_defs +type=crs");

  // 2. 创建 Leaflet CRS（坐标参考系）
  var crs4490 = new L.Proj.CRS(
    "EPSG:4490",
    "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
    {
      origin: [104.0, 35.0],
      resolutions: [
        0.1,        // Level 0: ~11km/pixel
        0.05,       // Level 1: ~5.5km/pixel
        0.02,       // Level 2: ~2.2km/pixel
        0.01,       // Level 3: ~1.1km/pixel
        0.005,      // Level 4: ~550m/pixel
        0.002,      // Level 5: ~220m/pixel
        0.001,      // Level 6: ~110m/pixel
        0.0005,     // Level 7: ~55m/pixel
        0.0002,     // Level 8: ~22m/pixel
        0.0001,     // Level 9: ~11m/pixel
        0.00005,    // Level 10: ~5.5m/pixel
        0.00002,    // Level 11: ~2.2m/pixel
        0.00001     // Level 12: ~1.1m/pixel
      ]
    }
  );

  // 3. 初始化地图实例
  var map = L.map('map', {
    crs: crs4490,
    center: [36.5, 114.5],
    zoom: 6,
    maxZoom: 12,
    minZoom: 0,
    zoomControl: true
  });

  // 4. 加载默认 WMS 图层
  var defaultWmsUrl = "http://61.240.150.90:8088/mixserver/services/map-ugcv5-dom202605y2m18level/wms111/dom202605y2m18level?";

  var defaultWmsLayer = L.tileLayer.wms(defaultWmsUrl, {
    layers: "0",
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    srs: "EPSG:4490"
  });

  defaultWmsLayer.addTo(map);

  // 5. 暴露全局接口供其他模块使用
  window.wmsMap = map;
  window.wmsCrs = crs4490;
  window.wmsLayer = defaultWmsLayer;

  // 6. 初始化日志
  console.log("Map initialized with EPSG:4490");
  console.log("Center:", map.getCenter());
  console.log("Zoom:", map.getZoom());
  console.log("WMS layer added:", defaultWmsUrl);

})();
