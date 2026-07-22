@echo off
REM install.bat - WMS 地图插件安装脚本（BAT 包装）
REM 调用统一入口 install.ps1 执行实际安装逻辑
REM 不在结尾 pause，避免阻塞自动化调用

echo ========================================
echo  WMS 地图插件 v1.0.0 安装程序
echo ========================================
echo.

REM 检查 PowerShell 是否可用
where pwsh >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo 错误: 未找到 PowerShell 7+，请安装后重试
  echo 下载地址: https://github.com/PowerShell/PowerShell/releases
  exit /b 1
)

pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

exit /b %ERRORLEVEL%
