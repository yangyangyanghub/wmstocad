// Host adapter (AutoCAD/WPS communication)
// Task 13: C# ↔ JS 通信适配器

(function() {
  'use strict';

  // 检查是否在 WebView2 宿主环境中
  var isHosted = !!(window.chrome && window.chrome.webview);

  // 更新状态栏
  function setStatus(msg, isError) {
    var bar = document.getElementById('status-bar');
    if (bar) {
      bar.textContent = msg;
      bar.style.color = isError ? '#dc3545' : '#666';
    }
  }

  // 发送消息到 C# 宿主
  function sendToHost(message) {
    if (!isHosted) {
      console.log('[Adapter] 非宿主环境，消息未发送:', message);
      return;
    }
    try {
      var json = typeof message === 'string' ? message : JSON.stringify(message);
      window.chrome.webview.postMessage(json);
    } catch (e) {
      console.error('[Adapter] 发送消息失败:', e);
    }
  }

  // 发送日志到 C#
  function sendLog(level, message) {
    sendToHost({ type: 'log', level: level, message: message });
  }

  // 发送错误到 C#
  function sendError(message) {
    sendToHost({ type: 'error', message: message });
  }

  // 发送图片数据到 C#
  function sendImage(base64Data, filename) {
    sendToHost({ type: 'image', data: base64Data, filename: filename || 'output.png' });
  }

  // 发送插入图片请求到 C#（插入到 CAD 模型空间，按真实地理坐标定位）
  function sendInsertImage(base64Data, filename) {
    console.log('[Adapter] 准备发送 insertImage，base64 长度:', base64Data ? base64Data.length : 0);
    sendLog('INFO', '准备发送 insertImage，base64 长度: ' + (base64Data ? base64Data.length : 0));
    // 收集当前视图的地理信息，用于 CAD 地理配准插入
    var geoInfo = collectGeoInfo();
    var message = {
      type: 'insertImage',
      data: base64Data,
      filename: filename || 'insert.png'
    };
    // 如果成功获取到地理范围，附加到消息中
    if (geoInfo) {
      message.geoBounds = geoInfo.geoBounds;
      message.crs = geoInfo.crs;
      message.width = geoInfo.width;
      message.height = geoInfo.height;
      console.log('[Adapter] insertImage 地理范围:', JSON.stringify(geoInfo.geoBounds), 'CRS:', geoInfo.crs);
      sendLog('INFO', 'insertImage 地理范围: ' + JSON.stringify(geoInfo.geoBounds) + ' CRS=' + geoInfo.crs);
    } else {
      console.warn('[Adapter] insertImage 未获取到地理范围，将使用降级插入');
      sendLog('WARN', 'insertImage 未获取到地理范围，将使用降级插入');
    }
    sendToHost(message);
    console.log('[Adapter] insertImage 已发送到宿主');
    sendLog('INFO', 'insertImage 已发送到宿主');
  }

  // 收集当前地图视图的地理信息（投影坐标范围 + 像素尺寸 + CRS）
  // 返回 null 表示无法获取（如地图未初始化或投影为经纬度）
  function collectGeoInfo() {
    var map = window.wmsMap;
    if (!map) {
      console.warn('[Adapter] 地图未初始化，无法获取地理范围');
      return null;
    }

    // 获取当前视图的经纬度范围
    var bounds = map.getBounds();
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var bboxLngLat = [sw.lng, sw.lat, ne.lng, ne.lat];

    // 获取当前投影 EPSG 编号
    var crs = map.options.crs;
    var epsgCode = crs && crs.code ? crs.code : 'EPSG:4490';

    // 如果是经纬度坐标系（EPSG:4490），直接用经纬度作为坐标
    // 单位是度，CAD 中数值很小，但仍然可以作为坐标使用
    // 如果是投影坐标系（如 EPSG:4534），用 proj4js 转换为米
    if (epsgCode === 'EPSG:4490') {
      console.warn('[Adapter] 当前为经纬度坐标系，建议切换到投影坐标系以获得真实米制坐标');
      return {
        geoBounds: { minX: sw.lng, minY: sw.lat, maxX: ne.lng, maxY: ne.lat },
        crs: epsgCode,
        width: IMG_WIDTH_DEFAULT,
        height: IMG_HEIGHT_DEFAULT
      };
    }

    // 用 proj4js 把经纬度 BBOX 转为投影坐标（米）
    try {
      var minProj = proj4('EPSG:4490', epsgCode, [sw.lng, sw.lat]);
      var maxProj = proj4('EPSG:4490', epsgCode, [ne.lng, ne.lat]);
      return {
        geoBounds: { minX: minProj[0], minY: minProj[1], maxX: maxProj[0], maxY: maxProj[1] },
        crs: epsgCode,
        width: IMG_WIDTH_DEFAULT,
        height: IMG_HEIGHT_DEFAULT
      };
    } catch (err) {
      console.error('[Adapter] 投影转换失败:', err);
      return null;
    }
  }

  // 默认图片尺寸（与 output.js 的 IMG_WIDTH/IMG_HEIGHT 一致）
  var IMG_WIDTH_DEFAULT = 800;
  var IMG_HEIGHT_DEFAULT = 600;

  // 接收来自 C# 宿主的消息
  // C# 通过 ExecuteScriptAsync 调用 window.receiveFromHost(jsonString)
  window.receiveFromHost = function(jsonString) {
    try {
      var message = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!message || !message.type) {
        console.warn('[Adapter] 收到无效消息:', jsonString);
        return;
      }

      switch (message.type) {
        case 'config':
          handleConfig(message.data);
          break;
        case 'imageSaved':
          handleImageSaved(message);
          break;
        case 'insertResult':
          handleInsertResult(message);
          break;
        case 'error':
          handleHostError(message);
          break;
        default:
          console.log('[Adapter] 收到消息:', message.type, message);
          break;
      }
    } catch (e) {
      console.error('[Adapter] 处理宿主消息异常:', e);
    }
  };

  // 处理从 C# 收到的图层配置
  function handleConfig(configData) {
    if (!configData || !Array.isArray(configData.services)) {
      console.warn('[Adapter] 配置数据格式错误');
      return;
    }

    // 复用 layers.js 的服务校验逻辑（adapter.js 在 layers.js 之后加载）
    if (window.wmsLayers && window.wmsLayers.validateServices) {
      var result = window.wmsLayers.validateServices(configData.services);
      if (result.invalidCount > 0) {
        setStatus(result.invalidCount + ' 个图层配置无效已跳过', true);
        sendLog('WARN', result.invalidCount + ' 个图层配置无效已跳过');
      }
      if (result.valid.length === 0) {
        // 全部非法时回退到内置默认服务，保证插件可用
        configData.services = window.wmsLayers.getDefaultServices();
        setStatus('图层配置全部无效，已回退到默认图层', true);
        sendLog('WARN', '图层配置全部无效，已回退到默认图层');
      } else {
        configData.services = result.valid;
      }
    }

    // 存储到全局供其他模块使用
    window.wmsHostConfig = configData;

    // 填充图层下拉框
    var select = document.getElementById('layer-select');
    if (select) {
      select.innerHTML = '';
      configData.services.forEach(function(service) {
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

    // 如果 wmsLayers 模块已加载，触发图层切换
    if (window.wmsWms && select && select.value) {
      var parts = select.value.split(':');
      window.wmsWms.switchLayer(parts[0], parts[1]).catch(function(err) {
        console.error('[Adapter] 切换图层失败:', err);
      });
    }

    setStatus('配置已从宿主加载');
    sendLog('INFO', '图层配置已从 C# 宿主加载，服务数: ' + configData.services.length);
  }

  // 处理图片保存成功消息
  function handleImageSaved(message) {
    setStatus('图片已保存: ' + (message.path || ''));
    sendLog('INFO', '图片保存成功: ' + (message.path || ''));
  }

  // 处理插入 CAD 结果消息
  function handleInsertResult(message) {
    if (message.success) {
      var dimInfo = '';
      if (message.widthMm && message.heightMm) {
        dimInfo = ' (' + message.widthMm.toFixed(1) + 'mm x ' + message.heightMm.toFixed(1) + 'mm)';
      }
      setStatus('图片已插入到 CAD' + dimInfo);
      sendLog('INFO', '图片插入成功' + dimInfo);
    } else {
      setStatus('插入失败: ' + (message.message || '未知错误'), true);
      sendLog('ERROR', '图片插入失败: ' + (message.message || ''));
    }
  }

  // 处理宿主错误消息
  function handleHostError(message) {
    setStatus(message.message || '宿主错误', true);
    sendLog('ERROR', '宿主错误: ' + (message.message || ''));
  }

  // 页面就绪后发送 ready 消息
  function onReady() {
    if (isHosted) {
      sendToHost({ type: 'ready' });
      sendLog('INFO', '前端已就绪');
      console.log('[Adapter] 已发送 ready 消息到宿主');
    } else {
      console.log('[Adapter] 非宿主环境，跳过 ready 消息');
    }
  }

  // 背景图性能优化：视图去重 + WMS 响应 LRU 缓存
  var lastBgKey = null;      // 上次已发送的视图 key（相同则跳过，打断"插入背景→ViewChanged→再请求"自触发循环）
  var bgCache = new Map();   // key -> base64，平移回看时秒出
  var BG_CACHE_MAX = 15;

  function bgCacheGet(key) {
    var v = bgCache.get(key);
    if (v !== undefined) { bgCache.delete(key); bgCache.set(key, v); } // LRU 提升热度
    return v;
  }

  function bgCacheSet(key, value) {
    if (bgCache.size >= BG_CACHE_MAX) {
      bgCache.delete(bgCache.keys().next().value); // 淘汰最久未用
    }
    bgCache.set(key, value);
  }

  function sendBackground(base64, minX, minY, w, h) {
    sendToHost({ type: 'backgroundImage', data: base64, minX: minX, minY: minY, width: w, height: h });
  }

  // CAD 视图变化回调（由 C# 通过 ExecuteScriptAsync 调用）
  // 接收 CAD 视图范围 -> proj4js 转经纬度 -> WMS GetMap -> 发回图片给 C#
  function onViewChanged(minX, minY, maxX, maxY, crs) {
    if (!isHosted) return;

    // 获取当前可见图层
    if (!window.wmsLayers) return;
    var visibleLayers = window.wmsLayers.getVisibleLayers();
    if (visibleLayers.length === 0) return;

    // 用 proj4js 把 CAD 坐标转为经纬度（EPSG:4490）
    var srcCrs = crs || 'EPSG:4490';
    var swLng, swLat, neLng, neLat;

    if (srcCrs === 'EPSG:4490') {
      // 已经是经纬度，直接用
      swLng = minX; swLat = minY; neLng = maxX; neLat = maxY;
    } else {
      try {
        var sw = proj4(srcCrs, 'EPSG:4490', [minX, minY]);
        var ne = proj4(srcCrs, 'EPSG:4490', [maxX, maxY]);
        swLng = sw[0]; swLat = sw[1]; neLng = ne[0]; neLat = ne[1];
      } catch (e) {
        console.error('[Adapter] 投影转换失败:', e);
        return;
      }
    }

    // 裁剪到有效经纬度范围（视图超出投影带时 proj4 会产生 Infinity）
    swLng = Math.max(-180, Math.min(180, swLng));
    neLng = Math.max(-180, Math.min(180, neLng));
    swLat = Math.max(-90, Math.min(90, swLat));
    neLat = Math.max(-90, Math.min(90, neLat));

    if (!isValidLngLatBbox(swLng, swLat, neLng, neLat)) {
      var invalidMsg = '动态背景跳过：CAD 视图坐标不是有效经纬度范围，bbox=' +
        [swLng, swLat, neLng, neLat].join(',');
      console.warn('[Adapter] ' + invalidMsg);
      sendLog('WARN', invalidMsg);
      return;
    }

    // 与图层数据范围（LatLonBoundingBox）求交集：只请求有数据的区域，
    // 避免视图远大于图层覆盖时产生大面积空白背景
    var item = visibleLayers[0];
    var svc = item.service;
    var layerName = item.layer.name;
    var lb = item.layer.bbox;
    if (lb && lb.minx != null && lb.miny != null && lb.maxx != null && lb.maxy != null) {
      var iSwLng = Math.max(swLng, lb.minx);
      var iSwLat = Math.max(swLat, lb.miny);
      var iNeLng = Math.min(neLng, lb.maxx);
      var iNeLat = Math.min(neLat, lb.maxy);
      if (iNeLng <= iSwLng || iNeLat <= iSwLat) {
        console.log('[Adapter] 视图与图层数据范围不相交，跳过背景更新');
        return;
      }
      swLng = iSwLng; swLat = iSwLat; neLng = iNeLng; neLat = iNeLat;
    }

    // 把（可能被裁剪的）经纬度范围转回 CAD 坐标，作为图片插入位置
    var bgMinX, bgMinY, bgMaxX, bgMaxY;
    if (srcCrs === 'EPSG:4490') {
      bgMinX = swLng; bgMinY = swLat; bgMaxX = neLng; bgMaxY = neLat;
    } else {
      try {
        var pb1 = proj4('EPSG:4490', srcCrs, [swLng, swLat]);
        var pb2 = proj4('EPSG:4490', srcCrs, [neLng, neLat]);
        bgMinX = pb1[0]; bgMinY = pb1[1]; bgMaxX = pb2[0]; bgMaxY = pb2[1];
      } catch (e) {
        console.error('[Adapter] 反向投影转换失败:', e);
        return;
      }
    }

    // 计算图片尺寸（按数据范围保持宽高比）
    var spanX = Math.abs(bgMaxX - bgMinX);
    var spanY = Math.abs(bgMaxY - bgMinY);
    var width = Math.min(1024, Math.max(256, Math.round(spanX)));
    var height = Math.min(768, Math.max(192, Math.round(width * spanY / spanX)));

    var bbox = swLng.toFixed(6) + ',' + swLat.toFixed(6) + ',' + neLng.toFixed(6) + ',' + neLat.toFixed(6);

    // 性能优化：相同视图直接去重，命中缓存直接复用
    var bgKey = srcCrs + '|' + layerName + '|' + bbox + '|' + width + 'x' + height;
    if (bgKey === lastBgKey) return; // 视图未变化（含背景插入触发的 ViewChanged 回环），跳过
    var cachedBase64 = bgCacheGet(bgKey);
    if (cachedBase64) {
      lastBgKey = bgKey;
      sendBackground(cachedBase64, bgMinX, bgMinY, spanX, spanY);
      return;
    }

    var query = 'SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
      '&LAYERS=' + encodeURIComponent(layerName) +
      // DOM 影像（照片类）用 JPEG 体积降 5-8 倍；不透明底图无需 PNG 透明通道
      '&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE' +
      '&BBOX=' + bbox + '&WIDTH=' + width + '&HEIGHT=' + height + '&SRS=EPSG:4490';
    var wmsUrl = appendQuery(svc.url, query);

    console.log('[Adapter] 背景图层 WMS 请求:', wmsUrl);

    // 请求 WMS 影像
    fetch(wmsUrl)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        // 校验 Content-Type，防止 WMS 错误 XML 被当作图片处理
        var contentType = resp.headers.get('content-type') || '';
        if (contentType.indexOf('image') === -1) {
          throw new Error('响应非图片格式: ' + contentType);
        }
        return resp.blob();
      })
      .then(function(blob) {
        // 检查图片是否有效（太小说明 WMS 返回了错误而非图片）
        if (blob.size < window.WMS_MIN_IMAGE_SIZE) {
          console.warn('[Adapter] WMS 返回图片太小 (' + blob.size + ' bytes)，可能是错误响应，跳过');
          sendLog('WARN', '动态背景 WMS 返回图片太小，已跳过: ' + blob.size + ' bytes');
          return null;
        }
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onloadend = function() { resolve(reader.result); };
          reader.onerror = function() { reject(new Error('Base64 转换失败')); };
          reader.readAsDataURL(blob);
        });
      })
      .then(function(base64) {
        if (!base64) return; // 图片无效，跳过
        lastBgKey = bgKey;
        bgCacheSet(bgKey, base64);
        // 发回 C# 端，使用裁剪后的数据范围（而非整个 CAD 视图范围）
        sendBackground(base64, bgMinX, bgMinY, spanX, spanY);
      })
      .catch(function(err) {
        console.error('[Adapter] 背景图层 WMS 请求失败:', err);
        sendLog('ERROR', '动态背景 WMS 请求失败: ' + (err.message || err));
      });
  }

  function appendQuery(url, query) {
    var sep = url.indexOf('?') === -1 ? '?' : (/[?&]$/.test(url) ? '' : '&');
    return url + sep + query;
  }

  function isValidLngLatBbox(swLng, swLat, neLng, neLat) {
    if (![swLng, swLat, neLng, neLat].every(function(v) { return isFinite(v); })) return false;
    if (swLng < -180 || neLng > 180 || swLat < -90 || neLat > 90) return false;
    if (neLng <= swLng || neLat <= swLat) return false;
    return true;
  }

  // 暴露全局 API 供其他模块使用
  window.wmsAdapter = {
    isHosted: isHosted,
    sendToHost: sendToHost,
    sendLog: sendLog,
    sendError: sendError,
    sendImage: sendImage,
    sendInsertImage: sendInsertImage,
    onViewChanged: onViewChanged,
    getHostConfig: function() { return window.wmsHostConfig || null; }
  };

  // 绑定出图按钮
  function bindOutputEvents() {
    var btnInsertMap = document.getElementById('btn-insert-map');

    // 绑定"插入地图到 CAD"按钮
    if (btnInsertMap && isHosted) {
      btnInsertMap.addEventListener('click', function() {
        console.log('[Adapter] 点击插入地图到 CAD');
        sendLog('INFO', '点击插入地图到 CAD');
        setStatus('正在生成图片并插入到 CAD...');
        btnInsertMap.disabled = true;

        try {
          // 使用 GetMap 出图获取高质量图片
          var getMapPromise;
          if (window.getMapImageBase64) {
            getMapPromise = window.getMapImageBase64();
          } else {
            // 降级：使用 html2canvas 截图
            getMapPromise = new Promise(function(resolve, reject) {
              if (typeof html2canvas !== 'undefined') {
                var mapEl = document.getElementById('map');
                if (mapEl) {
                  html2canvas(mapEl, { useCORS: true, allowTaint: true })
                    .then(function(canvas) {
                      resolve(canvas.toDataURL('image/png'));
                    })
                    .catch(reject);
                } else {
                  reject(new Error('地图元素不存在'));
                }
              } else {
                reject(new Error('html2canvas 未加载'));
              }
            });
          }

          getMapPromise
            .then(function(base64) {
              console.log('[Adapter] 插入地图 GetMap 完成，base64 长度:', base64 ? base64.length : 0);
              sendLog('INFO', '插入地图 GetMap 完成，base64 长度: ' + (base64 ? base64.length : 0));
              var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              sendInsertImage(base64, 'insert-' + timestamp + '.png');
            })
            .catch(function(err) {
              console.error('[Adapter] 插入地图失败:', err.message || err);
              sendLog('ERROR', '插入地图失败: ' + (err.message || err));
              sendError('插入地图失败: ' + err.message);
              setStatus('插入失败: ' + err.message, true);
            })
            .finally(function() {
              btnInsertMap.disabled = false;
            });
        } catch (e) {
          console.error('[Adapter] 插入地图同步异常:', e);
          sendLog('ERROR', '插入地图按钮异常(同步): ' + (e.message || String(e)));
          sendError('插入地图异常: ' + (e.message || ''));
          setStatus('操作异常: ' + (e.message || ''), true);
          btnInsertMap.disabled = false;
        }
      });
    }
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      onReady();
      bindOutputEvents();
    });
  } else {
    onReady();
    bindOutputEvents();
  }

  console.log('[Adapter] 初始化完成, 宿主环境:', isHosted);

})();
