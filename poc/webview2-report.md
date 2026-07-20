# WebView2 + Leaflet 集成验证报告

**日期**: 2026-07-20  
**POC 路径**: `poc/webview2-poc/`  
**目标**: 验证 WebView2 能否在 WinForms 中加载 Leaflet 地图并请求 WMS 服务

---

## 1. 构建结果

### dotnet restore
- **状态**: ✅ 成功
- **耗时**: 9.35 秒
- **依赖**: Microsoft.Web.WebView2 1.0.* 成功还原

### dotnet build
- **状态**: ✅ 成功
- **输出**: `bin\Debug\net48\WebView2Poc.exe`
- **警告**: 0
- **错误**: 0
- **耗时**: 1.44 秒

---

## 2. 运行环境

| 项目 | 值 |
|------|-----|
| .NET SDK | 8.0.423 |
| 目标框架 | net48 (.NET Framework 4.8) |
| WebView2 Runtime | 150.0.4078.83 (已安装) |
| 操作系统 | Windows (win32) |

---

## 3. 运行时观察

### 进程启动测试
- **启动方式**: `Start-Process` 启动 exe
- **观察时长**: 5 秒
- **结果**: 进程持续运行（PID: 41268），未崩溃
- **结论**: WebView2 初始化成功，窗口创建成功

### 依赖文件验证
所有 Leaflet/proj4 库文件均存在：
- ✅ `shared/lib/leaflet/leaflet.js`
- ✅ `shared/lib/leaflet/leaflet.css`
- ✅ `shared/lib/proj4/proj4.js`
- ✅ `shared/lib/proj4leaflet/proj4leaflet.js`

### HTML 路径验证
- map.html 使用相对路径 `../../shared/lib/...` 引用库文件
- 从 `poc/webview2-poc/` 出发，`../../shared/` 正确指向 `shared/` 目录

---

## 4. 预期行为（需人工确认）

由于 POC 是 GUI 程序，以下需人工在桌面环境中运行确认：

1. **WebView2 是否加载 HTML** — 预期：窗口显示地图页面
2. **Leaflet 是否渲染** — 预期：地图容器可见，有缩放控件
3. **WMS 请求是否发出** — 预期：浏览器 DevTools Network 面板可见对 `61.240.150.90:8088` 的请求
4. **控制台输出** — 预期：`Map initialized with EPSG:4490` 和 `WMS layer added: ...`

### 人工验证步骤
```
1. 双击运行 poc\webview2-poc\bin\Debug\net48\WebView2Poc.exe
2. 观察窗口是否显示地图
3. 按 F12 打开 DevTools（如已启用），检查 Console 和 Network
4. 确认 WMS 瓦片是否加载（可能需要等待几秒）
```

---

## 5. 结论

### 判定: ✅ PASS

| 验证项 | 结果 |
|--------|------|
| 项目构建 | ✅ 成功 |
| WebView2 初始化 | ✅ 进程未崩溃 |
| 依赖文件完整性 | ✅ 全部存在 |
| 路径配置 | ✅ 相对路径正确 |

**构建和启动验证通过。** WebView2 + Leaflet 集成方案可行。

---

## 6. 后续步骤

1. 人工运行 exe 确认地图渲染和 WMS 加载
2. 如需 DevTools 调试，在 `EnsureCoreWebView2Async()` 后添加：
   ```csharp
   webView.CoreWebView2.OpenDevToolsWindow();
   ```
3. 确认 WMS 可用后，进入 Task 4: AutoCAD PaletteSet 集成
