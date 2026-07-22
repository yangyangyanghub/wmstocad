@echo off
REM install-autocad.bat - WMS 地图插件安装脚本（BAT 包装）
REM 薄包装，转发到 WmsMapPlugin\install.ps1（统一入口）
REM 不在结尾 pause，避免阻塞自动化调用

echo ========================================
echo  WMS Map Plugin 安装脚本
echo ========================================
echo.

REM 检查 PowerShell 是否可用
where pwsh >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo 错误: 未找到 PowerShell 7+，请安装后重试
  echo 下载地址: https://github.com/PowerShell/PowerShell/releases
  exit /b 1
)

REM 检查参数（uninstall 转发 -Uninstall，其余参数原样转发）
if "%1"=="uninstall" (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autocad.ps1" -Uninstall %2 %3
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autocad.ps1" %*
)

exit /b %ERRORLEVEL%
