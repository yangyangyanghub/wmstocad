// layers.js - 图层配置管理模块（支持运行时添加/删除/多图层叠加）
(function() {
  'use strict';

  var STORAGE_KEY = 'wms_layers_config';
  var services = [];
  var layerElements = {}; // serviceId:layerName -> { visible: bool, leafletLayer: L.TileLayer.WMS }

  // 内置默认服务（layers.json 加载失败时的兜底）
  var DEFAULT_SERVICE = {
    id: 'default',
    name: '默认图层',
    url: 'http://61.240.150.90:8088/mixserver/services/map-ugcv5-dom202605y2m18level/wms111/dom202605y2m18level?',
    version: '1.1.1',
    srs: 'EPSG:4490',
    format: 'image/png',
    layers: [
      { name: '0', title: '默认图层', queryable: true }
    ]
  };

  function setStatus(msg, isError) {
    var bar = document.getElementById('status-bar');
    if (bar) {
      bar.textContent = msg;
      bar.style.color = isError ? '#dc3545' : '#666';
    }
  }

  // 生成唯一 ID
  function generateId() {
    return 'svc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  // 从 localStorage 加载持久化配置
  function loadFromStorage() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        if (data && Array.isArray(data.services)) {
          return data.services;
        }
      }
    } catch (e) {
      console.warn('[Layers] localStorage 读取失败:', e);
    }
    return null;
  }

  // 保存到 localStorage
  function saveToStorage() {
    try {
      var toSave = services.map(function(s) {
        return {
          id: s.id,
          name: s.name,
          url: s.url,
          version: s.version || '1.1.1',
          srs: s.srs || 'EPSG:4490',
          format: s.format || 'image/png',
          layers: s.layers
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ services: toSave }));
    } catch (e) {
      console.warn('[Layers] localStorage 保存失败:', e);
    }
  }

  // 从 layers.json 加载初始配置（首次运行或无 localStorage 时）
  function loadFromJson() {
    return fetch('layers.json')
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        if (!data || !Array.isArray(data.services)) throw new Error('格式错误');
        // 校验并加载服务
        data.services.forEach(function(svc) {
          if (svc.url && svc.layers && svc.layers.length > 0) {
            services.push(svc);
          }
        });
        saveToStorage();
        return services;
      })
      .catch(function(err) {
        console.warn('[Layers] layers.json 加载失败，使用默认服务:', err);
        services.push(JSON.parse(JSON.stringify(DEFAULT_SERVICE)));
        saveToStorage();
        return services;
      });
  }

  // 初始化
  function init() {
    var saved = loadFromStorage();
    if (saved && saved.length > 0) {
      services = saved;
      renderLayerList();
      // 自动加载所有可见图层
      services.forEach(function(svc) {
        svc.layers.forEach(function(lyr) {
          if (lyr.visible !== false) {
            toggleLayer(svc.id, lyr.name, true);
          }
        });
      });
    } else {
      loadFromJson().then(function() {
        renderLayerList();
        // 自动加载第一个图层的第一个子图层
        if (services.length > 0 && services[0].layers.length > 0) {
          toggleLayer(services[0].id, services[0].layers[0].name, true);
        }
      });
    }
  }

  // 添加 WMS 服务（通过 URL，自动调用 GetCapabilities 获取图层信息）
  function addService(url) {
    if (!url || !/^https?:\/\//.test(url)) {
      setStatus('URL 无效，需以 http:// 或 https:// 开头', true);
      return Promise.reject(new Error('URL 无效'));
    }

    setStatus('正在获取图层信息...');
    var svcId = generateId();

    return fetchCapabilities(url)
      .then(function(caps) {
        var svc = {
          id: svcId,
          name: caps.title || url.substr(0, 40),
          url: url,
          version: caps.version || '1.1.1',
          srs: 'EPSG:4490',
          format: 'image/png',
          layers: caps.layers
        };
        services.push(svc);
        saveToStorage();
        renderLayerList();

        // 自动加载第一个子图层
        if (svc.layers.length > 0) {
          toggleLayer(svc.id, svc.layers[0].name, true);
        }

        setStatus('图层已添加: ' + svc.name + ' (' + svc.layers.length + ' 个子图层)');

        // 缩放至新图层的可见范围
        setTimeout(function() {
          zoomToVisibleLayers();
        }, 500);

        return svc;
      })
      .catch(function(err) {
        setStatus('获取图层信息失败: ' + err.message, true);
        throw err;
      });
  }

  // 删除服务
  function removeService(serviceId) {
    // 先移除所有该服务的 Leaflet 图层
    var svc = findService(serviceId);
    if (svc) {
      svc.layers.forEach(function(lyr) {
        var key = serviceId + ':' + lyr.name;
        if (layerElements[key] && layerElements[key].leafletLayer) {
          var map = window.wmsMap;
          if (map) map.removeLayer(layerElements[key].leafletLayer);
        }
        delete layerElements[key];
      });
    }

    services = services.filter(function(s) { return s.id !== serviceId; });
    saveToStorage();
    renderLayerList();
    notifyLayersChanged();
    setStatus('图层已删除');
  }

  // 切换图层可见性
  function toggleLayer(serviceId, layerName, visible) {
    var key = serviceId + ':' + layerName;
    var map = window.wmsMap;
    if (!map) return;

    var svc = findService(serviceId);
    if (!svc) return;

    // 更新 layer 的 visible 状态
    svc.layers.forEach(function(lyr) {
      if (lyr.name === layerName) lyr.visible = visible;
    });
    saveToStorage();

    if (visible) {
      // 添加图层
      if (!layerElements[key] || !layerElements[key].leafletLayer) {
        var leafletLayer = window.wmsWms.createWmsLayer(svc, layerName);
        if (leafletLayer) {
          leafletLayer.addTo(map);
          layerElements[key] = { visible: true, leafletLayer: leafletLayer };
        }
      } else {
        layerElements[key].leafletLayer.addTo(map);
        layerElements[key].visible = true;
      }
    } else {
      // 移除图层
      if (layerElements[key] && layerElements[key].leafletLayer) {
        map.removeLayer(layerElements[key].leafletLayer);
        layerElements[key].visible = false;
      }
    }

    renderLayerList();
    notifyLayersChanged();
  }

  // 获取当前可见的图层数组
  function getVisibleLayers() {
    var result = [];
    services.forEach(function(svc) {
      svc.layers.forEach(function(lyr) {
        if (lyr.visible !== false) {
          result.push({ service: svc, layer: lyr });
        }
      });
    });
    return result;
  }

  // 通知 C# 端图层可见性已变化（用于 TransientManager 动态背景刷新）
  function notifyLayersChanged() {
    if (!window.wmsAdapter || !window.wmsAdapter.isHosted) return;
    var map = window.wmsMap;
    var crs = map && map.options.crs && map.options.crs.code ? map.options.crs.code : 'EPSG:4490';
    var visibleLayers = getVisibleLayers().map(function(item) {
      return {
        url: item.service.url,
        layerName: item.layer.name,
        crs: crs,
        format: item.service.format || 'image/png'
      };
    });
    window.wmsAdapter.sendToHost({ type: 'layersChanged', layers: visibleLayers });
  }

  // 获取当前视图的地理范围（所有可见图层的并集）
  function getCurrentBBox() {
    var map = window.wmsMap;
    if (!map) return null;
    var bounds = map.getBounds();
    return {
      minx: bounds.getWest(),
      miny: bounds.getSouth(),
      maxx: bounds.getEast(),
      maxy: bounds.getNorth()
    };
  }

  // 缩放至所有可见图层的范围
  function zoomToVisibleLayers() {
    var map = window.wmsMap;
    if (!map) return false;

    var visibleLayers = getVisibleLayers();
    if (visibleLayers.length === 0) return false;

    // 收集所有可见图层的 LatLonBoundingBox（来自 GetCapabilities）
    var minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
    var hasBbox = false;

    visibleLayers.forEach(function(item) {
      var bbox = item.layer.bbox;
      if (bbox && bbox.minx != null && bbox.miny != null &&
          bbox.maxx != null && bbox.maxy != null) {
        hasBbox = true;
        if (bbox.minx < minLng) minLng = bbox.minx;
        if (bbox.miny < minLat) minLat = bbox.miny;
        if (bbox.maxx > maxLng) maxLng = bbox.maxx;
        if (bbox.maxy > maxLat) maxLat = bbox.maxy;
      }
    });

    if (!hasBbox) return false;

    // LatLonBoundingBox 是 WGS84 经纬度，直接传入 fitBounds
    // Leaflet 的 CRS 会通过 projection.project() 自动完成坐标转换
    var sw = L.latLng(minLat, minLng);
    var ne = L.latLng(maxLat, maxLng);
    map.fitBounds(L.latLngBounds(sw, ne), { padding: [20, 20] });
    console.log('[Layers] 已缩放至图层范围');
    return true;
  }

  // 查找服务
  function findService(serviceId) {
    for (var i = 0; i < services.length; i++) {
      if (services[i].id === serviceId) return services[i];
    }
    return null;
  }

  // 获取所有服务
  function getServices() {
    return services;
  }

  // 渲染图层列表 UI
  function renderLayerList() {
    var container = document.getElementById('layer-list');
    if (!container) return;
    container.innerHTML = '';

    if (services.length === 0) {
      container.innerHTML = '<div class="layer-empty">暂无图层，请添加 WMS 服务 URL</div>';
      return;
    }

    services.forEach(function(svc) {
      svc.layers.forEach(function(lyr) {
        var key = svc.id + ':' + lyr.name;
        var isVisible = lyr.visible !== false && layerElements[key] && layerElements[key].visible !== false;

        var item = document.createElement('div');
        item.className = 'layer-item';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isVisible;
        checkbox.addEventListener('change', function() {
          toggleLayer(svc.id, lyr.name, checkbox.checked);
        });

        var label = document.createElement('span');
        label.className = 'layer-name';
        label.textContent = svc.name + ' - ' + (lyr.title || lyr.name);
        label.title = svc.url;

        var delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-layer';
        delBtn.textContent = '×';
        delBtn.title = '删除';
        delBtn.addEventListener('click', function() {
          removeService(svc.id);
        });

        item.appendChild(checkbox);
        item.appendChild(label);
        item.appendChild(delBtn);
        container.appendChild(item);
      });
    });
  }

  // 绑定 UI 事件
  function bindEvents() {
    var urlInput = document.getElementById('wms-url-input');
    var addBtn = document.getElementById('btn-add-layer');
    var refreshBtn = document.getElementById('btn-refresh-capabilities');

    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var url = urlInput ? urlInput.value.trim() : '';
        if (url) {
          addService(url).catch(function() {});
        }
      });
    }

    if (urlInput) {
      urlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          var url = urlInput.value.trim();
          if (url) {
            addService(url).catch(function() {});
          }
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        // 重新获取所有服务的 capabilities
        setStatus('正在刷新图层信息...');
        var promises = services.map(function(svc) {
          return fetchCapabilities(svc.url).then(function(caps) {
            svc.layers = caps.layers;
            svc.name = caps.title || svc.name;
          }).catch(function(err) {
            console.warn('[Layers] 刷新失败:', svc.id, err);
          });
        });
        Promise.all(promises).then(function() {
          saveToStorage();
          renderLayerList();
          setStatus('图层信息已刷新');
        });
      });
    }

    // 缩放至图层按钮
    var zoomBtn = document.getElementById('btn-zoom-layer');
    if (zoomBtn) {
      zoomBtn.addEventListener('click', function() {
        if (!zoomToVisibleLayers()) {
          setStatus('无可见图层或缺少范围信息', true);
        }
      });
    }
  }

  // GetCapabilities 请求
  function fetchCapabilities(url) {
    var sep = url.indexOf('?') === -1 ? '?' : (/[?&]$/.test(url) ? '' : '&');
    var capUrl = url + sep + 'SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1';

    return fetch(capUrl)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.text();
      })
      .then(function(xmlText) {
        return parseCapabilities(xmlText);
      });
  }

  // 解析 GetCapabilities XML
  function parseCapabilities(xmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlText, 'application/xml');

    var exception = doc.querySelector('ServiceException');
    if (exception) throw new Error('WMS 错误: ' + exception.textContent.trim());

    var caps = doc.querySelector('WMT_MS_Capabilities, WMS_Capabilities');
    var version = caps ? caps.getAttribute('version') : '1.1.1';

    var serviceEl = doc.querySelector('Service > Title');
    var title = serviceEl ? serviceEl.textContent.trim() : '';

    var layers = [];
    var layerEls = doc.querySelectorAll('Capability > Layer > Layer, Capability > Layer Layer');
    var seenNames = {};
    layerEls.forEach(function(el) {
      var nameEl = el.querySelector('Name');
      var titleEl = el.querySelector('Title');
      if (!nameEl) return;
      var name = nameEl.textContent.trim();
      if (seenNames[name]) return;
      seenNames[name] = true;

      // 获取支持的 SRS
      var srsEl = el.querySelector('SRS, CRS');
      var srsList = srsEl ? srsEl.textContent.trim().split(/\s+/) : ['EPSG:4490'];

      // 获取 BBox
      var bboxEl = el.querySelector('LatLonBoundingBox, EX_GeographicBoundingBox');
      var bbox = null;
      if (bboxEl && bboxEl.getAttribute('minx')) {
        bbox = {
          minx: parseFloat(bboxEl.getAttribute('minx')),
          miny: parseFloat(bboxEl.getAttribute('miny')),
          maxx: parseFloat(bboxEl.getAttribute('maxx')),
          maxy: parseFloat(bboxEl.getAttribute('maxy'))
        };
      }

      layers.push({
        name: name,
        title: titleEl ? titleEl.textContent.trim() : name,
        queryable: el.getAttribute('queryable') === '1',
        srs: srsList,
        bbox: bbox
      });
    });

    // 如果没有子图层，尝试用根图层
    if (layers.length === 0) {
      var rootLayer = doc.querySelector('Capability > Layer');
      if (rootLayer) {
        var rootName = rootLayer.querySelector('Name');
        var rootTitle = rootLayer.querySelector('Title');
        if (rootName) {
          layers.push({
            name: rootName.textContent.trim(),
            title: rootTitle ? rootTitle.textContent.trim() : rootName.textContent.trim(),
            queryable: false,
            srs: ['EPSG:4490'],
            bbox: null
          });
        }
      }
    }

    return { version: version, title: title, layers: layers };
  }

  // 暴露全局 API
  window.wmsLayers = {
    init: init,
    addService: addService,
    removeService: removeService,
    toggleLayer: toggleLayer,
    getVisibleLayers: getVisibleLayers,
    getCurrentBBox: getCurrentBBox,
    zoomToVisibleLayers: zoomToVisibleLayers,
    findService: findService,
    getServices: getServices,
    renderLayerList: renderLayerList,
    fetchCapabilities: fetchCapabilities,
    getDefaultServices: function() { return [JSON.parse(JSON.stringify(DEFAULT_SERVICE))]; }
  };

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); bindEvents(); });
  } else {
    init();
    bindEvents();
  }

})();
