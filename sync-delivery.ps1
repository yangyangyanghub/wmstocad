# sync-delivery.ps1 - 交付目录同步脚本
# 发布时把根级源码同步到 WmsMapPlugin\ 交付副本:
#   shared\                      -> WmsMapPlugin\shared\
#   wps\                         -> WmsMapPlugin\wps\
#   autocad\WmsMapPlugin.bundle\ -> WmsMapPlugin\autocad\WmsMapPlugin.bundle\
# 支持 -WhatIf 预览（只报告将执行的操作，不实际改动）
# 退出码: 0 正常 / 1 同步过程中出错

[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WMS 地图插件 交付目录同步" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($WhatIfPreference) {
  Write-Host "[WhatIf 模式] 仅预览，不会实际修改文件" -ForegroundColor Yellow
  Write-Host ""
}

$repoRoot = $PSScriptRoot
$deliveryRoot = Join-Path $repoRoot "WmsMapPlugin"

# 源目录 -> 交付副本 映射
$syncPairs = @(
  @{
    Name   = "shared"
    Source = Join-Path $repoRoot "shared"
    Target = Join-Path $deliveryRoot "shared"
  },
  @{
    Name   = "wps"
    Source = Join-Path $repoRoot "wps"
    Target = Join-Path $deliveryRoot "wps"
  },
  @{
    Name   = "autocad bundle"
    Source = Join-Path $repoRoot "autocad" "WmsMapPlugin.bundle"
    Target = Join-Path $deliveryRoot "autocad" "WmsMapPlugin.bundle"
  }
)

function Get-FileCount([string]$path) {
  if (-not (Test-Path $path)) { return 0 }
  return @(Get-ChildItem -LiteralPath $path -Recurse -File).Count
}

$hasError = $false

foreach ($pair in $syncPairs) {
  Write-Host "[$($pair.Name)]" -ForegroundColor Yellow

  if (-not (Test-Path $pair.Source)) {
    Write-Host "  警告: 源目录不存在，跳过: $($pair.Source)" -ForegroundColor Yellow
    if ($pair.Name -eq "autocad bundle") {
      Write-Host "  提示: 请先运行 dotnet build autocad/WmsMapPlugin.sln" -ForegroundColor Yellow
      # 交付包缺核心编译产物属于打包错误，必须硬失败，不能静默带旧包发布
      $hasError = $true
    }
    Write-Host ""
    continue
  }

  $sourceCount = Get-FileCount $pair.Source
  $targetCount = Get-FileCount $pair.Target
  $diff = $sourceCount - $targetCount
  $diffText = if ($diff -gt 0) { "+$diff" } else { "$diff" }
  Write-Host "  源文件数: $sourceCount  副本文件数: $targetCount  差异: $diffText" -ForegroundColor Cyan

  try {
    # 镜像同步: 先删副本再整体拷贝，保证无残留旧文件
    if (Test-Path $pair.Target) {
      if ($PSCmdlet.ShouldProcess($pair.Target, "删除旧副本")) {
        Remove-Item -LiteralPath $pair.Target -Recurse -Force
      }
    }
    if ($PSCmdlet.ShouldProcess($pair.Target, "拷贝新副本")) {
      $targetParent = Split-Path $pair.Target -Parent
      if (-not (Test-Path $targetParent)) {
        New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
      }
      Copy-Item -LiteralPath $pair.Source -Destination $pair.Target -Recurse
    }

    if ($WhatIfPreference) {
      Write-Host "  [WhatIf] 将删除并重新拷贝: $($pair.Target)" -ForegroundColor Yellow
    } else {
      $newCount = Get-FileCount $pair.Target
      if ($newCount -eq $sourceCount) {
        Write-Host "  同步完成，副本文件数: $newCount" -ForegroundColor Green
      } else {
        Write-Host "  错误: 同步后文件数不一致 (源 $sourceCount / 副本 $newCount)" -ForegroundColor Red
        $hasError = $true
      }
    }
  } catch {
    Write-Host "  错误: 同步失败: $($_.Exception.Message)" -ForegroundColor Red
    $hasError = $true
  }

  Write-Host ""
}

# ========================================
# AutoCAD 源码文件同步（交付副本保留源码副本，需与根级保持一致）
# ========================================
Write-Host "[autocad source]" -ForegroundColor Yellow
$autocadSourceFiles = @(
  "autocad\WmsMapCommand.cs",
  "autocad\WmsPanel.cs",
  "autocad\WmsBridge.cs",
  "autocad\WmsImageInserter.cs",
  "autocad\MapBackgroundManager.cs",
  "autocad\Logger.cs",
  "autocad\WmsMapPlugin.csproj",
  "autocad\WmsMapPlugin.sln"
)
foreach ($relPath in $autocadSourceFiles) {
  $srcFile = Join-Path $repoRoot $relPath
  $dstFile = Join-Path $deliveryRoot $relPath
  if (Test-Path $srcFile) {
    if ($PSCmdlet.ShouldProcess($dstFile, "拷贝 $relPath")) {
      Copy-Item -LiteralPath $srcFile -Destination $dstFile -Force
    }
    if ($WhatIfPreference) {
      Write-Host "  [WhatIf] 将拷贝: $relPath" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  警告: 源码文件不存在，跳过: $relPath" -ForegroundColor Yellow
  }
}
Write-Host ""

if ($hasError) {
  Write-Host "同步完成，但存在错误，请检查上方输出。" -ForegroundColor Red
  exit 1
}

Write-Host "同步完成!" -ForegroundColor Green
exit 0
