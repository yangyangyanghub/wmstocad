# WMS 地图插件设计文档

> 日期：2026-07-19
> 状态：已完成

---

## 一、需求背景

院里有时空数据平台，提供 WMS 标准服务，ArcGIS 等 GIS 软件可以读取，但 CAD 和 PPT 用户无法使用。需要开发第三方插件，让 AutoCAD 和 WPS PPT 用户可以直接在软件内打开可交互地图（缩放、平移、切换图层）。

### 核心需求

| 需求 | 说明 |
|------|------|
| 目标平台 | AutoCAD + WPS PPT |
| 功能 | 可交互地图（缩放、平移、切换图层） |
| 数据源 | WMS 服务（EPSG:4490，多图层，无认证） |
| 技术栈 | C# (AutoCAD) + JavaScript (WPS) |

### WMS 服务参数

| 项目 | 值 |
|------|-----|
| WMS 版本 | 1.1.1 |
| 坐标系 | EPSG:4490（中国大地坐标系） |
| 范围 | 经度 113.45°-115.50°，纬度 36.04°-37.02° |
| 图层数量 | 多个（需要支持图层切换） |
| 支持格式 | PNG/JPEG/BMP/GIF |
| 认证 | 无认证（公开访问） |
| 提供方 | 成都陆拓信息技术有限公司（MixServer） |

---

## 二、技术选型

### 方案对比

| 方案 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| **纯前端方案（选定）** | 前端直接调 WMS，无后端 | 简单、轻量、易部署 | 无 |
| Python 后端方案 | Flask 做 WMS 代理 | 可做缓存 | 多一层依赖，过度设计 |
| CEF 嵌入式方案 | 用 CEF 替代 WebView2 | 兼容性好 | 体积大，部署麻烦 |

### 选定方案：纯前端

```
AutoCAD 插件 (C#)              WPS 插件 (JS)
┌────────────────────┐    ┌────────────────────┐
│  C# 插件            │    │  JSAPI 插件         │
│  ┌──────────────┐  │    │  ┌──────────────┐  │
│  │ WebView2     │  │    │  │ HTML 页面     │  │
│  │   ↓          │  │    │  │   ↓          │  │
│  │ Leaflet +    │  │    │  │ Leaflet +    │  │
│  │ proj4js      │  │    │  │ proj4js      │  │
│  └──────────────┘  │    │  └──────────────┘  │
└──────────┬─────────┘    └──────────┬─────────┘
           │                         │
           └──────────┬──────────────┘
                      │ HTTP (直接请求 WMS)
                      ↓
           ┌─────────────────────┐
           │  时空数据平台 WMS    │
           │  (61.240.150.90)     │
           └─────────────────────┘
```

---

## 三、系统架构

### 核心设计原则

1. **前端直接调 WMS** — 无中间层，请求直接到 WMS 服务
2. **EPSG:4490 前端处理** — 用 Leaflet + proj4js 插件
3. **图层配置** — 用 JSON 文件存储，前端读取
4. **共享前端代码** — AutoCAD 和 WPS 共用同一套 Leaflet 代码（HTML/JS/CSS）

### 数据流

```
用户操作（缩放/平移/切换图层）
  ↓
前端 Leaflet 发送请求到 WMS 服务
  ↓
WMS 服务返回地图图片
  ↓
前端 Leaflet 渲染地图
```

---

## 四、AutoCAD 插件设计

### 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 插件框架 | .NET 4.8 + AutoCAD API | AutoCAD 官方插件开发方式 |
| UI 控件 | WebView2 | 微软官方 Chromium 控件，显示 HTML 地图 |
| 通信 | C# ↔ JavaScript | WebView2 支持双向调用 |

### 架构

```
AutoCAD
┌─────────────────────────────────────────┐
│  C# 插件（.NET 4.8）                     │
│  ┌───────────────────────────────────┐  │
│  │ WmsPanel (PaletteSet)             │  │
│  │ ┌─────────────────────────────┐   │  │
│  │ │ WebView2 控件                │   │  │
│  │ │                             │   │  │
│  │ │  加载 map.html              │   │  │
│  │ │  显示 Leaflet 地图           │   │  │
│  │ │                             │   │  │
│  │ └─────────────────────────────┘   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  功能：                                  │
│  - 打开/关闭地图面板                     │
│  - 读取图层配置（JSON）                  │
│  - 传递配置给前端                        │
└─────────────────────────────────────────┘
```

### 核心功能

| 功能 | 实现方式 |
|------|---------|
| 打开地图面板 | AutoCAD 命令 `WMSMAP`，创建 PaletteSet 显示 WebView2 |
| 加载图层配置 | C# 读取 `layers.json`，通过 WebView2 的 `ExecuteScript` 传给前端 |
| 前端交互 | 用户在 Leaflet 中缩放/平移/切换图层，前端直接请求 WMS |
| 插入地图到 CAD | 前端截图 → 传给 C# → 插入为 AutoCAD 图片对象 |

### 用户操作流程

```
1. 用户在 AutoCAD 输入命令：WMSMAP
2. 插件打开侧边栏面板，显示地图
3. 用户选择图层（下拉框）
4. 地图加载，可以缩放/平移
5. 用户点击"插入地图"按钮
6. 地图截图插入到 CAD 当前视图
```

---

## 五、WPS PPT 插件设计

### 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 插件框架 | WPS JSAPI (JavaScript) | WPS 官方插件开发方式 |
| UI | 任务窗格 (Taskpane) | HTML 页面嵌入侧边栏 |
| 地图 | Leaflet + proj4js | 和 AutoCAD 插件共用同一套前端代码 |

### 架构

```
WPS PPT
┌─────────────────────────────────────────┐
│  JSAPI 插件                              │
│  ┌───────────────────────────────────┐  │
│  │ 任务窗格 (Taskpane)               │  │
│  │ ┌─────────────────────────────┐   │  │
│  │ │                             │   │  │
│  │ │  加载 map.html              │   │  │
│  │ │  显示 Leaflet 地图           │   │  │
│  │ │                             │   │  │
│  │ └─────────────────────────────┘   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  功能：                                  │
│  - 打开/关闭地图侧边栏                   │
│  - 读取图层配置（JSON）                  │
│  - 插入地图图片到幻灯片                  │
└─────────────────────────────────────────┘
```

### 核心功能

| 功能 | 实现方式 |
|------|---------|
| 打开地图侧边栏 | WPS 任务窗格，加载 map.html |
| 加载图层配置 | JS 读取 layers.json，传给 Leaflet |
| 前端交互 | 用户在 Leaflet 中缩放/平移/切换图层 |
| 插入地图到 PPT | 前端 html2canvas 截图 → 调用 WPS API 插入图片 |

### 用户操作流程

```
1. 用户在 WPS PPT 点击插件按钮
2. 侧边栏打开，显示地图
3. 用户选择图层（下拉框）
4. 地图加载，可以缩放/平移
5. 用户点击"插入地图"按钮
6. 地图截图插入到当前幻灯片
```

### 插件注册（ribbon.xml）

```xml
<customUI xmlns="http://schemas.microsoft.com/office/2006/01/customui">
  <ribbon>
    <tabs>
      <tab id="wmsMapTab" label="WMS地图">
        <group id="mapGroup" label="地图">
          <button id="openMap" label="打开地图"
                  onAction="openMapPane"
                  imageMso="MapPin"/>
          <button id="insertMap" label="插入地图"
                  onAction="insertMapImage"
                  imageMso="PictureInsert"/>
        </group>
      </tab>
    </tabs>
  </ribbon>
</customUI>
```

### 风险点

| 风险 | 应对 |
|------|------|
| WPS JSAPI 不支持直接插入图片 | 用 html2canvas 截图后，通过 WPS API 的 Shapes.AddPicture 插入 |
| WPS 侧边栏尺寸限制 | 地图区域自适应侧边栏宽度，最小 300px |
| WPS 版本兼容性 | 需要 WPS 2019 及以上版本，支持 JSAPI |

---

## 六、共享前端代码设计

### 6.1 EPSG:4490 投影设置

#### 坐标系定义

EPSG:4490 是 **CGCS2000（中国大地坐标系 2000）**，是地理坐标系（经纬度），不是投影坐标系。

| 参数 | 值 |
|------|-----|
| **坐标系名称** | China Geodetic Coordinate System 2000 |
| **EPSG 代码** | 4490 |
| **类型** | 地理坐标系（Geographic 2D） |
| **椭球体** | GRS80 |
| **长半轴** | 6378137.0 米 |
| **扁率** | 298.257222101 |
| **适用范围** | 中国（73.62°E - 134.77°E, 16.7°N - 53.56°N） |
| **单位** | 度（degree） |

#### proj4 定义

```javascript
// 在 proj4js 中定义 EPSG:4490
proj4.defs("EPSG:4490", "+proj=longlat +ellps=GRS80 +no_defs +type=crs");
```

完整参数说明：
- `+proj=longlat` — 经纬度投影（地理坐标系）
- `+ellps=GRS80` — GRS80 椭球体
- `+no_defs` — 不加载默认参数
- `+type=crs` — 定义为坐标系

#### WKT 定义

```
GEOGCS["China Geodetic Coordinate System 2000",
  DATUM["China_2000",
    SPHEROID["CGCS2000", 6378137, 298.257222101,
      AUTHORITY["EPSG","1024"]],
    AUTHORITY["EPSG","1043"]],
  PRIMEM["Greenwich", 0,
    AUTHORITY["EPSG","8901"]],
  UNIT["degree", 0.0174532925199433,
    AUTHORITY["EPSG","9122"]],
  AUTHORITY["EPSG","4490"]]
```

#### Leaflet CRS 配置

```javascript
// 1. 定义 EPSG:4490 投影
proj4.defs("EPSG:4490", "+proj=longlat +ellps=GRS80 +no_defs +type=crs");

// 2. 创建 Leaflet CRS
var crs4490 = new L.Proj.CRS(
  "EPSG:4490",
  "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
  {
    // 原点：中国区域中心
    origin: [104.0, 35.0],
    
    // 分辨率（度/像素）
    // 根据 WMS 服务支持的缩放级别调整
    resolutions: [
      0.1,        // 级别 0：约 11km/像素
      0.05,       // 级别 1：约 5.5km/像素
      0.02,       // 级别 2：约 2.2km/像素
      0.01,       // 级别 3：约 1.1km/像素
      0.005,      // 级别 4：约 550m/像素
      0.002,      // 级别 5：约 220m/像素
      0.001,      // 级别 6：约 110m/像素
      0.0005,     // 级别 7：约 55m/像素
      0.0002,     // 级别 8：约 22m/像素
      0.0001,     // 级别 9：约 11m/像素
      0.00005,    // 级别 10：约 5.5m/像素
      0.00002,    // 级别 11：约 2.2m/像素
      0.00001     // 级别 12：约 1.1m/像素
    ],
    
    //  bounds: 中国范围
    bounds: L.bounds([73.62, 16.7], [134.77, 53.56])
  }
);

// 3. 创建地图实例
var map = L.map('map', {
  crs: crs4490,
  center: [36.5, 114.5],  // 河北/山东一带（WMS 服务区域）
  zoom: 6,
  maxZoom: 12,
  minZoom: 0
});

// 4. 创建 WMS 图层
var wmsLayer = L.tileLayer.wms(wmsUrl, {
  layers: layerName,
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  crs: crs4490,
  // WMS 1.1.1 使用 SRS 参数
  srs: 'EPSG:4490'
});

wmsLayer.addTo(map);
```

#### 分辨率计算说明

EPSG:4490 是经纬度坐标系，分辨率单位是 **度/像素**。

换算关系（在纬度 36° 附近）：
- 1 度经度 ≈ 89 km
- 1 度纬度 ≈ 111 km

示例：
- 分辨率 0.01 度 ≈ 1.1 km/像素
- 分辨率 0.001 度 ≈ 110 m/像素
- 分辨率 0.0001 度 ≈ 11 m/像素

#### 与 WGS84（EPSG:4326）的区别

| 参数 | EPSG:4490 (CGCS2000) | EPSG:4326 (WGS84) |
|------|---------------------|-------------------|
| 椭球体 | GRS80 | WGS84 |
| 长半轴 | 6378137.0 米 | 6378137.0 米 |
| 扁率 | 298.257222101 | 298.257223563 |
| 差异 | 中国自主建立 | 美国 GPS 系统 |
| 实际偏差 | 约 0.1-0.5 米 | 基准 |

**注意**：CGCS2000 和 WGS84 的椭球体参数非常接近，在大多数应用场景下可以认为等价，但高精度应用需要区分。

#### 投影坐标系设置

WMS 服务是地理坐标系（EPSG:4490，经纬度），但 CAD 用户需要投影坐标系（单位：米）。插件支持在 UI 中设置目标投影坐标系，前端通过 proj4js 实时转换。

**支持的投影坐标系：**

| EPSG 代码 | 名称 | 适用区域 | 说明 |
|-----------|------|---------|------|
| EPSG:4534 | CGCS2000 / 3-degree Gauss-Kruger CM 114E | 河北、山东（112.5°-115.5°E） | 3度带，中央经线 114°E |
| EPSG:4535 | CGCS2000 / 3-degree Gauss-Kruger CM 117E | 山东、江苏（115.5°-118.5°E） | 3度带，中央经线 117°E |
| EPSG:4502 | CGCS2000 / 3-degree Gauss-Kruger zone 38 | 同上 | 带号 38 |
| EPSG:4536 | CGCS2000 / 3-degree Gauss-Kruger CM 120E | 江苏、浙江（118.5°-121.5°E） | 3度带，中央经线 120°E |
| EPSG:3857 | WGS 84 / Pseudo-Mercator | 全球 | Web 墨卡托，Leaflet 默认 |
| 自定义 | 用户自定义 proj4 字符串 | 任意 | 高级用户可手动输入 |

**投影显示流程：**

```
WMS 服务（EPSG:4490 经纬度）
  ↓
用户选择目标投影（如 EPSG:4534）
  ↓
Leaflet 根据目标投影计算当前视图范围
  ↓
proj4js 将视图范围反算为 EPSG:4490 的 BBOX
  ↓
前端请求 WMS，SRS 参数仍为 EPSG:4490，BBOX 使用反算后的经纬度范围
  ↓
WMS 返回该经纬度范围内的地图图片
  ↓
Leaflet 以投影坐标系（米）渲染地图
  ↓
用户在 CAD/PPT 中看到的地图单位是米
```

**关键纠偏**：WMS 返回的是图片，不是矢量坐标数据，因此不能“把图片从经纬度转换成投影坐标”。正确做法是：前端先把当前投影视图范围反算成 WMS 支持的 EPSG:4490 经纬度 BBOX，再请求 WMS 图片，最后由 Leaflet 按目标投影把图片贴到正确位置。

**WMS 版本与 BBOX 顺序：**

| WMS 版本 | 坐标参数 | EPSG:4490 BBOX 顺序 | 说明 |
|----------|----------|---------------------|------|
| 1.1.1 | `SRS=EPSG:4490` | `minx,miny,maxx,maxy` | 即 `minLon,minLat,maxLon,maxLat`，当前 MixServer 服务使用此版本 |
| 1.3.0 | `CRS=EPSG:4490` | 需按服务能力测试确认 | 1.3.0 对部分地理坐标系存在轴顺序差异，不能直接套用 1.1.1 |

当前服务明确是 WMS 1.1.1，因此插件第一版固定使用：

```text
SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&SRS=EPSG:4490&BBOX=minLon,minLat,maxLon,maxLat
```

**proj4 投影定义示例：**

```javascript
// EPSG:4534: CGCS2000 / 3度带，中央经线 114°E
proj4.defs("EPSG:4534",
  "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 " +
  "+x_0=38500000 +y_0=0 +ellps=GRS80 " +
  "+units=m +no_defs +type=crs"
);

// EPSG:4535: CGCS2000 / 3度带，中央经线 117°E
proj4.defs("EPSG:4535",
  "+proj=tmerc +lat_0=0 +lon_0=117 +k=1 " +
  "+x_0=39500000 +y_0=0 +ellps=GRS80 " +
  "+units=m +no_defs +type=crs"
);

// EPSG:3857: Web 墨卡托
proj4.defs("EPSG:3857",
  "+proj=merc +a=6378137 +b=6378137 " +
  "+lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 " +
  "+k=1 +units=m +no_defs +type=crs"
);
```

**投影设置 UI：**

```
┌─────────────────────────────────────┐
│  投影设置                            │
│                                     │
│  源坐标系：EPSG:4490 (CGCS2000)     │
│                                     │
│  目标投影：[下拉选择 ▼]              │
│    - EPSG:4534 (3度带 114°E)        │
│    - EPSG:4535 (3度带 117°E)        │
│    - EPSG:4536 (3度带 120°E)        │
│    - EPSG:3857 (Web 墨卡托)         │
│    - 自定义...                       │
│                                     │
│  中央经线：[114     ] °E            │
│  单位：米                            │
│                                     │
│  [应用] [重置]                       │
└─────────────────────────────────────┘
```

**Leaflet 投影 CRS 配置：**

```javascript
// 根据用户选择的投影创建 Leaflet CRS
function createProjectedCrs(epsgCode, proj4def) {
  // 注册投影定义
  proj4.defs(epsgCode, proj4def);
  
  // 创建投影 CRS
  return new L.Proj.CRS(epsgCode, proj4def, {
    origin: [0, 0],
    resolutions: [
      // 投影坐标系分辨率（米/像素）
      1000,     // 1km/像素
      500,      // 500m/像素
      200,      // 200m/像素
      100,      // 100m/像素
      50,       // 50m/像素
      20,       // 20m/像素
      10,       // 10m/像素
      5,        // 5m/像素
      2,        // 2m/像素
      1,        // 1m/像素
      0.5,      // 0.5m/像素
      0.2,      // 0.2m/像素
      0.1       // 0.1m/像素
    ]
  });
}

// 使用示例：切换到 EPSG:4534
var projectedCrs = createProjectedCrs("EPSG:4534",
  "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 " +
  "+x_0=38500000 +y_0=0 +ellps=GRS80 " +
  "+units=m +no_defs +type=crs"
);

map.options.crs = projectedCrs;
map.setView([36.5, 114.5], 6);
```

**关键说明：**

1. **WMS 请求不变** — 仍然用 EPSG:4490 请求 WMS 服务，因为服务端只支持这个坐标系
2. **转换的是视图范围，不是图片** — proj4js 负责在目标投影坐标和 EPSG:4490 经纬度 BBOX 之间转换
3. **CAD 友好** — 最终在 CAD 中显示的地图单位是米，可以直接量测、标注
4. **自动匹配带号** — 根据 WMS 服务的中心经度，自动推荐合适的 3 度带投影
5. **第一版优先 3 度带投影** — 对当前经度范围 113.45°-115.50°，默认推荐 EPSG:4534（中央经线 114°E）

---

## 七、图层配置格式

### layers.json 结构

```json
{
  "services": [
    {
      "id": "dom202605y2m18level",
      "name": "DOM 2026年5月 18级",
      "url": "http://61.240.150.90:8088/mixserver/services/map-ugcv5-dom202605y2m18level/wms111/dom202605y2m18level?",
      "version": "1.1.1",
      "srs": "EPSG:4490",
      "format": "image/png",
      "bbox": {
        "minx": 113.4515533010966,
        "miny": 36.04214231457183,
        "maxx": 115.49902771933739,
        "maxy": 37.02216653756615
      },
      "layers": [
        {
          "name": "0",
          "title": "DOM 底图",
          "queryable": true
        }
      ]
    }
  ],
  "defaultProjection": {
    "epsg": "EPSG:4534",
    "name": "CGCS2000 / 3度带 114°E",
    "proj4": "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"
  },
  "availableProjections": [
    {
      "epsg": "EPSG:4490",
      "name": "CGCS2000 (经纬度)",
      "proj4": "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
      "unit": "度"
    },
    {
      "epsg": "EPSG:4534",
      "name": "CGCS2000 / 3度带 114°E",
      "proj4": "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      "unit": "米"
    },
    {
      "epsg": "EPSG:4535",
      "name": "CGCS2000 / 3度带 117°E",
      "proj4": "+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      "unit": "米"
    },
    {
      "epsg": "EPSG:4536",
      "name": "CGCS2000 / 3度带 120°E",
      "proj4": "+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
      "unit": "米"
    },
    {
      "epsg": "EPSG:3857",
      "name": "Web 墨卡托",
      "proj4": "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +no_defs +type=crs",
      "unit": "米"
    }
  ]
}
```

### 配置说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `services` | array | WMS 服务列表 |
| `services[].id` | string | 服务唯一标识 |
| `services[].name` | string | 服务显示名称 |
| `services[].url` | string | WMS 服务地址 |
| `services[].version` | string | WMS 版本（1.1.1 或 1.3.0） |
| `services[].srs` | string | 坐标系代码 |
| `services[].format` | string | 图片格式 |
| `services[].bbox` | object | 服务范围（经纬度） |
| `services[].layers` | array | 图层列表 |
| `defaultProjection` | object | 默认投影设置 |
| `availableProjections` | array | 可选投影列表 |

### 扩展新服务

在 `services` 数组中添加新项即可，前端自动渲染图层列表。

---

## 八、开发计划

### 阶段划分

| 阶段 | 内容 | 周期 | 交付物 |
|------|------|------|--------|
| **阶段 1：共享前端** | Leaflet + proj4js 地图组件 | 2 周 | map.html 可独立运行 |
| **阶段 2：AutoCAD 插件** | C# + WebView2 集成 | 2 周 | CAD 插件安装包 |
| **阶段 3：WPS PPT 插件** | JSAPI 任务窗格集成 | 2 周 | WPS 插件安装包 |
| **阶段 4：测试优化** | 联调、性能优化、文档 | 1 周 | 用户手册 |

### 阶段 1：共享前端（2 周）

| 任务 | 说明 | 工期 |
|------|------|------|
| 搭建项目结构 | HTML/CSS/JS 文件组织 | 1 天 |
| Leaflet 地图初始化 | 加载地图、缩放、平移 | 2 天 |
| proj4js 坐标转换 | EPSG:4490 定义、投影切换 | 3 天 |
| WMS 图层加载 | 读取 layers.json、图层切换 | 2 天 |
| 截图功能 | html2canvas 截图、导出 base64 | 2 天 |

### 阶段 2：AutoCAD 插件（2 周）

| 任务 | 说明 | 工期 |
|------|------|------|
| 创建 .NET 项目 | Visual Studio 项目模板 | 1 天 |
| PaletteSet 面板 | 创建侧边栏 UI | 2 天 |
| WebView2 集成 | 嵌入 map.html | 3 天 |
| C# ↔ JS 通信 | 传递配置、接收截图 | 2 天 |
| 插入图片到 CAD | 截图转 RasterImage | 2 天 |

### 阶段 3：WPS PPT 插件（2 周）

| 任务 | 说明 | 工期 |
|------|------|------|
| 创建 JSAPI 项目 | WPS 插件项目结构 | 1 天 |
| 任务窗格 UI | HTML 侧边栏 | 2 天 |
| 加载 map.html | 复用前端代码 | 2 天 |
| WPS API 调用 | 插入图片到幻灯片 | 3 天 |
| ribbon 按钮 | 工具栏按钮绑定 | 2 天 |

### 阶段 4：测试优化（1 周）

| 任务 | 说明 | 工期 |
|------|------|------|
| 功能测试 | 各平台功能验证 | 2 天 |
| 性能优化 | 加载速度、内存占用 | 2 天 |
| 用户手册 | 安装说明、使用文档 | 1 天 |

### 里程碑

| 时间 | 里程碑 |
|------|--------|
| 第 2 周末 | map.html 可独立运行，支持图层切换、投影切换 |
| 第 4 周末 | AutoCAD 插件可用，WMSMAP 命令打开地图面板 |
| 第 6 周末 | WPS PPT 插件可用，侧边栏显示地图 |
| 第 7 周末 | 全部完成，交付安装包和文档 |

---

## 九、部署与运维设计

### 9.1 安装目录结构

插件采用共享前端、双宿主插件的目录结构：

```
WmsMapPlugin/
├── shared/
│   ├── map.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── map.js
│   │   ├── wms.js
│   │   ├── layers.js
│   │   ├── projection.js
│   │   └── adapter.js
│   ├── lib/
│   │   ├── leaflet/
│   │   ├── proj4/
│   │   ├── proj4leaflet/
│   │   └── html2canvas/
│   └── layers.json
├── autocad/
│   ├── WmsMapPlugin.dll
│   ├── WmsMapPlugin.bundle/
│   └── PackageContents.xml
├── wps/
│   ├── manifest.xml
│   ├── ribbon.xml
│   └── taskpane.html
└── docs/
    ├── 安装说明.md
    ├── 用户手册.md
    └── 图层配置说明.md
```

### 9.2 图层配置更新机制

第一版采用 `layers.json` 文件配置，不做数据库和后台管理系统。

用户更新图层有两种方式：

| 方式 | 说明 | 适用对象 |
|------|------|----------|
| 手动编辑 | 直接编辑 `shared/layers.json` | 管理员、技术人员 |
| 插件内刷新 | 修改文件后点击“刷新图层配置” | 普通用户 |

后续版本可增加“添加服务”UI：输入 WMS GetCapabilities 地址，插件自动解析服务名称、图层、范围、格式和坐标系。

### 9.3 错误处理设计

| 场景 | 处理方式 | 用户提示 |
|------|----------|----------|
| WMS 服务不可访问 | 请求超时后重试 1 次，失败后停止加载 | “地图服务连接失败，请检查网络或服务地址” |
| GetCapabilities 解析失败 | 保留旧配置，不覆盖 layers.json | “服务元数据解析失败，请确认 WMS 地址是否正确” |
| 图层加载失败 | 标记该图层不可用，其他图层继续加载 | “图层加载失败：{图层名}” |
| 投影参数错误 | 回退到 EPSG:4490 | “投影参数无效，已切换到默认坐标系” |
| 出图失败 | 如果截图失败，自动尝试 GetMap 出图 | “截图失败，正在尝试服务端出图” |
| 配置文件格式错误 | 阻止插件继续初始化 | “layers.json 格式错误，请联系管理员” |

### 9.4 日志策略

插件写入本地日志，便于排查部署问题。

```
WmsMapPlugin/logs/
├── autocad-plugin.log
├── wps-plugin.log
└── frontend.log
```

日志记录内容：

1. 插件启动和关闭时间。
2. WMS 请求 URL、响应状态、耗时。
3. 图层配置加载结果。
4. 投影切换记录。
5. 插图、截图、GetMap 出图结果。
6. 异常堆栈和错误提示。

### 9.5 卸载方案

AutoCAD 插件卸载：

1. 删除 AutoCAD ApplicationPlugins 目录下的 `WmsMapPlugin.bundle`。
2. 删除安装目录 `WmsMapPlugin/autocad`。
3. 如有启动注册项，移除对应注册配置。

WPS 插件卸载：

1. 在 WPS 插件管理中停用并移除插件。
2. 删除安装目录 `WmsMapPlugin/wps`。
3. 保留或删除 `shared/layers.json` 由管理员决定。

共享数据卸载：

- 如果用户需要保留图层配置，只删除宿主插件目录。
- 如果完全卸载，删除整个 `WmsMapPlugin` 目录。

---

## 十、风险与约束

| 风险 | 应对 |
|------|------|
| WMS 服务 CORS 限制 | 优先在 MixServer 或网关配置 `Access-Control-Allow-Origin`；若无法配置，再评估桌面宿主是否允许本地文件跨域访问 |
| EPSG:4490 投影精度 | 使用 EPSG 官方 proj4 参数；第一版默认 EPSG:4534，并用已知控制点校验误差 |
| AutoCAD WebView2 兼容性 | 第一版要求 AutoCAD 2021+；旧版 AutoCAD 需另行评估 CEF 或 WinForms Browser 方案 |
| WPS JSAPI 限制 | 第一版要求 WPS 2019+，开发前先做任务窗格加载 Leaflet 和插入图片的 POC |
| html2canvas 截图限制 | WMS 图片跨域时截图可能失败；需要 WMS 开启 CORS，前端设置 `useCORS: true`，必要时改用 GetMap 按当前视图直接生成图片 |

### 10.1 离线部署约束

插件不能依赖公网 CDN。Leaflet、proj4js、proj4leaflet、html2canvas 等前端依赖必须随插件一起离线打包。

```
shared/lib/
├── leaflet/
│   ├── leaflet.css
│   └── leaflet.js
├── proj4/
│   └── proj4.js
├── proj4leaflet/
│   └── proj4leaflet.js
└── html2canvas/
    └── html2canvas.min.js
```

`map.html` 中禁止引用 `https://unpkg.com`、`https://cdn.jsdelivr.net` 等公网地址，全部改为本地相对路径。

### 10.2 CORS 处理策略

第一优先级是在 WMS 服务端或前置网关增加响应头：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

如果服务端无法配置 CORS，需要在 POC 阶段分别验证：

1. AutoCAD WebView2 加载本地 `map.html` 时是否允许请求院内 HTTP WMS。
2. WPS 任务窗格加载本地或内置 HTML 时是否允许请求院内 HTTP WMS。
3. html2canvas 是否能截取跨域 WMS 图片。

如果 1 或 2 失败，纯前端方案需要退回本地代理方案；如果只有 3 失败，则保留交互地图，插图功能改用 GetMap 按当前视图重新请求静态图片。

### 10.3 截图与出图策略

插件提供两种出图方式：

| 方式 | 用途 | 说明 |
|------|------|------|
| 屏幕截图 | 快速插入当前可见地图 | 使用 html2canvas，受屏幕分辨率和跨域限制影响 |
| WMS GetMap 出图 | 高质量插入 CAD/PPT | 根据当前视图 BBOX、图层和投影设置重新请求指定宽高图片 |

第一版优先实现 **WMS GetMap 出图**，因为它不依赖浏览器截图能力，质量更可控。html2canvas 作为快速预览方案保留。

### 10.4 最低版本要求

| 平台 | 最低版本 | 原因 |
|------|----------|------|
| AutoCAD | AutoCAD 2021+ | WebView2 支持更稳定，.NET 插件生态成熟 |
| WPS | WPS 2019+ | 需要 JSAPI 和任务窗格能力 |
| Windows | Windows 10+ | WebView2 Runtime 和现代浏览器内核依赖 |

---

## 十一、参考资料

- WMS GetCapabilities: http://61.240.150.90:8088/mixserver/services/map-ugcv5-dom202605y2m18level/wms111/dom202605y2m18level?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities
- Leaflet 文档: https://leafletjs.com/
- proj4js 文档: https://github.com/proj4js/proj4js
- AutoCAD .NET API: https://help.autodesk.com/view/OARX/2024/ENU/
- WPS JSAPI 文档: https://open.wps.cn/
