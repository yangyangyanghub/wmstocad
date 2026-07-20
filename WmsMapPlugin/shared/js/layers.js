// WMS Map Plugin - Layer Configuration Management
// Task 8: 图层配置管理模块

(function() {
  'use strict';

  var config = null;
  var configUrl = 'layers.json';
  var fetchDebounceTimer = null;

  // 从 layers.json 加载配置
  function loadConfig() {
    return fetch(configUrl)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        if (!data || !Array.isArray(data.services)) {
          throw new Error('配置文件格式错误');
        }
        config = data;
        return data;
      });
  }

  // 更新状态栏
  function setStatus(msg, isError) {
    var bar = document.getElementById('status-bar');
    if (bar) {
      bar.textContent = msg;
      bar.style.color = isError ? '#dc3545' : '#666';
    }
  }

  // 填充图层下拉框
  function populateLayerSelect() {
    var select = document.getElementById('layer-select');
    if (!select || !config) return;

    select.innerHTML = '';

    config.services.forEach(function(service) {
      if (!Array.isArray(service.layers)) return;

      service.layers.forEach(function(layer) {
        var opt = document.createElement('option');
        opt.value = service.id + ':' + layer.name;
        opt.textContent = service.name + ' - ' + layer.title;
        select.appendChild(opt);
      });
    });

    if (select.options.length > 0) {
      select.selectedIndex = 0;
    }
  }

  // 根据 serviceId 查找服务配置
  function findService(serviceId) {
    if (!config || !Array.isArray(config.services)) return null;
    for (var i = 0; i < config.services.length; i++) {
      if (config.services[i].id === serviceId) {
        return config.services[i];
      }
    }
    return null;
  }

  function getConfig() {
    return config;
  }

  function getServices() {
    return config ? config.services : [];
  }

  // 刷新配置（带 300ms 防抖）
  function refreshConfig() {
    if (fetchDebounceTimer) {
      clearTimeout(fetchDebounceTimer);
    }

    return new Promise(function(resolve, reject) {
      fetchDebounceTimer = setTimeout(function() {
        setStatus('正在刷新配置...');
        loadConfig()
          .then(function(data) {
            populateLayerSelect();

            // 触发图层切换，重新加载当前选中图层
            var select = document.getElementById('layer-select');
            if (select && select.value && window.wmsWms) {
              var parts = select.value.split(':');
              window.wmsWms.switchLayer(parts[0], parts[1]);
            }

            setStatus('配置已刷新');
            fetchDebounceTimer = null;
            resolve(data);
          })
          .catch(function(err) {
            console.error('刷新配置失败:', err);
            setStatus('配置文件格式错误', true);
            fetchDebounceTimer = null;
            reject(err);
          });
      }, 300);
    });
  }

  // 绑定 UI 事件
  function bindEvents() {
    var layerSelect = document.getElementById('layer-select');
    var refreshBtn = document.getElementById('refresh-layers');

    if (layerSelect) {
      layerSelect.addEventListener('change', function() {
        var value = layerSelect.value;
        if (!value || !window.wmsWms) return;

        var parts = value.split(':');
        setStatus('正在切换图层...');
        window.wmsWms.switchLayer(parts[0], parts[1])
          .then(function() {
            setStatus('图层已切换');
          })
          .catch(function(err) {
            console.error('图层切换失败:', err);
            setStatus('地图服务连接失败', true);
          });
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        refreshConfig().catch(function() {
          // 错误已在 refreshConfig 中处理
        });
      });
    }
  }

  // 初始化
  function init() {
    loadConfig()
      .then(function() {
        populateLayerSelect();
        bindEvents();
        console.log('Layers module initialized, services:', getServices().length);
      })
      .catch(function(err) {
        console.error('加载图层配置失败:', err);
        setStatus('配置文件格式错误', true);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露全局 API
  window.wmsLayers = {
    load: loadConfig,
    getConfig: getConfig,
    getServices: getServices,
    findService: findService,
    refresh: refreshConfig,
    populateSelect: populateLayerSelect
  };

})();
