// projection.js - 投影管理系统（集成 epsg.io API，支持任意 EPSG 投影）
(function() {
  'use strict';

  // 预设投影（快速选择用）
  var presetProjections = {
    "EPSG:4490": {
      name: "CGCS2000 (经纬度)",
      proj4: "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
      unit: "度",
      resolutions: [0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001, 0.00005, 0.00002, 0.00001]
    },
    "EPSG:4534": {
      name: "CGCS2000 / 3度带 114°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]
    },
    "EPSG:4535": {
      name: "CGCS2000 / 3度带 117°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]
    },
    "EPSG:4536": {
      name: "CGCS2000 / 3度带 120°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]
    },
    "EPSG:4526": {
      name: "CGCS2000 / 3度带 111°E",
      proj4: "+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=37500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]
    },
    "EPSG:3857": {
      name: "Web 墨卡托",
      proj4: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +no_defs +type=crs",
      unit: "米",
      resolutions: [156543.03390625, 78271.516953125, 39135.7584765625, 19567.87923828125, 9783.939619140625, 4891.9698095703125, 2445.9849047851562, 1222.9924523925781, 611.4962261962891, 305.74811309814453, 152.87405654907226, 76.43702827453613, 38.218514137268066, 19.109257068634033, 9.554628534317017, 4.777314267158508, 2.388657133579254, 1.194328566789627, 0.5971642833948135]
    }
  };

  // 注册所有预设投影
  Object.keys(presetProjections).forEach(function(epsg) {
    proj4.defs(epsg, presetProjections[epsg].proj4);
  });

  var currentEpsg = 'EPSG:4490';

  // 从 proj4 字符串解析 origin（false easting/northing）
  function parseOrigin(proj4def) {
    var x0 = 0, y0 = 0;
    var xMatch = proj4def.match(/\+x_0=([-\d.]+)/);
    var yMatch = proj4def.match(/\+y_0=([-\d.]+)/);
    if (xMatch) x0 = parseFloat(xMatch[1]);
    if (yMatch) y0 = parseFloat(yMatch[1]);
    return [x0, y0];
  }

  // 创建投影 CRS
  function createProjectedCrs(epsgCode, proj4def, resolutions) {
    if (!proj4.defs(epsgCode)) {
      proj4.defs(epsgCode, proj4def);
    }
    return new L.Proj.CRS(epsgCode, proj4def, {
      origin: parseOrigin(proj4def),
      resolutions: resolutions || [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]
    });
  }

  // 从 epsg.io 查询投影定义
  function queryFromEpsgIo(epsgCode) {
    var code = epsgCode.replace('EPSG:', '');
    var url = 'https://epsg.io/' + code + '.proj4';

    return fetch(url)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.text();
      })
      .then(function(proj4def) {
        proj4def = proj4def.trim();
        if (!proj4def || proj4def.indexOf('+proj=') !== 0) {
          throw new Error('epsg.io 返回无效的 proj4 字符串');
        }
        return proj4def;
      });
  }

  // 切换投影
  function switchProjection(epsgCode, proj4def, resolutions) {
    var map = window.wmsMap;
    if (!map) {
      console.error('[Projection] 地图未初始化');
      return false;
    }

    // 如果没有提供 proj4def，尝试从预设获取
    if (!proj4def) {
      var preset = presetProjections[epsgCode];
      if (preset) {
        proj4def = preset.proj4;
        resolutions = preset.resolutions;
      } else {
        console.error('[Projection] 未找到投影定义:', epsgCode);
        return false;
      }
    }

    // 创建新 CRS
    var newCrs;
    try {
      newCrs = createProjectedCrs(epsgCode, proj4def, resolutions);
    } catch (err) {
      console.error('[Projection] 创建 CRS 失败:', err);
      return false;
    }

    // 保存当前地理中心
    var currentCenter = map.getCenter();

    // 替换 CRS
    map.options.crs = newCrs;
    window.wmsCrs = newCrs;
    currentEpsg = epsgCode;

    // 重新定位
    map.setView(currentCenter, map.getZoom());

    // 更新 UI 显示
    updateProjInfo(epsgCode, proj4def);

    // 刷新所有 WMS 图层（使用新 CRS）
    if (window.wmsWms && window.wmsWms.refreshAllLayers) {
      window.wmsWms.refreshAllLayers();
    }

    // 缩放至图层可见范围
    setTimeout(function() {
      if (window.wmsLayers && window.wmsLayers.zoomToVisibleLayers) {
        window.wmsLayers.zoomToVisibleLayers();
      }
    }, 500);

    console.log('[Projection] 已切换到:', epsgCode);
    return true;
  }

  // 更新投影信息显示
  function updateProjInfo(epsg, proj4def) {
    var infoEl = document.getElementById('current-proj-info');
    if (!infoEl) return;

    var preset = presetProjections[epsg];
    var name = preset ? preset.name : epsg;
    // 从预设获取单位，或从 proj4 字符串解析
    var unit;
    if (preset) {
      unit = preset.unit;
    } else if (proj4def) {
      // proj4 字符串中 +units=m 表示米，+units=ft 表示英尺，没有 +units 通常是经纬度（度）
      if (proj4def.indexOf('+units=m') >= 0 || proj4def.indexOf('+units=m ') >= 0) {
        unit = '米';
      } else if (proj4def.indexOf('+units=ft') >= 0) {
        unit = '英尺';
      } else if (proj4def.indexOf('+proj=longlat') >= 0 || proj4def.indexOf('+proj=latlong') >= 0) {
        unit = '度';
      } else {
        unit = '米'; // 投影坐标系默认米
      }
    } else {
      unit = '未知';
    }

    infoEl.textContent = '当前: ' + epsg + ' (' + name + ', 单位: ' + unit + ')';
    infoEl.title = proj4def || '';

    // 同步下拉框选中状态
    var select = document.getElementById('projection-select');
    if (select) select.value = epsg;
  }

  // 从输入框查询并应用投影
  function queryAndApplyProjection() {
    var input = document.getElementById('epsg-input');
    if (!input) return;

    var code = input.value.trim();
    if (!code) {
      setStatus('请输入 EPSG 编号', true);
      return;
    }

    // 规范化 EPSG 编号
    var epsgCode = code.indexOf('EPSG:') === 0 ? code : 'EPSG:' + code;

    // 如果是预设投影，直接切换
    if (presetProjections[epsgCode]) {
      switchProjection(epsgCode);
      setStatus('已切换到预设投影: ' + epsgCode);
      return;
    }

    // 从 epsg.io 查询
    setStatus('正在从 epsg.io 查询 ' + epsgCode + '...');
    queryFromEpsgIo(epsgCode)
      .then(function(proj4def) {
        // 注册投影
        proj4.defs(epsgCode, proj4def);
        // 切换（使用默认 resolutions）
        if (switchProjection(epsgCode, proj4def)) {
          setStatus('已应用投影: ' + epsgCode);
        } else {
          setStatus('投影切换失败', true);
        }
      })
      .catch(function(err) {
        setStatus('查询失败: ' + err.message, true);
      });
  }

  function setStatus(msg, isError) {
    var bar = document.getElementById('status-bar');
    if (bar) {
      bar.textContent = msg;
      bar.style.color = isError ? '#dc3545' : '#666';
    }
  }

  // 获取当前投影信息
  function getCurrentProjection() {
    return currentEpsg;
  }

  // 获取预设投影列表
  function listPresetProjections() {
    return Object.keys(presetProjections).map(function(epsg) {
      return { epsg: epsg, name: presetProjections[epsg].name, unit: presetProjections[epsg].unit };
    });
  }

  // 暴露全局 API
  window.wmsProjection = {
    switch: switchProjection,
    queryFromEpsgIo: queryFromEpsgIo,
    queryAndApply: queryAndApplyProjection,
    getCurrent: getCurrentProjection,
    listPresets: listPresetProjections,
    createCrs: createProjectedCrs
  };

  // 绑定 UI 事件
  function bindEvents() {
    var queryBtn = document.getElementById('btn-query-epsg');
    var applyBtn = document.getElementById('btn-apply-proj');
    var epsgInput = document.getElementById('epsg-input');
    var projSelect = document.getElementById('projection-select');

    if (queryBtn) {
      queryBtn.addEventListener('click', queryAndApplyProjection);
    }
    if (applyBtn) {
      applyBtn.addEventListener('click', queryAndApplyProjection);
    }
    if (epsgInput) {
      epsgInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') queryAndApplyProjection();
      });
    }
    if (projSelect) {
      projSelect.addEventListener('change', function() {
        var epsg = this.value;
        if (!epsg) return;
        var preset = presetProjections[epsg];
        if (preset) {
          switchProjection(epsg, preset.proj4, preset.resolutions);
        }
      });
    }
  }

  // 初始化下拉框
  function initProjectionSelect() {
    var select = document.getElementById('projection-select');
    if (!select) return;
    var presets = listPresetProjections();
    presets.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.epsg;
      opt.textContent = p.name + ' (' + p.epsg + ')';
      if (p.epsg === currentEpsg) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initProjectionSelect();
      bindEvents();
      updateProjInfo(currentEpsg, presetProjections[currentEpsg].proj4);
    });
  } else {
    initProjectionSelect();
    bindEvents();
    updateProjInfo(currentEpsg, presetProjections[currentEpsg].proj4);
  }

  console.log('[Projection] 模块初始化完成，预设投影:', Object.keys(presetProjections).join(', '));
})();
