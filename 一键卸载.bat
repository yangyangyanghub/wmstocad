@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM  WMS 地图插件 - 一键卸载
REM  双击运行即可
REM ============================================================

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     WMS 地图插件 一键卸载            ║
echo  ╚══════════════════════════════════════╝
echo.

set "TARGET=%APPDATA%\Autodesk\ApplicationPlugins\WmsMapPlugin.bundle"

if not exist "%TARGET%" (
  echo  未找到已安装的插件，无需卸载
  echo.
  pause
  exit /b 0
)

echo  正在删除: %TARGET%
rmdir /s /q "%TARGET%" 2>nul

if exist "%TARGET%" (
  echo  [错误] 删除失败，请关闭 AutoCAD 后重试
  pause
  exit /b 1
)

echo.
echo  卸载成功！
echo  重启 AutoCAD 后插件将不再加载
echo.
pause
