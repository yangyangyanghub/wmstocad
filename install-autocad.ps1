# install-autocad.ps1 - WMS 地图插件安装脚本
# 将 WmsMapPlugin.bundle 部署到 AutoCAD 插件目录

param(
  [string]$AutoCADVersion = "2023",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# AutoCAD 插件安装目录
$appPluginsDir = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins"
$bundleName = "WmsMapPlugin.bundle"
$sourceBundle = Join-Path $PSScriptRoot "autocad" $bundleName
$targetBundle = Join-Path $appPluginsDir $bundleName

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WMS Map Plugin 安装脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 卸载模式
if ($Uninstall) {
  Write-Host "[卸载模式]" -ForegroundColor Yellow
  if (Test-Path $targetBundle) {
    Remove-Item -LiteralPath $targetBundle -Recurse -Force
    Write-Host "已删除: $targetBundle" -ForegroundColor Green
  } else {
    Write-Host "插件未安装，无需卸载" -ForegroundColor Yellow
  }
  exit 0
}

# 检查源文件
if (-not (Test-Path $sourceBundle)) {
  Write-Host "错误: 找不到插件包: $sourceBundle" -ForegroundColor Red
  Write-Host "请先运行 dotnet build 编译项目" -ForegroundColor Yellow
  exit 1
}

# 检查 DLL 是否已编译
$dllPath = Join-Path $sourceBundle "Contents" "WmsMapPlugin.dll"
if (-not (Test-Path $dllPath)) {
  Write-Host "错误: 找不到编译产物: $dllPath" -ForegroundColor Red
  Write-Host "请先运行 dotnet build 编译项目" -ForegroundColor Yellow
  exit 1
}

# 创建目标目录
if (-not (Test-Path $appPluginsDir)) {
  Write-Host "创建插件目录: $appPluginsDir" -ForegroundColor Yellow
  New-Item -ItemType Directory -Path $appPluginsDir -Force | Out-Null
}

# 删除旧版本
if (Test-Path $targetBundle) {
  Write-Host "删除旧版本..." -ForegroundColor Yellow
  Remove-Item -LiteralPath $targetBundle -Recurse -Force
}

# 拷贝插件包
Write-Host "安装插件..." -ForegroundColor Green
Copy-Item -LiteralPath $sourceBundle -Destination $targetBundle -Recurse

# 拷贝 shared 目录到插件安装目录（供 layers.json 和 map.html 使用）
$sharedSource = Join-Path $PSScriptRoot "shared"
$sharedTarget = Join-Path $targetBundle "Contents" "shared"
if (Test-Path $sharedSource) {
  if (Test-Path $sharedTarget) {
    Remove-Item -LiteralPath $sharedTarget -Recurse -Force
  }
  Copy-Item -LiteralPath $sharedSource -Destination $sharedTarget -Recurse
  Write-Host "已拷贝 shared 目录" -ForegroundColor Green
}

Write-Host ""
Write-Host "安装完成!" -ForegroundColor Green
Write-Host "安装位置: $targetBundle" -ForegroundColor Cyan
Write-Host ""
Write-Host "使用方法:" -ForegroundColor White
Write-Host "  1. 重启 AutoCAD" -ForegroundColor White
Write-Host "  2. 在命令行输入 WMSMAP 打开地图面板" -ForegroundColor White
Write-Host ""
Write-Host "卸载方法:" -ForegroundColor White
Write-Host "  .\install-autocad.ps1 -Uninstall" -ForegroundColor White
