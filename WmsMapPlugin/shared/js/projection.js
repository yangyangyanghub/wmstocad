// WMS Map Plugin - Projection Management
// Task 7: Projection switching system with proj4js

(function() {
  'use strict';

  // 1. Register all predefined projections
  var projections = {
    "EPSG:4490": {
      name: "CGCS2000 (经纬度)",
      proj4: "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
      unit: "度",
      resolutions: [
        0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001,
        0.0005, 0.0002, 0.0001, 0.00005, 0.00002, 0.00001
      ]
    },
    "EPSG:4534": {
      name: "CGCS2000 / 3度带 114°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [
        1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1
      ]
    },
    "EPSG:4535": {
      name: "CGCS2000 / 3度带 117°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [
        1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1
      ]
    },
    "EPSG:4536": {
      name: "CGCS2000 / 3度带 120°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [
        1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1
      ]
    },
    "EPSG:3857": {
      name: "Web 墨卡托",
      proj4: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [
        156543.03390625, 78271.516953125, 39135.7584765625, 19567.87923828125,
        9783.939619140625, 4891.9698095703125, 2445.9849047851562,
        1222.9924523925781, 611.4962261962891, 305.74811309814453,
        152.87405654907226, 76.43702827453613, 38.218514137268066,
        19.109257068634033, 9.554628534317017, 4.777314267158508,
        2.388657133579254, 1.194328566789627, 0.5971642833948135
      ]
    }
  };

  // Register all projections with proj4
  Object.keys(projections).forEach(function(epsg) {
    proj4.defs(epsg, projections[epsg].proj4);
  });

  // 2. Create projected CRS function
  function createProjectedCrs(epsgCode, proj4def, resolutions) {
    // Register projection if not already registered
    if (!proj4.defs(epsgCode)) {
      proj4.defs(epsgCode, proj4def);
    }

    return new L.Proj.CRS(epsgCode, proj4def, {
      origin: [0, 0],
      resolutions: resolutions
    });
  }

  // 3. Switch projection
  function switchProjection(epsgCode, customProj4) {
    var map = window.wmsMap;
    if (!map) {
      console.error("Map not initialized");
      return false;
    }

    var projConfig;

    if (epsgCode === "custom" && customProj4) {
      // Custom projection
      projConfig = {
        name: "自定义投影",
        proj4: customProj4,
        unit: "米",
        resolutions: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]
      };

      // Try to register custom projection
      try {
        proj4.defs("EPSG:CUSTOM", customProj4);
        epsgCode = "EPSG:CUSTOM";
      } catch (err) {
        console.error("Invalid custom projection:", err);
        alert("投影参数无效，已切换到默认坐标系");
        epsgCode = "EPSG:4490";
        projConfig = projections[epsgCode];
      }
    } else {
      projConfig = projections[epsgCode];
      if (!projConfig) {
        console.error("Projection not found:", epsgCode);
        alert("投影参数无效，已切换到默认坐标系");
        epsgCode = "EPSG:4490";
        projConfig = projections[epsgCode];
      }
    }

    // Create new CRS
    var newCrs;
    try {
      newCrs = createProjectedCrs(epsgCode, projConfig.proj4, projConfig.resolutions);
    } catch (err) {
      console.error("Failed to create CRS:", err);
      alert("投影参数无效，已切换到默认坐标系");
      // Fall back to EPSG:4490
      epsgCode = "EPSG:4490";
      projConfig = projections[epsgCode];
      newCrs = createProjectedCrs(epsgCode, projConfig.proj4, projConfig.resolutions);
    }

    // Get current center in lat/lng
    var currentCenter = map.getCenter();

    // Update map CRS
    map.options.crs = newCrs;

    // Reset view to same geographic location
    map.setView(currentCenter, map.getZoom());

    // Update global reference
    window.wmsCrs = newCrs;

    console.log("Projection switched to:", epsgCode, projConfig.name);
    console.log("Unit:", projConfig.unit);

    return true;
  }

  // 4. Get projection info
  function getProjectionInfo(epsgCode) {
    return projections[epsgCode] || null;
  }

  // 5. List all available projections
  function listProjections() {
    return Object.keys(projections).map(function(epsg) {
      return {
        epsg: epsg,
        name: projections[epsg].name,
        unit: projections[epsg].unit
      };
    });
  }

  // 6. Expose global API
  window.wmsProjection = {
    switch: switchProjection,
    get: getProjectionInfo,
    list: listProjections,
    createCrs: createProjectedCrs
  };

  // 7. 填充投影下拉框
  function populateProjectionSelect() {
    var projSelect = document.getElementById('projection-select');
    if (!projSelect) return;

    projSelect.innerHTML = '';

    Object.keys(projections).forEach(function(epsg) {
      var opt = document.createElement('option');
      opt.value = epsg;
      opt.textContent = epsg + ' - ' + projections[epsg].name;
      projSelect.appendChild(opt);
    });

    // 添加"自定义"选项
    var customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '自定义...';
    projSelect.appendChild(customOpt);

    // 设置默认投影（优先从 layers.json 读取）
    var defaultEpsg = 'EPSG:4490';
    if (window.wmsLayers) {
      var cfg = window.wmsLayers.getConfig();
      if (cfg && cfg.defaultProjection) {
        defaultEpsg = cfg.defaultProjection.epsg;
      }
    }
    projSelect.value = defaultEpsg;
  }

  // 8. Bind UI events (if projection-select exists)
  document.addEventListener('DOMContentLoaded', function() {
    // 等待 layers.json 加载完成后填充投影下拉框
    var tryPopulate = setInterval(function() {
      if (window.wmsLayers && window.wmsLayers.getConfig()) {
        clearInterval(tryPopulate);
        populateProjectionSelect();
      }
    }, 100);

    // 5 秒超时，使用内置投影数据
    setTimeout(function() {
      clearInterval(tryPopulate);
      populateProjectionSelect();
    }, 5000);

    var projSelect = document.getElementById('projection-select');
    var customInput = document.getElementById('custom-proj4');

    if (projSelect) {
      projSelect.addEventListener('change', function() {
        var selectedEpsg = projSelect.value;

        if (selectedEpsg === 'custom') {
          // Show custom input
          if (customInput) {
            customInput.parentElement.style.display = 'block';
          }
        } else {
          // Hide custom input
          if (customInput) {
            customInput.parentElement.style.display = 'none';
          }

          // Switch projection
          switchProjection(selectedEpsg);
        }
      });

      // Apply custom projection on Enter key
      if (customInput) {
        customInput.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            var customProj4 = customInput.value.trim();
            if (customProj4) {
              switchProjection('custom', customProj4);
            }
          }
        });
      }
    }
  });

  console.log("Projection module initialized");
  console.log("Available projections:", Object.keys(projections).join(', '));

})();
