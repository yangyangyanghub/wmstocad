# WMS Map Plugin — Agent 指南

## 项目简述

WMS 地图服务插件，在 **AutoCAD**（C# .NET 4.8 + WebView2）和 **WPS PPT**（JavaScript JSAPI）中嵌入交互式地图（Leaflet + proj4js + EPSG:4490）。共享前端代码位于 `shared/`，宿主插件分别在 `autocad/` 和 `wps/`。

## 目录结构

```
autocad/        — AutoCAD 插件源码 (C# .NET 4.8)
  WmsMapPlugin.csproj / .sln    — 项目/解决方案文件
  WmsMapCommand.cs              — 插件入口 + WMSMAP 命令
  WmsPanel.cs                   — PaletteSet + WebView2 面板
  WmsBridge.cs                  — C# ↔ JS 双向通信桥
  WmsImageInserter.cs           — 图片插入 CAD 模型空间
  WmsMapPlugin.bundle/          — AutoCAD 部署包
wps/            — WPS PPT 插件源码 (WPS JSAPI)
  manifest.xml / ribbon.xml     — 插件清单和 Ribbon 定义
  taskpane.html / js/main.js    — 任务窗格（iframe 加载 shared/map.html）
shared/         — 共享前端代码 (Leaflet + proj4js)
  map.html / css/style.js       — 主页面 + 样式
  js/{map,layers,projection,wms,adapter,output,error}.js  — 按功能拆分的模块
  lib/{leaflet,proj4,proj4leaflet,html2canvas}/            — 离线打包的第三方库
  layers.json                   — WMS 服务配置（热更新）
docs/           — 用户文档（安装说明、用户手册、图层配置说明）
poc/            — POC 验证报告（CORS/WebView2/WPS），**不可合入生产**
WmsMapPlugin/   — v1.0.0 统一部署打包目录（install/uninstall 脚本）
```

## 关键命令

```powershell
# 构建 AutoCAD 插件
dotnet build autocad\WmsMapPlugin.sln

# 统一安装入口（AutoCAD + WPS），退出码：0 成功 / 1 硬失败
.\WmsMapPlugin\install.ps1
.\WmsMapPlugin\install.ps1 -SkipAutoCAD  # 仅 WPS
.\WmsMapPlugin\install.ps1 -SkipWPS     # 仅 AutoCAD

# 卸载（-Force 才真实删除，否则仅预览将删除的路径）
.\WmsMapPlugin\uninstall.ps1 -Force

# 根级 install-autocad.ps1 是薄包装（转发到统一入口，-SkipWPS）
.\install-autocad.ps1

# 发布前同步交付目录（根级源码 → WmsMapPlugin\ 副本，支持 -WhatIf）
.\sync-delivery.ps1
```

## 开发约束

- **离线部署**：所有前端库必须 `shared/lib/` 本地打包，禁止 CDN 引用
- **CORS**：WMS 服务已配置 CORS（POC 验证通过），`file://` 和 `localhost` 均支持
- **WMS 版本**：固定 1.1.1，坐标系 EPSG:4490（CGCS2000），BBOX 顺序 `minLon,minLat,maxLon,maxLat`
- **AutoCAD**：目标 AutoCAD 2021+，.NET Framework 4.8，依赖 WebView2 Runtime
- **WPS**：目标 WPS 2019+，使用 JSAPI + 任务窗格
- **layers.json 热更新**：AutoCAD 端通过 `FileSystemWatcher` 监听文件变更自动推送；WPS 端手动点击刷新

## 架构要点（Agent 易踩坑）

### 1. 双配置加载路径
- **独立运行**（浏览器调试）：前端 `layers.js` 直接 `fetch('layers.json')`
- **嵌入 AutoCAD**：C# `WmsBridge` 读取 `layers.json` → `ExecuteScriptAsync` 注入 → `adapter.js` 接收
- 两套路径不冲突，`adapter.js` 检测 `window.chrome.webview` 是否存在决定走哪条

### 2. AutoCAD API Stubs
`WmsMapCommand.cs` 中有 `#region AutoCAD API Stubs`（`IExtensionApplication`、`CommandMethodAttribute`、`PaletteSet` 等临时桩实现）。这些是为在没有 AutoCAD SDK 的开发环境中编译通过的临时方案。**真正的 AutoCAD 环境应删除 Stubs 并引用正式 AutoCAD API 程序集**。

### 3. 前端模块加载顺序
`map.html` 中 script 顺序严格：proj4 → leaflet → proj4leaflet → html2canvas → layers → projection → wms → map → output → error → adapter。模块间存在隐式依赖（全局变量 `window.wmsMap`、`window.wmsWms`、`window.wmsLayers`）。

### 4. 投影切换限制
WMS 始终以 EPSG:4490 请求服务（服务端限制），投影切换仅在前端进行 **视图范围反算**（proj4js 将目标投影 BBOX 转为经纬度 BBOX 再请求 WMS），地图图片本身不重投影。

### 5. 两个目录结构
- 根级 `autocad/`、`wps/`、`shared/` — 开发源码目录
- `WmsMapPlugin/` — v1.0.0 统一交付目录，内部有独立的 `autocad/`、`wps/`、`shared/` 副本
**修改源码时修改根级目录**，`WmsMapPlugin/` 下的副本需在发布时运行 `.\sync-delivery.ps1` 同步（禁止手工拷贝，脚本会校验文件数一致）。

### 6. 截图 vs GetMap 出图
- `GetMap`：直接请求 WMS 服务按当前 BBOX 生成指定尺寸图片（质量高，不受跨域限制）
- `html2canvas`：前端截图（所见即所得，但受跨域影响）
- 插入 CAD/PPT 优先走 GetMap，html2canvas 作为备选

## 提交规范

遵循 `type(scope): 中文描述` 格式：
- type: `feat` / `chore` / `docs` / `fix` / `test`
- scope: `frontend` / `autocad` / `wps`
- 单 `master` 分支，直线式提交

## 验证方式

```powershell
dotnet build autocad\WmsMapPlugin.sln    # AutoCAD 项目编译
```

项目无测试框架和 CI/CD，修改后需人工验证：
1. AutoCAD: 安装后输入 `WMSMAP` 命令
2. WPS: 安装后在 PPT 进入 "WMS地图" 选项卡
3. 前端: 浏览器直接打开 `shared/map.html`（可独立运行，但需同源或本地 HTTP 服务）
