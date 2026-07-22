# install-autocad.ps1 - WMS 地图插件安装脚本（薄包装）
# 薄包装，转发到 WmsMapPlugin\install.ps1（统一入口）
# 退出码与统一入口一致: 0 正常 / 1 硬失败 / 2 参数错误

param(
  [switch]$Uninstall,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$deliveryDir = Join-Path $PSScriptRoot "WmsMapPlugin"

# 卸载模式：转发到统一卸载脚本（注意：会同时卸载 AutoCAD 和 WPS 插件）
if ($Uninstall) {
  $uninstallScript = Join-Path $deliveryDir "uninstall.ps1"
  if ($Force) {
    & $uninstallScript -Force
  } else {
    & $uninstallScript
  }
  exit $LASTEXITCODE
}

# 安装模式：仅安装 AutoCAD 部分
& (Join-Path $deliveryDir "install.ps1") -SkipWPS
exit $LASTEXITCODE
