# install.ps1 - WMS 地图插件一键安装脚本
# 统一入口：WmsMapPlugin\install.ps1（根级 install-autocad.ps1 为薄包装，转发到本脚本）
# 同时安装 AutoCAD 和 WPS 插件
#
# 退出码约定:
#   0 - 正常结束（含"未检测到运行环境，警告跳过"的情况）
#   1 - 硬失败（已检测到运行环境，但缺少编译产物 / bundle 源目录，或运行时错误）
#   2 - 参数错误（约定值；pwsh 对未知参数的绑定失败会以非零退出）

param(
  [switch]$SkipAutoCAD,
  [switch]$SkipWPS
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WMS 地图插件 v1.0.0 安装程序" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$installRoot = $PSScriptRoot
$sharedSource = Join-Path $installRoot "shared"

# ========================================
# AutoCAD 插件安装
# ========================================
if (-not $SkipAutoCAD) {
  Write-Host "[1/2] 安装 AutoCAD 插件..." -ForegroundColor Yellow

  $appPluginsDir = Join-Path $env:APPDATA "Autodesk\ApplicationPlugins"
  $bundleName = "WmsMapPlugin.bundle"
  $sourceBundle = Join-Path $installRoot "autocad" $bundleName
  $targetBundle = Join-Path $appPluginsDir $bundleName

  # 检查 AutoCAD 是否安装
  $autodeskDir = Join-Path $env:APPDATA "Autodesk"
  if (-not (Test-Path $autodeskDir)) {
    Write-Host "  警告: 未检测到 AutoCAD 安装，跳过 AutoCAD 插件安装" -ForegroundColor Yellow
  } elseif (-not (Test-Path $sourceBundle)) {
    # 已检测到 AutoCAD 环境但缺 bundle 源目录，属打包/同步缺失，硬失败
    Write-Host "  错误: 已检测到 AutoCAD 环境，但找不到插件包: $sourceBundle" -ForegroundColor Red
    Write-Host "  请先编译 AutoCAD 项目: dotnet build autocad/WmsMapPlugin.sln" -ForegroundColor Yellow
    Write-Host "  或先运行 sync-delivery.ps1 同步交付目录" -ForegroundColor Yellow
    exit 1
  } else {
    # 检查 DLL 是否已编译
    $dllPath = Join-Path $sourceBundle "Contents" "WmsMapPlugin.dll"
    if (-not (Test-Path $dllPath)) {
      Write-Host "  错误: 已检测到 AutoCAD 环境，但找不到编译产物: $dllPath" -ForegroundColor Red
      Write-Host "  请先运行: dotnet build autocad/WmsMapPlugin.sln" -ForegroundColor Yellow
      exit 1
    }

    # 创建目标目录
    if (-not (Test-Path $appPluginsDir)) {
      New-Item -ItemType Directory -Path $appPluginsDir -Force | Out-Null
    }

    # 删除旧版本
    if (Test-Path $targetBundle) {
      Write-Host "  删除旧版本..." -ForegroundColor Yellow
      Remove-Item -LiteralPath $targetBundle -Recurse -Force
    }

    # 拷贝插件包
    Copy-Item -LiteralPath $sourceBundle -Destination $targetBundle -Recurse

    # 拷贝 shared 目录
    $sharedTarget = Join-Path $targetBundle "Contents" "shared"
    if (Test-Path $sharedSource) {
      if (Test-Path $sharedTarget) {
        Remove-Item -LiteralPath $sharedTarget -Recurse -Force
      }
      Copy-Item -LiteralPath $sharedSource -Destination $sharedTarget -Recurse
    }

    Write-Host "  AutoCAD 插件安装成功!" -ForegroundColor Green
    Write-Host "  安装位置: $targetBundle" -ForegroundColor Cyan
  }
} else {
  Write-Host "[1/2] 跳过 AutoCAD 插件安装" -ForegroundColor Yellow
}

Write-Host ""

# ========================================
# WPS 插件安装
# ========================================
if (-not $SkipWPS) {
  Write-Host "[2/2] 安装 WPS 插件..." -ForegroundColor Yellow

  $wpsPluginDir = Join-Path $env:APPDATA "Kingsoft\wps\addons\pool\win-i386\wms-plugin"
  $wpsSource = Join-Path $installRoot "wps"

  # 检查 WPS 是否安装
  $wpsDir = Join-Path $env:APPDATA "Kingsoft"
  if (-not (Test-Path $wpsDir)) {
    Write-Host "  警告: 未检测到 WPS 安装，跳过 WPS 插件安装" -ForegroundColor Yellow
  } elseif (-not (Test-Path $wpsSource)) {
    # 已检测到 WPS 环境但缺插件源目录，属打包/同步缺失，硬失败
    Write-Host "  错误: 已检测到 WPS 环境，但找不到插件目录: $wpsSource" -ForegroundColor Red
    Write-Host "  请先运行 sync-delivery.ps1 同步交付目录" -ForegroundColor Yellow
    exit 1
  } else {
    # 创建目标目录
    if (-not (Test-Path $wpsPluginDir)) {
      New-Item -ItemType Directory -Path $wpsPluginDir -Force | Out-Null
    }

    # 删除旧版本
    if (Test-Path $wpsPluginDir) {
      Write-Host "  删除旧版本..." -ForegroundColor Yellow
      Remove-Item -LiteralPath $wpsPluginDir -Recurse -Force
      New-Item -ItemType Directory -Path $wpsPluginDir -Force | Out-Null
    }

    # 拷贝 WPS 插件文件
    Copy-Item -LiteralPath $wpsSource -Destination $wpsPluginDir -Recurse

    # 拷贝 shared 目录
    $sharedWpsTarget = Join-Path $wpsPluginDir "shared"
    if (Test-Path $sharedSource) {
      Copy-Item -LiteralPath $sharedSource -Destination $sharedWpsTarget -Recurse
    }

    Write-Host "  WPS 插件安装成功!" -ForegroundColor Green
    Write-Host "  安装位置: $wpsPluginDir" -ForegroundColor Cyan
  }
} else {
  Write-Host "[2/2] 跳过 WPS 插件安装" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 安装完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "使用方法:" -ForegroundColor White
Write-Host "  AutoCAD: 重启后输入 WMSMAP 命令" -ForegroundColor White
Write-Host "  WPS PPT: 重启后在 Ribbon 菜单找到 'WMS地图' 选项卡" -ForegroundColor White
Write-Host ""
Write-Host "卸载方法:" -ForegroundColor White
Write-Host "  .\uninstall.ps1 -Force" -ForegroundColor White

exit 0
