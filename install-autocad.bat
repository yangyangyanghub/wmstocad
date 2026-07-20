@echo off
REM install-autocad.bat - WMS 地图插件安装脚本（BAT 包装）
REM 调用 PowerShell 执行实际安装逻辑

echo ========================================
echo  WMS Map Plugin 安装脚本
echo ========================================
echo.

REM 检查 PowerShell 是否可用
where pwsh >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo 错误: 未找到 PowerShell 7+，请安装后重试
  echo 下载地址: https://github.com/PowerShell/PowerShell/releases
  pause
  exit /b 1
)

REM 检查参数
if "%1"=="uninstall" (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autocad.ps1" -Uninstall
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autocad.ps1"
)

echo.
pause
