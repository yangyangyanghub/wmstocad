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

  // 发送插入图片请求到 C#（插入到 CAD 模型空间）
  function sendInsertImage(base64Data, filename) {
    sendToHost({ type: 'insertImage', data: base64Data, filename: filename || 'insert.png' });
  }

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

  // 暴露全局 API 供其他模块使用
  window.wmsAdapter = {
    isHosted: isHosted,
    sendToHost: sendToHost,
    sendLog: sendLog,
    sendError: sendError,
    sendImage: sendImage,
    sendInsertImage: sendInsertImage,
    getHostConfig: function() { return window.wmsHostConfig || null; }
  };

  // 绑定出图按钮，出图后发送图片数据到 C#
  function bindOutputEvents() {
    var btnGetmap = document.getElementById('btn-getmap');
    var btnScreenshot = document.getElementById('btn-screenshot');
    var btnInsertMap = document.getElementById('btn-insert-map');

    if (btnGetmap && isHosted) {
      // 在原有点击事件后追加发送逻辑
      btnGetmap.addEventListener('click', function() {
        // 延迟等待出图完成（output.js 中的 getMapImageBase64）
        setTimeout(function() {
          if (window.getMapImageBase64) {
            window.getMapImageBase64()
              .then(function(base64) {
                var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                sendImage(base64, 'getmap-' + timestamp + '.png');
              })
              .catch(function(err) {
                sendError('GetMap 出图失败: ' + err.message);
              });
          }
        }, 100);
      });
    }

    if (btnScreenshot && isHosted) {
      btnScreenshot.addEventListener('click', function() {
        setTimeout(function() {
          // 使用 html2canvas 截图
          if (typeof html2canvas !== 'undefined') {
            var mapEl = document.getElementById('map');
            if (mapEl) {
              html2canvas(mapEl, { useCORS: true, allowTaint: true })
                .then(function(canvas) {
                  var base64 = canvas.toDataURL('image/png');
                  var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                  sendImage(base64, 'screenshot-' + timestamp + '.png');
                })
                .catch(function(err) {
                  sendError('截图失败: ' + err.message);
                });
            }
          }
        }, 100);
      });
    }

    // 绑定"插入地图到 CAD"按钮
    if (btnInsertMap && isHosted) {
      btnInsertMap.addEventListener('click', function() {
        setStatus('正在生成图片并插入到 CAD...');
        btnInsertMap.disabled = true;

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
            var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            sendInsertImage(base64, 'insert-' + timestamp + '.png');
          })
          .catch(function(err) {
            sendError('插入地图失败: ' + err.message);
            setStatus('插入失败: ' + err.message, true);
          })
          .finally(function() {
            btnInsertMap.disabled = false;
          });
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
