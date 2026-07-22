# uninstall.ps1 - WMS 地图插件卸载脚本
# 卸载 AutoCAD 和 WPS 插件
# 安全约定: 不带 -Force 时仅列出将删除的路径并退出(exit 0)，不执行删除

param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WMS 地图插件 v1.0.0 卸载程序" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$appPluginsDir = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins"
$targetBundle = Join-Path $appPluginsDir "WmsMapPlugin.bundle"
$wpsPluginDir = Join-Path $env:APPDATA "Kingsoft\wps\addons\pool\win-i386\wms-plugin"

# 汇总将删除的路径
$pathsToRemove = @()
if (Test-Path $targetBundle) { $pathsToRemove += $targetBundle }
if (Test-Path $wpsPluginDir) { $pathsToRemove += $wpsPluginDir }

# 无 -Force: 仅提示，不删除
if (-not $Force) {
  if ($pathsToRemove.Count -eq 0) {
    Write-Host "插件未安装，无需卸载" -ForegroundColor Yellow
  } else {
    Write-Host "以下路径将被删除:" -ForegroundColor Yellow
    foreach ($p in $pathsToRemove) {
      Write-Host "  $p" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "未执行删除。请确认后加 -Force 参数重试:" -ForegroundColor White
    Write-Host "  .\uninstall.ps1 -Force" -ForegroundColor White
  }
  exit 0
}

# ========================================
# AutoCAD 插件卸载
# ========================================
Write-Host "[1/2] 卸载 AutoCAD 插件..." -ForegroundColor Yellow

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

exit 0
