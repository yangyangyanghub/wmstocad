# WMS 地图插件开发计划

## TL;DR

> **目标**：基于已完成设计文档，开发 WMS 地图插件，让 AutoCAD 和 WPS PPT 用户可在软件内打开可交互地图（缩放、平移、切换图层），并支持将地图插入 CAD/PPT。
>
> **交付物**：
> - 共享前端（Leaflet + proj4js 地图组件，含投影切换、WMS 图层管理、GetMap 出图）
> - AutoCAD 插件（C# + WebView2，WMSMAP 命令打开侧边栏地图面板）
> - WPS PPT 插件（JSAPI 任务窗格，ribbon 按钮打开地图侧边栏）
> - 安装包 + 用户手册
>
> **工期估算**：~25 个工作日（1 人）
> **并行策略**：git worktree 隔离 4 条开发流，POC 三项并行验证，插件开发可交替推进
> **关键路径**：POC 验证 → 共享前端 → AutoCAD/WPS 插件 → 集成测试

---

## Context

### Original Request

基于 `2026-07-19-wms-cad-wps-plugin-design.md` 设计文档，编制开发计划。要求：
- 使用 git worktree 管理
- 能并行开发就并行开发
- 1 人开发团队
- 先 POC 后开发

### Interview Summary

**Key Discussions**:
- **团队规模**：1 人，worktree 主要用于模块隔离和灵活切换
- **开发环境**：VS 2022 + AutoCAD 2021+ + WPS 2019+ + Node.js/npm，全部就绪
- **POC 策略**：先验证 CORS / WebView2+Leaflet / WPS JSAPI+Leaflet，排除技术风险后再全面开发
- **Git 策略**：每个开发流一个 worktree，完成后合并到 master

**Research Findings**:
- 全新仓库（零提交），只有设计文档
- 设计文档已提供详细技术方案、代码示例、配置格式
- 项目目录结构已定义：`shared/` + `autocad/` + `wps/` + `docs/`

### Metis Review

**Identified Gaps** (addressed):
- **测试策略缺失** → 采用 tests-after + 手动 QA，POC 验证作为质量门槛
- **Scope OUT 未显式列出** → 在"Must NOT Have"中集中列出
- **验收标准缺失** → 每个任务定义量化验收标准
- **边界情况未覆盖** → 在任务中加入超时、空图片、防抖、崩溃处理
- **CORS 阻塞风险** → POC 第一步验证，失败则启动回退方案

---

## Work Objectives

### Core Objective

开发 WMS 地图插件，让 AutoCAD 和 WPS PPT 用户可在软件内打开可交互地图（缩放、平移、切换图层、切换投影），并支持将地图图片插入 CAD/PPT。

### Concrete Deliverables

- `shared/` — 共享前端：map.html + Leaflet + proj4js + 投影切换 + WMS 图层管理 + GetMap 出图
- `autocad/` — AutoCAD 插件：WMSMAP 命令 + PaletteSet 面板 + WebView2 + C#↔JS 通信 + CAD 图片插入
- `wps/` — WPS PPT 插件：JSAPI 任务窗格 + ribbon 按钮 + WPS API 图片插入
- `docs/` — 安装说明 + 用户手册 + 图层配置说明

### Definition of Done

- [ ] AutoCAD 输入 WMSMAP 命令，侧边栏显示可交互地图
- [ ] WPS PPT 点击 ribbon 按钮，侧边栏显示可交互地图
- [ ] 支持图层切换（从 layers.json 读取）
- [ ] 支持投影切换（EPSG:4490/4534/4535/4536/3857 + 自定义）
- [ ] 支持将地图插入 CAD（作为 RasterImage）
- [ ] 支持将地图插入 PPT（作为 Shape 图片）
- [ ] 安装包可在一键安装后使用

### Must Have

- WMS 1.1.1 协议支持，EPSG:4490 坐标系
- 离线部署（所有前端依赖本地打包，不用 CDN）
- 图层配置（layers.json）读取和刷新
- 投影切换（至少 5 个预定义 EPSG + 自定义）
- GetMap 出图（主路径，高质量）
- html2canvas 截图（备选路径，快速预览）
- 错误处理和用户提示（参考设计文档 9.3 节）
- 本地日志（autocad-plugin.log / wps-plugin.log / frontend.log）

### Must NOT Have (Guardrails)

- ❌ WMS 1.3.0 支持（v1 仅 1.1.1，轴顺序差异会引入大量测试）
- ❌ WMS 认证/鉴权（设计文档明确"无认证"）
- ❌ GetFeatureInfo（属性查询，不属于 v1 交互范围）
- ❌ 瓦片缓存（v1 不做，先跑通再说）
- ❌ GetCapabilities 自动解析（v1 手动编辑 layers.json，后续版本再做 UI）
- ❌ 地图量测工具（独立功能，v1 不做）
- ❌ 打印/布局出图（和"插入地图"是两回事）
- ❌ 多语言/国际化（院内工具，中文即可）
- ❌ AutoCAD LT 支持（LT 不支持 .NET 插件）
- ❌ POC 代码合入生产（POC 用完即弃，正式开发重写）
- ❌ html2canvas 与 GetMap 的"智能切换"（v1 提供两个按钮让用户手动选）
- ❌ 自定义 DPI（v1 固定 150 DPI）

### Test Strategy

- **方式**：tests-after + 手动 QA
- **理由**：项目 UI 密集（Leaflet 在 WebView2/WPS 中渲染），自动化测试收益低
- **POC 验证**：作为质量门槛，CORS/WebView2/WPS JSAPI 三项全部通过后才进入正式开发
- **量化验收标准**：
  - 地图加载 < 5 秒（网络正常时）
  - 图层切换 < 3 秒
  - 投影切换 < 3 秒，坐标转换误差 < 1 米（对比已知控制点）
  - GetMap 出图分辨率 ≥ 150 DPI
  - 插件启动 < 3 秒（不含地图加载）
  - WebView2 进程内存 < 200MB（10 个图层配置）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO（全新项目）
- **Automated tests**: None（v1 不建自动化测试基础设施）
- **Framework**: N/A
- **QA 方式**：手动 QA + 量化验收标准

### QA Policy

每个任务定义量化验收标准，完成时手动验证：

- **共享前端**：浏览器打开 map.html，验证地图加载、图层切换、投影切换、出图
- **AutoCAD 插件**：在 AutoCAD 中加载插件，验证 WMSMAP 命令、面板显示、图片插入
- **WPS 插件**：在 WPS 中加载插件，验证 ribbon 按钮、侧边栏显示、图片插入
- **投影精度**：用已知控制点（如河北省测量控制点）验证坐标转换误差 < 1 米

---

## Execution Strategy

### Git Worktree 结构

```
E:\code\wmstocad\                    ← 主仓库 (master)
├── .git/
├── 2026-07-19-wms-cad-wps-plugin-design.md
├── shared/                          ← master 上的共享前端
├── autocad/                         ← master 上的 AutoCAD 插件骨架
├── wps/                             ← master 上的 WPS 插件骨架
└── docs/                            ← master 上的文档骨架

E:\code\wmstocad-poc\                ← worktree: feature/poc-validation
E:\code\wmstocad-frontend\           ← worktree: feature/shared-frontend
E:\code\wmstocad-autocad\            ← worktree: feature/autocad-plugin
E:\code\wmstocad-wps\                ← worktree: feature/wps-plugin
```

### 开发流与分支

| Worktree | 分支 | 用途 | 预计工期 |
|----------|------|------|---------|
| 主仓库 | master | 集成 + 最终测试 | - |
| wmstocad-poc | feature/poc-validation | POC 验证（CORS / WebView2 / WPS JSAPI） | 3 天 |
| wmstocad-frontend | feature/shared-frontend | 共享前端完整开发 | 10 天 |
| wmstocad-autocad | feature/autocad-plugin | AutoCAD 插件开发 | 8 天 |
| wmstocad-wps | feature/wps-plugin | WPS PPT 插件开发 | 8 天 |

### 依赖关系与并行策略

```
Day 1-3:   [POC: CORS] [POC: WebView2] [POC: WPS JSAPI]  ← 三项并行
           [项目脚手架 + layers.json]                       ← 可与 POC 并行
           
Day 4-13:  [共享前端核心开发]                                ← 关键路径
           [插件项目骨架搭建]                                ← 可在 frontend 后期并行准备
           
Day 14-21: [AutoCAD 插件开发] ←→ [WPS 插件开发]             ← 交替进行
           
Day 22-25: [集成测试 + 文档 + 发布]                          ← 合并到 master
```

**1 人并行策略**：
- POC 阶段：三项验证可穿插进行（curl 测试 CORS → 建 C# POC 项目 → 建 WPS POC 项目）
- 前端阶段：开发共享前端时，可在等待 WMS 响应时准备插件骨架代码
- 插件阶段：AutoCAD 和 WPS 插件交替开发，避免单一模块疲劳
- 集成阶段：先合并 shared → master，再分别合并两个插件

### 合并策略

```
POC 完成 → feature/poc-validation merge → master
前端完成 → feature/shared-frontend merge → master
AutoCAD 完成 → feature/autocad-plugin merge → master
WPS 完成 → feature/wps-plugin merge → master
集成测试 → master 上直接修复
```

---

## TODOs

### Wave 0: 基础搭建 + POC 验证（Day 1-3）

> 目标：建立项目骨架，验证三项技术风险。POC 全部通过后才进入正式开发。
> 并行度：项目脚手架 + 3 项 POC 可穿插进行。

- [x] 1. 项目脚手架 + layers.json 配置

  **What to do**:
  - 在 master 分支创建完整目录结构（shared/autocad/wps/docs）
  - 编写 layers.json（参考设计文档第七节，包含 DOM 服务和 5 个投影定义）
  - 创建 shared/ 下的基础文件占位（map.html, css/style.css, js/*.js）
  - 下载离线依赖库到 shared/lib/（leaflet, proj4, proj4leaflet, html2canvas）
  - 创建 autocad/ 的 .sln 和 .csproj 骨架（.NET 4.8, WebView2 NuGet）
  - 创建 wps/ 的 manifest.xml 和 ribbon.xml 骨架
  - 创建 .gitignore（忽略 bin/, obj/, node_modules/, *.user, .vs/）
  - 初始提交到 master

  **Must NOT do**:
  - 不写任何业务逻辑代码
  - 不从 CDN 引用任何库

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 POC 任务并行）
  - **Parallel Group**: Wave 0（与任务 2, 3, 4 并行）
  - **Blocks**: 所有后续任务
  - **Blocked By**: None

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:517-597` — layers.json 完整结构定义
  - `2026-07-19-wms-cad-wps-plugin-design.md:669-700` — 安装目录结构
  - `2026-07-19-wms-cad-wps-plugin-design.md:779-794` — 离线依赖要求

  **Acceptance Criteria**:
  - [ ] 目录结构与设计文档 9.1 节一致
  - [ ] layers.json 可被 JSON.parse 正确解析
  - [ ] shared/lib/ 包含 leaflet.js, proj4.js, proj4leaflet.js, html2canvas.min.js
  - [ ] .gitignore 覆盖 bin/, obj/, .vs/
  - [ ] git log 显示初始提交

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 文件创建和配置，无复杂逻辑

  **Commit**: YES
  - Message: `chore: init project scaffold and layers.json`

---

- [x] 2. POC: CORS 连通性验证

  **What to do**:
  - 用 curl 或浏览器请求 WMS GetCapabilities，检查响应头是否包含 `Access-Control-Allow-Origin`
  - 如果无 CORS 头，记录当前响应头内容
  - 测试 WMS GetMap 请求是否受 CORS 限制
  - 如果 CORS 失败：联系 MixServer 管理员确认可配置性，记录回退方案（本地代理）
  - 输出 POC 报告（通过/失败 + 回退方案）

  **Must NOT do**:
  - 不写正式代码
  - 不修改 WMS 服务端配置（只测试和记录）

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0（与任务 1, 3, 4 并行）
  - **Blocks**: 任务 5-10（共享前端）
  - **Blocked By**: None

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:798-812` — CORS 处理策略
  - WMS URL: `http://61.240.150.90:8088/mixserver/services/map-ugcv5-dom202605y2m18level/wms111/dom202605y2m18level?`

  **Acceptance Criteria**:
  - [ ] 已确认 WMS 服务端 CORS 响应头状态
  - [ ] 如果 CORS 失败：已有回退方案文档（本地代理或桌面宿主豁免）
  - [ ] POC 报告已记录到 `poc/cors-report.md`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 网络请求测试，curl 即可验证

  **Commit**: YES
  - Message: `test(poc): CORS connectivity validation`

---

- [x] 3. POC: WebView2 + Leaflet 集成验证

  **What to do**:
  - 创建最小 C# 项目（WinForms 或 WPF），嵌入 WebView2
  - WebView2 加载本地 map.html（含 Leaflet + 一个简单 WMS 图层）
  - 验证：WebView2 能否加载本地 HTML 并请求 HTTP WMS 服务
  - 验证：Leaflet 在 WebView2 中是否正常渲染
  - 验证：WMS 图片是否能在 WebView2 中显示（受 CORS 影响）
  - 输出 POC 报告

  **Must NOT do**:
  - 不实现完整 AutoCAD 插件
  - 不写 PaletteSet 代码
  - POC 代码不合入正式分支

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0（与任务 1, 2, 4 并行）
  - **Blocks**: 任务 11-15（AutoCAD 插件）
  - **Blocked By**: None（但建议任务 2 CORS 验证后再开始）

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:96-125` — AutoCAD 插件架构
  - `2026-07-19-wms-cad-wps-plugin-design.md:283-337` — Leaflet CRS 配置
  - `2026-07-19-wms-cad-wps-plugin-design.md:828-832` — 最低版本要求

  **Acceptance Criteria**:
  - [ ] WebView2 可加载本地 map.html
  - [ ] Leaflet 在 WebView2 中正常渲染（地图瓦片可见）
  - [ ] WMS 请求可到达服务端并返回图片
  - [ ] 如果失败：已记录失败原因和替代方案

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: 需要创建 C# 项目、嵌入 WebView2、调试跨进程渲染

  **Commit**: YES
  - Message: `test(poc): WebView2 + Leaflet integration`

---

- [x] 4. POC: WPS JSAPI + Leaflet 集成验证

  **What to do**:
  - 创建最小 WPS JSAPI 插件项目（manifest.xml + taskpane.html）
  - 任务窗格加载 map.html（含 Leaflet + WMS 图层）
  - 验证：WPS 任务窗格能否加载 Leaflet 并正常渲染
  - 验证：WPS JSAPI 是否支持插入图片到幻灯片（Shapes.AddPicture 或等效 API）
  - 验证：html2canvas 在 WPS 任务窗格中是否可用
  - 输出 POC 报告

  **Must NOT do**:
  - 不实现完整 WPS 插件
  - 不写 ribbon 按钮逻辑
  - POC 代码不合入正式分支

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0（与任务 1, 2, 3 并行）
  - **Blocks**: 任务 16-19（WPS 插件）
  - **Blocked By**: None（但建议任务 2 CORS 验证后再开始）

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:151-221` — WPS 插件架构和 ribbon.xml
  - `2026-07-19-wms-cad-wps-plugin-design.md:225-229` — WPS 风险点
  - WPS JSAPI 文档: https://open.wps.cn/

  **Acceptance Criteria**:
  - [ ] WPS 任务窗格可加载 Leaflet 地图
  - [ ] WPS JSAPI 可插入图片到幻灯片（或已确认替代方案）
  - [ ] html2canvas 在 WPS 任务窗格中的可用性已确认
  - [ ] 如果失败：已记录失败原因和替代方案

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: 需要创建 WPS JSAPI 项目、调试任务窗格渲染

  **Commit**: YES
  - Message: `test(poc): WPS JSAPI + Leaflet integration`

---

### Wave 1: 共享前端核心开发（Day 4-13）

> 目标：完成 shared/ 全部功能，可在浏览器中独立运行。
> 关键路径：此阶段是后续两个插件的前置依赖。

- [x] 5. 共享前端：基础 HTML 结构和 UI 布局

  **What to do**:
  - 创建 map.html，引入本地 Leaflet/proj4/proj4leaflet/html2canvas
  - 创建 css/style.css：地图容器全屏、图层控制面板、投影设置面板、工具栏
  - 实现基础 UI 布局：地图区域 + 右侧控制面板（图层列表、投影选择、出图按钮）
  - 实现图层下拉框（从 layers.json 读取服务名称）
  - 实现投影选择下拉框（从 layers.json 读取 availableProjections）
  - 响应式布局（适配 WebView2 和 WPS 任务窗格的宽度限制，最小 300px）

  **Must NOT do**:
  - 不引用任何 CDN 地址
  - 不实现地图交互逻辑（任务 6-8 做）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 1 的脚手架）
  - **Parallel Group**: Wave 1 起始
  - **Blocks**: 任务 6, 7, 8, 9
  - **Blocked By**: 任务 1, 2（POC CORS 通过）

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:442-460` — 投影设置 UI 设计
  - `2026-07-19-wms-cad-wps-plugin-design.md:669-700` — 目录结构
  - `shared/map.html` — 主 HTML 文件
  - `shared/css/style.css` — 样式文件

  **Acceptance Criteria**:
  - [ ] 浏览器打开 map.html 无 JS 错误
  - [ ] UI 布局正确：地图区域 + 控制面板
  - [ ] 图层下拉框显示 layers.json 中的服务名称
  - [ ] 投影下拉框显示 5 个预定义投影 + "自定义"选项
  - [ ] 最小宽度 300px 时 UI 不溢出

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Reason**: HTML/CSS 布局，响应式设计

  **Commit**: YES
  - Message: `feat(frontend): base HTML structure and UI layout`

---

- [x] 6. 共享前端：Leaflet 地图初始化 + EPSG:4490

  **What to do**:
  - 创建 js/map.js：初始化 Leaflet 地图实例
  - 定义 EPSG:4490 投影（proj4.defs）
  - 创建 Leaflet CRS（L.Proj.CRS），配置 origin 和 resolutions
  - 设置地图中心 [36.5, 114.5]，初始 zoom 6
  - 加载默认 WMS 图层（从 layers.json 读取第一个服务的第一个图层）
  - 实现基础交互：缩放、平移
  - 配置 WMS 图层参数：version 1.1.1, SRS EPSG:4490, format image/png, transparent true

  **Must NOT do**:
  - 不实现投影切换（任务 7 做）
  - 不实现图层切换（任务 8 做）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 5 的 HTML 结构）
  - **Parallel Group**: Wave 1
  - **Blocks**: 任务 7, 8, 9
  - **Blocked By**: 任务 5

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:254-337` — EPSG:4490 完整配置代码
  - `2026-07-19-wms-cad-wps-plugin-design.md:342-356` — 分辨率计算说明
  - `2026-07-19-wms-cad-wps-plugin-design.md:402-413` — WMS 1.1.1 BBOX 顺序
  - `shared/js/map.js` — 地图初始化代码

  **Acceptance Criteria**:
  - [ ] 浏览器打开 map.html，地图在 5 秒内显示
  - [ ] 地图中心在 [36.5, 114.5] 附近
  - [ ] 缩放和平移操作流畅
  - [ ] WMS 图层正确渲染（可见地图影像）
  - [ ] 控制台无 CORS 错误（假设 POC 已通过）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: Leaflet + proj4js 集成，坐标系配置复杂

  **Commit**: YES
  - Message: `feat(frontend): Leaflet map init with EPSG:4490`

---

- [x] 7. 共享前端：投影切换系统

  **What to do**:
  - 创建 js/projection.js：投影管理模块
  - 注册所有预定义投影（EPSG:4490/4534/4535/4536/3857）的 proj4 定义
  - 实现 `createProjectedCrs(epsgCode, proj4def)` 函数
  - 实现投影切换逻辑：切换时重新创建 CRS，重新计算视图范围
  - 实现自定义投影输入：用户输入 proj4 字符串，动态注册
  - 投影切换后，视图自动适配新投影（中心点转换、分辨率适配）
  - 自动推荐合适的 3 度带投影（根据 WMS 服务中心经度）
  - 错误处理：投影参数无效时回退到 EPSG:4490

  **Must NOT do**:
  - 不修改 WMS 请求的 SRS 参数（始终为 EPSG:4490）
  - 不转换 WMS 返回的图片（只转换视图 BBOX）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 6 的地图初始化）
  - **Parallel Group**: Wave 1
  - **Blocks**: 任务 8, 9
  - **Blocked By**: 任务 6

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:366-509` — 投影坐标系完整设计
  - `2026-07-19-wms-cad-wps-plugin-design.md:416-438` — proj4 投影定义示例
  - `2026-07-19-wms-cad-wps-plugin-design.md:462-501` — Leaflet 投影 CRS 配置
  - `shared/js/projection.js` — 投影管理代码

  **Acceptance Criteria**:
  - [ ] 下拉框切换投影后，地图在 3 秒内以新投影显示
  - [ ] 切换到 EPSG:4534 后，坐标单位为米，数值合理（约 38500000, 4000000 量级）
  - [ ] 自定义投影输入框可接受 proj4 字符串并应用
  - [ ] 输入无效 proj4 字符串时，回退到 EPSG:4490 并显示提示
  - [ ] 投影转换精度：已知控制点误差 < 1 米

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - **Reason**: 投影数学计算，坐标转换精度要求高

  **Commit**: YES
  - Message: `feat(frontend): projection system with proj4js`

---

- [x] 8. 共享前端：WMS 图层管理

  **What to do**:
  - 创建 js/layers.js：图层配置管理模块
  - 实现 layers.json 读取和解析（fetch 本地文件）
  - 创建 js/wms.js：WMS 图层管理模块
  - 实现图层加载：根据选择的图层名创建 WMS TileLayer
  - 实现图层切换：切换时移除旧图层、添加新图层
  - 实现多服务支持：下拉框切换服务时，更新 WMS URL 和图层列表
  - 实现"刷新图层配置"按钮：重新读取 layers.json
  - 错误处理：
    - WMS 服务不可访问：超时重试 1 次，失败后提示
    - 图层加载失败：标记不可用，其他图层继续
    - layers.json 格式错误：阻止初始化，提示联系管理员
    - 请求防抖：快速连续缩放/平移时，300ms 防抖

  **Must NOT do**:
  - 不实现 GetCapabilities 自动解析
  - 不实现图层编辑器 UI

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 5 的 UI 和任务 6 的地图初始化）
  - **Parallel Group**: Wave 1
  - **Blocks**: 任务 9
  - **Blocked By**: 任务 5, 6

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:517-600` — layers.json 结构和配置说明
  - `2026-07-19-wms-cad-wps-plugin-design.md:704-713` — 图层配置更新机制
  - `2026-07-19-wms-cad-wps-plugin-design.md:715-725` — 错误处理设计
  - `shared/js/layers.js` — 图层配置管理
  - `shared/js/wms.js` — WMS 图层操作

  **Acceptance Criteria**:
  - [ ] 下拉框切换服务后，新服务的图层在 3 秒内显示
  - [ ] 切换图层后，地图影像正确更新
  - [ ] 点击"刷新"按钮后，修改的 layers.json 生效
  - [ ] WMS 服务不可访问时，显示"地图服务连接失败"提示
  - [ ] layers.json 格式错误时，显示"配置文件格式错误"提示
  - [ ] 快速缩放时，请求有防抖（不产生大量并发请求）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: WMS 协议交互，错误处理逻辑复杂

  **Commit**: YES
  - Message: `feat(frontend): WMS layer management`

---

- [x] 9. 共享前端：截图与 GetMap 出图

  **What to do**:
  - 创建 js/output.js：出图模块
  - 实现 WMS GetMap 出图（主路径）：
    - 根据当前视图 BBOX、图层、投影设置，构造 GetMap 请求
    - 指定 WIDTH/HEIGHT（根据目标尺寸和 150 DPI 计算）
    - 请求 WMS 返回静态图片
    - 将图片转为 base64（用于传递给宿主插件）
  - 实现 html2canvas 截图（备选路径）：
    - 截取当前地图视图
    - 设置 useCORS: true
    - 转为 base64
  - 提供两个按钮："GetMap 出图（高质量）"和"快速截图"
  - 暴露全局函数 `getMapImageBase64()` 供宿主插件调用
  - 错误处理：截图失败时提示用户改用 GetMap 出图

  **Must NOT do**:
  - 不实现两种方式的"智能切换"
  - 不实现自定义 DPI（固定 150）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 6-8 的地图功能）
  - **Parallel Group**: Wave 1
  - **Blocks**: 任务 14（CAD 图片插入）, 任务 18（WPS 图片插入）
  - **Blocked By**: 任务 6, 7, 8

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:815-823` — 截图与出图策略
  - `2026-07-19-wms-cad-wps-plugin-design.md:133-134` — 插入地图到 CAD 流程
  - `2026-07-19-wms-cad-wps-plugin-design.md:188-189` — 插入地图到 PPT 流程
  - `shared/js/output.js` — 出图模块

  **Acceptance Criteria**:
  - [ ] 点击"GetMap 出图"按钮，返回 base64 图片
  - [ ] GetMap 图片分辨率 ≥ 150 DPI
  - [ ] GetMap 图片内容与当前视图一致
  - [ ] 点击"快速截图"按钮，返回 base64 截图
  - [ ] `getMapImageBase64()` 函数可从外部调用并返回结果
  - [ ] 截图失败时，显示"截图失败，请使用 GetMap 出图"提示

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: WMS GetMap 请求构造，base64 编码，html2canvas 集成

  **Commit**: YES
  - Message: `feat(frontend): GetMap and screenshot output`

---

- [x] 10. 共享前端：错误处理与日志

  **What to do**:
  - 创建 js/error.js：错误处理模块
  - 实现统一错误提示 UI（toast 或 modal）
  - 实现前端日志记录（frontend.log 内容收集）：
    - WMS 请求 URL、响应状态、耗时
    - 图层配置加载结果
    - 投影切换记录
    - 出图/截图结果
    - 异常堆栈
  - 实现网络状态监听：断开时提示，恢复后自动重绘
  - 实现 WebView2 通信接口：日志可传递给宿主插件
  - 边界情况处理：
    - WMS 返回空图片：检测并提示"当前范围无数据"
    - WMS 返回非图片内容（XML 错误）：检查 Content-Type，显示错误信息
    - WebView2 崩溃：宿主侧处理，前端不负责

  **Must NOT do**:
  - 不实现日志文件写入（由宿主插件负责）
  - 不实现日志上报/分析

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 5-9 的所有模块）
  - **Parallel Group**: Wave 1 末尾
  - **Blocks**: 任务 11-19（插件需要前端错误处理完成）
  - **Blocked By**: 任务 5, 6, 7, 8, 9

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:715-725` — 错误处理设计
  - `2026-07-19-wms-cad-wps-plugin-design.md:729-745` — 日志策略
  - `shared/js/error.js` — 错误处理模块

  **Acceptance Criteria**:
  - [ ] 错误发生时，UI 显示用户友好的提示信息
  - [ ] 日志记录包含：请求 URL、状态码、耗时
  - [ ] 网络断开时显示提示，恢复后地图自动重绘
  - [ ] WMS 返回空图片时显示"当前范围无数据"
  - [ ] 日志可通过 JS 接口传递给宿主插件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: 错误处理模式，日志系统设计

  **Commit**: YES
  - Message: `feat(frontend): error handling and logging`

---

### Wave 2: AutoCAD 插件开发（Day 14-21）

> 目标：完成 AutoCAD 插件全部功能。
> 前置：Wave 1 完成（共享前端可用），POC 验证通过。
> Worktree：在 wmstocad-autocad (feature/autocad-plugin) 中开发。

- [x] 11. AutoCAD 插件：.NET 项目搭建

  **What to do**:
  - 在 feature/autocad-plugin 分支，完善 autocad/ 项目结构
  - 配置 .NET 4.8 类库项目
  - 添加 NuGet 包：Microsoft.Web.WebView2
  - 引用 AutoCAD API（AcMgd.dll, AcDbMgd.dll, AcCoreMgd.dll）
  - 设置 Copy Local = False for AutoCAD DLLs
  - 创建基础类结构：WmsMapCommand, WmsPanel, WmsBridge
  - 实现 IExtensionApplication 接口（插件初始化/关闭）
  - 配置构建输出到 WmsMapPlugin/autocad/

  **Must NOT do**:
  - 不实现 UI 逻辑（任务 12 做）
  - 不复制 shared/ 代码到插件项目

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 Wave 1 完成）
  - **Parallel Group**: Wave 2 起始
  - **Blocks**: 任务 12, 13, 14, 15
  - **Blocked By**: 任务 10（共享前端完成）

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:96-125` — AutoCAD 插件架构
  - `2026-07-19-wms-cad-wps-plugin-design.md:828-832` — 最低版本要求
  - AutoCAD .NET API: https://help.autodesk.com/view/OARX/2024/ENU/
  - `autocad/WmsMapPlugin.csproj` — 项目文件

  **Acceptance Criteria**:
  - [ ] 项目可编译通过（无错误）
  - [ ] NuGet 包正确还原
  - [ ] AutoCAD API 引用正确（Copy Local = False）
  - [ ] NETLOAD 可加载 DLL（AutoCAD 中测试）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 项目配置，NuGet 包管理，无复杂逻辑

  **Commit**: YES
  - Message: `chore(autocad): .NET 4.8 project setup`

---

- [x] 12. AutoCAD 插件：PaletteSet + WebView2 面板

  **What to do**:
  - 实现 WmsPanel 类（继承 PaletteSet）
  - 在 PaletteSet 中嵌入 WebView2 控件
  - WebView2 加载 shared/map.html
  - 实现 WMSMAP 命令（CommandMethod 属性）
  - 命令执行时：创建/显示 PaletteSet
  - 面板行为：可停靠、可浮动、可关闭
  - WebView2 初始化：设置合适的浏览器版本检测
  - 面板尺寸：默认宽度 400px，最小 300px

  **Must NOT do**:
  - 不实现 C#↔JS 通信（任务 13 做）
  - 不实现图片插入（任务 14 做）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 11）
  - **Parallel Group**: Wave 2
  - **Blocks**: 任务 13
  - **Blocked By**: 任务 11

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:106-125` — PaletteSet 架构
  - `2026-07-19-wms-cad-wps-plugin-design.md:138-145` — 用户操作流程
  - `autocad/WmsPanel.cs` — 面板类

  **Acceptance Criteria**:
  - [ ] 在 AutoCAD 输入 WMSMAP，侧边栏面板打开
  - [ ] 面板中显示 Leaflet 地图（从 shared/map.html 加载）
  - [ ] 地图可缩放、平移
  - [ ] 面板可关闭，再次输入 WMSMAP 可重新打开
  - [ ] 面板宽度可调整，最小 300px

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: AutoCAD API + WebView2 集成，需要调试 UI 渲染

  **Commit**: YES
  - Message: `feat(autocad): PaletteSet + WebView2 integration`

---

- [x] 13. AutoCAD 插件：C# ↔ JavaScript 通信

  **What to do**:
  - 实现 WmsBridge 类（C#↔JS 通信桥）
  - C# → JS：
    - 读取 layers.json，通过 ExecuteScript 传给前端
    - 传递投影设置
    - 触发出图/截图
  - JS → C#：
    - 注册 WebMessageCallback 接收前端消息
    - 处理出图结果（base64 图片数据）
    - 处理日志消息（写入 autocad-plugin.log）
    - 处理错误消息（显示 AutoCAD 状态栏提示）
  - 实现配置文件路径管理（layers.json 相对路径解析）

  **Must NOT do**:
  - 不实现图片插入 CAD（任务 14 做）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 12）
  - **Parallel Group**: Wave 2
  - **Blocks**: 任务 14
  - **Blocked By**: 任务 12

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:130-134` — 核心功能表
  - `autocad/WmsBridge.cs` — 通信桥类
  - `shared/js/adapter.js` — 前端适配器（接收宿主指令）

  **Acceptance Criteria**:
  - [ ] C# 可将 layers.json 内容传给前端，前端正确解析并显示图层
  - [ ] 前端截图/出图后，C# 可接收到 base64 数据
  - [ ] 前端日志消息可写入 autocad-plugin.log
  - [ ] 前端错误可在 AutoCAD 状态栏显示提示

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: 跨进程通信，消息序列化，双向调用

  **Commit**: YES
  - Message: `feat(autocad): C#↔JS communication`

---

- [x] 14. AutoCAD 插件：图片插入 CAD

  **What to do**:
  - 实现图片插入逻辑：
    - 从 WmsBridge 接收 base64 图片数据
    - 将 base64 解码为 byte[]
    - 保存为临时 PNG 文件
    - 使用 AutoCAD API 创建 RasterImage 对象
    - 插入到模型空间（用户点击指定位置，或默认插入到视图中心）
    - 设置图片比例（根据出图分辨率和 CAD 单位）
  - 实现"插入地图"按钮的前端触发
  - 清理临时文件

  **Must NOT do**:
  - 不实现地理配准（世界文件）
  - 不实现批量插入

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 13）
  - **Parallel Group**: Wave 2
  - **Blocks**: 任务 15
  - **Blocked By**: 任务 9, 13

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:133-134` — 插入地图到 CAD
  - `autocad/WmsImageInserter.cs` — 图片插入类

  **Acceptance Criteria**:
  - [ ] 点击"插入地图"按钮后，图片出现在 CAD 模型空间
  - [ ] 图片可缩放、移动
  - [ ] 图片清晰度满足 150 DPI 要求
  - [ ] 临时文件在插入后被清理

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: AutoCAD RasterImage API，base64 解码，临时文件管理

  **Commit**: YES
  - Message: `feat(autocad): image insertion to CAD`

---

- [x] 15. AutoCAD 插件：配置管理与功能完善

  **What to do**:
  - 实现 layers.json 热重载：
    - 监控文件变化（FileSystemWatcher）
    - 或提供"刷新配置"命令
    - 更新前端图层列表
  - 实现日志写入（autocad-plugin.log）：
    - 插件启动/关闭时间
    - WMS 请求记录（从前端转发）
    - 异常堆栈
  - 实现 WebView2 崩溃检测与恢复提示
  - 实现 PackageContents.xml（自动加载插件）
  - 创建安装脚本（拷贝文件到 AutoCAD 插件目录）
  - 功能验证和性能优化

  **Must NOT do**:
  - 不实现配置编辑器 UI

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 14）
  - **Parallel Group**: Wave 2 末尾
  - **Blocks**: 任务 20（集成测试）
  - **Blocked By**: 任务 14

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:704-713` — 图层配置更新机制
  - `2026-07-19-wms-cad-wps-plugin-design.md:729-745` — 日志策略
  - `2026-07-19-wms-cad-wps-plugin-design.md:747-763` — 卸载方案
  - `autocad/PackageContents.xml` — 自动加载配置

  **Acceptance Criteria**:
  - [ ] 修改 layers.json 后，点击刷新或自动检测到变化，图层列表更新
  - [ ] autocad-plugin.log 记录启动/关闭/请求/异常
  - [ ] WebView2 崩溃时，显示"地图组件异常，请关闭面板重新打开"提示
  - [ ] PackageContents.xml 配置正确，AutoCAD 启动时自动加载插件
  - [ ] 安装脚本可一键部署

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: FileSystemWatcher，日志系统，PackageContents.xml 配置

  **Commit**: YES
  - Message: `feat(autocad): config management and polish`

---

### Wave 3: WPS PPT 插件开发（Day 18-25）

> 目标：完成 WPS PPT 插件全部功能。
> 前置：Wave 1 完成。可与 Wave 2 交替进行（1 人开发时，先完成 AutoCAD 再做 WPS，或交替）。
> Worktree：在 wmstocad-wps (feature/wps-plugin) 中开发。

- [x] 16. WPS 插件：JSAPI 项目搭建

  **What to do**:
  - 在 feature/wps-plugin 分支，完善 wps/ 项目结构
  - 创建 manifest.xml（插件清单）
  - 创建 ribbon.xml（参考设计文档第五节）
  - 创建 taskpane.html（任务窗格容器）
  - 配置 JSAPI 开发环境
  - 实现基础插件注册和加载逻辑

  **Must NOT do**:
  - 不实现地图功能（任务 17 做）
  - 不复制 shared/ 代码到插件目录

  **Parallelization**:
  - **Can Run In Parallel**: YES（可与 Wave 2 的 AutoCAD 开发交替）
  - **Parallel Group**: Wave 3 起始
  - **Blocks**: 任务 17, 18, 19
  - **Blocked By**: 任务 10（共享前端完成）

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:202-221` — ribbon.xml 设计
  - `2026-07-19-wms-cad-wps-plugin-design.md:159-179` — WPS 插件架构
  - WPS JSAPI 文档: https://open.wps.cn/
  - `wps/manifest.xml` — 插件清单
  - `wps/ribbon.xml` — Ribbon UI

  **Acceptance Criteria**:
  - [ ] WPS 可加载插件（manifest.xml 正确解析）
  - [ ] Ribbon 显示"WMS地图"选项卡
  - [ ] 点击按钮可打开任务窗格

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: XML 配置，项目骨架，无复杂逻辑

  **Commit**: YES
  - Message: `chore(wps): JSAPI project setup`

---

- [x] 17. WPS 插件：任务窗格 + 地图集成

  **What to do**:
  - 在 taskpane.html 中嵌入 shared/map.html（iframe 或直接加载）
  - 实现任务窗格尺寸自适应（最小 300px 宽）
  - 实现 ribbon "打开地图"按钮逻辑（openMapPane）
  - 实现图层配置读取（读取 shared/layers.json 传给前端）
  - 实现前端日志转发（写入 wps-plugin.log）
  - 验证 Leaflet 在 WPS 任务窗格中的渲染效果

  **Must NOT do**:
  - 不实现图片插入（任务 18 做）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 16）
  - **Parallel Group**: Wave 3
  - **Blocks**: 任务 18
  - **Blocked By**: 任务 16

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:183-189` — WPS 核心功能表
  - `2026-07-19-wms-cad-wps-plugin-design.md:193-199` — 用户操作流程
  - `wps/taskpane.html` — 任务窗格

  **Acceptance Criteria**:
  - [ ] 点击"打开地图"按钮，侧边栏显示 Leaflet 地图
  - [ ] 地图可缩放、平移、切换图层
  - [ ] 任务窗格宽度可调整，最小 300px
  - [ ] 图层配置从 layers.json 正确加载

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: WPS JSAPI 集成，iframe/任务窗格渲染调试

  **Commit**: YES
  - Message: `feat(wps): taskpane + map integration`

---

- [x] 18. WPS 插件：图片插入 PPT

  **What to do**:
  - 实现 ribbon "插入地图"按钮逻辑（insertMapImage）
  - 调用前端出图函数获取 base64 图片
  - 将 base64 转为临时文件（或使用 WPS API 直接接受 base64）
  - 调用 WPS JSAPI 插入图片到当前幻灯片
  - 图片定位：插入到幻灯片中心，保持宽高比
  - 实现 ribbon 按钮状态管理（无地图时禁用"插入地图"按钮）
  - 错误处理：插入失败时提示用户

  **Must NOT do**:
  - 不实现图片编辑功能（移动、缩放由 PPT 原生处理）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 17）
  - **Parallel Group**: Wave 3
  - **Blocks**: 任务 19
  - **Blocked By**: 任务 9, 17

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:188-189` — 插入地图到 PPT
  - `2026-07-19-wms-cad-wps-plugin-design.md:225-229` — WPS 风险点
  - `wps/js/insert.js` — 图片插入逻辑

  **Acceptance Criteria**:
  - [ ] 点击"插入地图"按钮，图片出现在当前幻灯片
  - [ ] 图片保持宽高比，居中放置
  - [ ] 图片清晰度满足 150 DPI 要求
  - [ ] 无地图时，"插入地图"按钮禁用
  - [ ] 插入失败时显示错误提示

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: WPS JSAPI Shapes.AddPicture，base64 转文件，幻灯片定位

  **Commit**: YES
  - Message: `feat(wps): image insertion to PPT`

---

- [x] 19. WPS 插件：Ribbon 完善与配置管理

  **What to do**:
  - 完善 ribbon 按钮图标和提示文本
  - 实现图层配置刷新功能
  - 实现日志写入（wps-plugin.log）
  - 实现 WPS 版本检测（确保 2019+）
  - 创建安装说明（WPS 插件安装步骤）
  - 功能验证和兼容性测试

  **Must NOT do**:
  - 不实现配置编辑器 UI

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 18）
  - **Parallel Group**: Wave 3 末尾
  - **Blocks**: 任务 20（集成测试）
  - **Blocked By**: 任务 18

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:729-745` — 日志策略
  - `2026-07-19-wms-cad-wps-plugin-design.md:755-758` — WPS 卸载方案
  - `wps/ribbon.xml` — Ribbon 定义

  **Acceptance Criteria**:
  - [ ] Ribbon 按钮图标清晰，提示文本准确
  - [ ] 刷新配置后，图层列表更新
  - [ ] wps-plugin.log 记录启动/关闭/请求/异常
  - [ ] WPS 2019 以下版本显示兼容性提示
  - [ ] 安装说明完整可操作

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: Ribbon XML 完善，日志系统，版本检测

  **Commit**: YES
  - Message: `feat(wps): ribbon, config, and polish`

---

### Wave 4: 集成测试 + 文档 + 发布（Day 22-25）

> 目标：合并所有分支到 master，执行集成测试，编写文档，打包发布。
> Worktree：回到主仓库（master）。

- [ ] 20. 集成测试

  **What to do**:
  - 合并 feature/shared-frontend → master
  - 合并 feature/autocad-plugin → master
  - 合并 feature/wps-plugin → master
  - 解决合并冲突（如果有）
  - 执行 Final Verification Wave（F1-F4）
  - 修复发现的问题
  - 在 AutoCAD 2021+ 和 WPS 2019+ 上完整测试

  **Must NOT do**:
  - 不添加新功能
  - 不重构已有代码

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖所有前序任务）
  - **Parallel Group**: Wave 4 起始
  - **Blocks**: 任务 21, 22
  - **Blocked By**: 任务 15, 19

  **References**:
  - Final Verification Wave（F1-F4）— 本计划末尾

  **Acceptance Criteria**:
  - [ ] F1 功能完整性：Must Have [N/N]
  - [ ] F2 量化性能：全部达标
  - [ ] F3 Must NOT Have：全部合规
  - [ ] F4 跨平台兼容：AutoCAD 2021+ 和 WPS 2019+ 测试通过
  - [ ] 所有分支已合并到 master

  **Recommended Agent Profile**:
  - **Category**: `oracle`
  - **Reason**: 集成验证，分支合并，冲突解决，需要全局视角

  **Commit**: YES
  - Message: `test: integration testing and merge`

---

- [ ] 21. 文档编写

  **What to do**:
  - 编写 docs/安装说明.md：
    - 环境要求（AutoCAD 2021+, WPS 2019+, Windows 10+, WebView2 Runtime）
    - AutoCAD 插件安装步骤
    - WPS 插件安装步骤
    - 卸载步骤
  - 编写 docs/用户手册.md：
    - AutoCAD 使用方法（WMSMAP 命令、图层选择、投影切换、插入地图）
    - WPS 使用方法（ribbon 按钮、图层选择、投影切换、插入地图）
    - 常见问题解答
  - 编写 docs/图层配置说明.md：
    - layers.json 格式说明
    - 如何添加新 WMS 服务
    - 如何添加自定义投影

  **Must NOT do**:
  - 不编写开发文档（v1 不面向开发者）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 20 的集成测试结果）
  - **Parallel Group**: Wave 4
  - **Blocks**: 任务 22
  - **Blocked By**: 任务 20

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:669-700` — 目录结构
  - `2026-07-19-wms-cad-wps-plugin-design.md:517-600` — layers.json 格式
  - `docs/安装说明.md`
  - `docs/用户手册.md`
  - `docs/图层配置说明.md`

  **Acceptance Criteria**:
  - [ ] 安装说明覆盖所有步骤，新用户可独立完成安装
  - [ ] 用户手册覆盖所有功能，含截图或操作步骤
  - [ ] 图层配置说明覆盖 layers.json 格式和扩展示例

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Reason**: 技术文档编写，需要清晰表达

  **Commit**: YES
  - Message: `docs: user manual and installation guide`

---

- [ ] 22. 发布打包

  **What to do**:
  - 创建安装包目录结构（WmsMapPlugin/）
  - 拷贝 shared/, autocad/, wps/, docs/ 到安装包目录
  - 创建一键安装脚本（PowerShell 或 BAT）：
    - AutoCAD 插件注册（拷贝到 ApplicationPlugins 或创建 PackageContents.xml）
    - WPS 插件注册
    - 环境变量或路径配置
  - 创建卸载脚本
  - 验证安装包在干净环境中的安装和卸载
  - 打 git tag（v1.0.0）

  **Must NOT do**:
  - 不创建 MSI/EXE 安装程序（v1 用脚本安装即可）

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖任务 21）
  - **Parallel Group**: Wave 4 末尾
  - **Blocks**: None
  - **Blocked By**: 任务 21

  **References**:
  - `2026-07-19-wms-cad-wps-plugin-design.md:669-700` — 安装目录结构
  - `2026-07-19-wms-cad-wps-plugin-design.md:747-763` — 卸载方案

  **Acceptance Criteria**:
  - [ ] 安装包目录结构完整
  - [ ] 安装脚本可一键部署
  - [ ] 卸载脚本可完全清除
  - [ ] 在干净环境中验证安装和卸载
  - [ ] git tag v1.0.0 已创建

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: 文件拷贝，脚本编写，git tag

  **Commit**: YES
  - Message: `chore: release v1.0.0 packaging`

---

## Final Verification Wave

> 全部开发完成后，在 master 上执行最终验证。

- [ ] F1. **功能完整性验证**
  验证所有 Must Have 项均已实现。逐项检查：
  - WMS 1.1.1 + EPSG:4490 地图加载
  - 图层切换（layers.json 配置）
  - 投影切换（5 个预定义 + 自定义）
  - GetMap 出图 → CAD/PPT
  - html2canvas 截图 → CAD/PPT
  - 错误处理和用户提示
  - 本地日志
  Output: `Must Have [N/N] | VERDICT: PASS/FAIL`

- [ ] F2. **量化性能验证**
  按验收标准逐项测量：
  - 地图加载 < 5 秒
  - 图层切换 < 3 秒
  - 投影切换 < 3 秒
  - 投影精度误差 < 1 米
  - 出图分辨率 ≥ 150 DPI
  - 插件启动 < 3 秒
  - 内存占用 < 200MB
  Output: `Performance [N/N pass] | VERDICT: PASS/FAIL`

- [ ] F3. **Must NOT Have 合规检查**
  搜索代码确认未包含排除项：
  - 无 WMS 1.3.0 代码路径
  - 无认证/鉴权逻辑
  - 无 GetFeatureInfo 实现
  - 无瓦片缓存逻辑
  - 无 GetCapabilities 自动解析
  - 无 CDN 引用（所有 lib 本地打包）
  Output: `Guardrails [N/N clean] | VERDICT: PASS/FAIL`

- [ ] F4. **跨平台兼容性验证**
  在目标平台验证：
  - AutoCAD 2021+ 加载插件正常
  - WPS 2019+ 加载插件正常
  - Windows 10+ 运行正常
  - WebView2 Runtime 已安装或自动安装
  Output: `Compatibility [N/N pass] | VERDICT: PASS/FAIL`

---

## Commit Strategy

每个任务完成后提交。提交信息格式：`type(scope): description`

| 任务 | 提交信息 | 文件 |
|------|---------|------|
| 1 | `chore: init project scaffold and layers.json` | 全部骨架文件 |
| 2 | `test(poc): CORS connectivity validation` | poc/cors-test/ |
| 3 | `test(poc): WebView2 + Leaflet integration` | poc/webview2-poc/ |
| 4 | `test(poc): WPS JSAPI + Leaflet integration` | poc/wps-poc/ |
| 5 | `feat(frontend): base HTML structure and UI layout` | shared/map.html, shared/css/ |
| 6 | `feat(frontend): Leaflet map init with EPSG:4490` | shared/js/map.js |
| 7 | `feat(frontend): projection system with proj4js` | shared/js/projection.js |
| 8 | `feat(frontend): WMS layer management` | shared/js/wms.js, shared/js/layers.js |
| 9 | `feat(frontend): GetMap and screenshot output` | shared/js/output.js |
| 10 | `feat(frontend): error handling and logging` | shared/js/error.js |
| 11 | `chore(autocad): .NET 4.8 project setup` | autocad/ |
| 12 | `feat(autocad): PaletteSet + WebView2 integration` | autocad/ |
| 13 | `feat(autocad): C#↔JS communication` | autocad/ |
| 14 | `feat(autocad): image insertion to CAD` | autocad/ |
| 15 | `feat(autocad): config management and polish` | autocad/ |
| 16 | `chore(wps): JSAPI project setup` | wps/ |
| 17 | `feat(wps): taskpane + map integration` | wps/ |
| 18 | `feat(wps): image insertion to PPT` | wps/ |
| 19 | `feat(wps): ribbon, config, and polish` | wps/ |
| 20 | `test: integration testing` | all |
| 21 | `docs: user manual and installation guide` | docs/ |
| 22 | `chore: release packaging` | installer/ |

---

## Success Criteria

### Verification Commands

```powershell
# 共享前端验证
start shared/map.html  # 浏览器打开，验证地图加载

# AutoCAD 插件验证
# 在 AutoCAD 中 NETLOAD autocad/WmsMapPlugin.dll
# 输入 WMSMAP 命令，验证面板显示

# WPS 插件验证
# 在 WPS 中加载 wps/ 目录
# 点击 ribbon 按钮，验证侧边栏显示
```

### Final Checklist

- [ ] 所有 Must Have 功能已实现
- [ ] 所有 Must NOT Have 未出现
- [ ] 量化性能指标达标
- [ ] AutoCAD 2021+ 测试通过
- [ ] WPS 2019+ 测试通过
- [ ] 安装包可正常安装和卸载
- [ ] 用户手册完整
