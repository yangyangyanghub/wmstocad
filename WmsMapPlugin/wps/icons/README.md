# WPS 插件图标文件

Ribbon 按钮引用的本地图标文件需放置在此目录下。

## 所需图标

| 文件名 | 用途 | 建议尺寸 | 格式 |
|--------|------|----------|------|
| `open-map.png` | 打开地图按钮 | 32x32 px | PNG (透明背景) |
| `insert-map.png` | 插入地图按钮 | 32x32 px | PNG (透明背景) |
| `refresh.png` | 刷新配置按钮 | 16x16 px | PNG (透明背景) |

## 规格要求

- **大按钮** (`size="large"`)：建议 32x32 像素，96 DPI
- **小按钮** (`size="normal"`)：建议 16x16 像素，96 DPI
- 格式：PNG，支持透明通道
- 命名：与 ribbon.xml 中 `image` 属性值一致

## 备选方案

如果暂无本地图标文件，可将 ribbon.xml 中的 `image="icons/xxx.png"` 替换为 `imageMso="内置图标名"`，使用 WPS/Office 内置图标。

常用内置图标：
- `MapPin` - 地图标记
- `PictureInsert` - 插入图片
- `Refresh` - 刷新
- `Info` - 信息
