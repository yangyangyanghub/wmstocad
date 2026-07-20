# uninstall.ps1 - WMS 地图插件卸载脚本
# 卸载 AutoCAD 和 WPS 插件

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WMS 地图插件 v1.0.0 卸载程序" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# AutoCAD 插件卸载
# ========================================
Write-Host "[1/2] 卸载 AutoCAD 插件..." -ForegroundColor Yellow

$appPluginsDir = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins"
$targetBundle = Join-Path $appPluginsDir "WmsMapPlugin.bundle"

if (Test-Path $targetBundle) {
  Remove-Item -LiteralPath $targetBundle -Recurse -Force
  Write-Host "  已删除: $targetBundle" -ForegroundColor Green
} else {
  Write-Host "  AutoCAD 插件未安装，跳过" -ForegroundColor Yellow
}

Write-Host ""

# ========================================
# WPS 插件卸载
# ========================================
Write-Host "[2/2] 卸载 WPS 插件..." -ForegroundColor Yellow

$wpsPluginDir = Join-Path $env:APPDATA "Kingsoft\wps\addons\pool\win-i386\wms-plugin"

if (Test-Path $wpsPluginDir) {
  Remove-Item -LiteralPath $wpsPluginDir -Recurse -Force
  Write-Host "  已删除: $wpsPluginDir" -ForegroundColor Green
} else {
  Write-Host "  WPS 插件未安装，跳过" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 卸载完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请重启 AutoCAD 和 WPS 以完成卸载。" -ForegroundColor White
