# CORS 连通性验证报告

## 基本信息

| 项目 | 值 |
|------|-----|
| 测试日期 | 2026-07-20 12:07 (UTC+8) |
| WMS URL | `http://61.240.150.90:8088/mixserver/services/map-ugcv5-dom202605y2m18level/wms111/dom202605y2m18level?` |
| 服务端 | nginx/1.22.1 |
| 代理 | 本机代理 127.0.0.1:7890 |

## 测试结果

### 1. GetCapabilities（无 Origin 头）

```
HTTP/1.1 200
Content-Type: application/vnd.ogc.wms_xml;charset=utf-8
Vary: Origin
Vary: Access-Control-Request-Method
Vary: Access-Control-Request-Headers
```

无 CORS 头（正常，浏览器只在带 Origin 时才需要 CORS 响应）。

### 2. GetMap（无 Origin 头）

```
HTTP/1.1 200
Content-Type: image/png
Vary: Origin
Vary: Access-Control-Request-Method
Vary: Access-Control-Request-Headers
```

无 CORS 头（同上）。

### 3. OPTIONS 预检（Origin: http://localhost）

```
HTTP/1.1 200
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: GET,POST,DELETE,PUT,PATCH
Access-Control-Allow-Origin: http://localhost
Access-Control-Max-Age: 3600
Allow: GET, HEAD, POST, PUT, DELETE, TRACE, OPTIONS, PATCH
```

**预检通过。**

### 4. GetCapabilities GET（Origin: http://localhost）

```
HTTP/1.1 200
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: http://localhost
Content-Type: application/vnd.ogc.wms_xml;charset=utf-8
```

**实际请求通过。** 返回完整 WMS Capabilities XML（3547 字节）。

### 5. GetMap GET（Origin: http://localhost）

```
HTTP/1.1 200
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: http://localhost
Content-Type: image/png
```

**实际请求通过。** 返回有效 PNG 图片（~807KB）。

### 6. OPTIONS 预检（Origin: file://）

```
HTTP/1.1 200
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: GET,POST,DELETE,PUT,PATCH
Access-Control-Allow-Origin: file://
Access-Control-Max-Age: 3600
```

**file:// 源也通过预检。**

### 7. HEAD 请求 + Origin（已知限制）

使用 `-I`（HEAD 方法）带 Origin 头时返回 403。这是 MixServer 对 HEAD 方法的限制，**不影响浏览器行为**——浏览器发送的是 GET 请求。

## WMS 服务元数据（从 GetCapabilities 提取）

| 属性 | 值 |
|------|-----|
| 服务版本 | WMS 1.1.1 |
| 标题 | dom202605y2m18level_wms |
| 提供方 | 成都陆拓信息技术有限公司 |
| 图层名 | 0 |
| 图层标题 | dom202605y2m18level |
| 坐标系 | EPSG:4490 |
| 经度范围 | 113.4516 ~ 115.4990 |
| 纬度范围 | 36.0421 ~ 37.0222 |
| 支持格式 | image/png, image/bmp, image/jpeg, image/gif |

## CORS 状态：✅ PASS

服务端已正确配置 CORS，支持：
- 反射任意 Origin（`Access-Control-Allow-Origin` 与请求 Origin 一致）
- 凭据传递（`Access-Control-Allow-Credentials: true`）
- 预检缓存 3600 秒
- 支持 GET/POST/PUT/DELETE/PATCH 方法

## 注意事项

1. **HEAD 方法被拒**：MixServer 对带 Origin 的 HEAD 请求返回 403，但 GET 请求正常。浏览器端不受影响。
2. **Origin 反射机制**：服务端反射任意 Origin，安全性较低但对内部 WMS 服务可接受。
3. **file:// 协议支持**：OPTIONS 预检对 `file://` 源也返回 CORS 头，但浏览器对 `file://` 源的 CORS 行为因实现而异——WebView2 桌面应用需要实际验证。

## 建议

**可以直接进入开发阶段。** 无需代理服务器或服务器端配置变更。

对于桌面宿主环境（WebView2/WPS），建议：
1. 优先使用 `http://localhost` 或 `http://127.0.0.1` 作为宿主页面源（通过本地 HTTP 服务加载 HTML）
2. 如果使用 `file://` 协议直接打开 HTML，需在 WebView2 中验证 CORS 是否生效
3. 备选方案：本地起一个轻量 HTTP 服务（如 `python -m http.server`）加载插件页面
