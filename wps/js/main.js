/**
 * WMS 地图插件 - WPS JSAPI 主入口
 * 
 * 负责插件初始化、Ribbon 按钮事件绑定
 * 地图功能在 Task 17 实现，图片插入在 Task 18 实现
 */

(function () {
  "use strict";

  // 插件状态
  var pluginState = {
    initialized: false,
    taskpaneVisible: false
  };

  /**
   * 插件初始化
   * 在 WPS 加载插件时调用
   */
  function initPlugin() {
    if (pluginState.initialized) {
      return;
    }

    console.log("[WMS Plugin] 插件初始化...");
    pluginState.initialized = true;
    console.log("[WMS Plugin] 插件初始化完成");
  }

  /**
   * 打开地图任务窗格
   * 由 ribbon.xml 中 "打开地图" 按钮的 onAction 调用
   * Task 17 实现具体逻辑
   */
  function openMapPane() {
    console.log("[WMS Plugin] openMapPane() 被调用");
    // TODO: Task 17 实现
    // 1. 创建或显示任务窗格
    // 2. 加载 taskpane.html
    // 3. 初始化地图
    pluginState.taskpaneVisible = true;
  }

  /**
   * 插入地图图片到幻灯片
   * 由 ribbon.xml 中 "插入地图" 按钮的 onAction 调用
   * Task 18 实现具体逻辑
   */
  function insertMapImage() {
    console.log("[WMS Plugin] insertMapImage() 被调用");
    // TODO: Task 18 实现
    // 1. 从任务窗格获取地图截图或 GetMap 图片
    // 2. 调用 WPS API 插入图片到当前幻灯片
  }

  /**
   * 关闭地图任务窗格
   */
  function closeMapPane() {
    console.log("[WMS Plugin] closeMapPane() 被调用");
    // TODO: Task 17 实现
    pluginState.taskpaneVisible = false;
  }

  /**
   * 获取插件状态
   */
  function getPluginState() {
    return Object.assign({}, pluginState);
  }

  // 将函数注册到全局作用域，供 ribbon.xml 的 onAction 调用
  window.openMapPane = openMapPane;
  window.insertMapImage = insertMapImage;
  window.closeMapPane = closeMapPane;
  window.getPluginState = getPluginState;

  // 页面加载完成后初始化插件
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlugin);
  } else {
    initPlugin();
  }
})();
