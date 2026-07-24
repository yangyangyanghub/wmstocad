@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM  WMS 地图插件 - 一键安装
REM  双击运行即可，无需安装 PowerShell 或其他依赖
REM ============================================================

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     WMS 地图插件 一键安装            ║
echo  ╚══════════════════════════════════════╝
echo.

REM ---- 定位插件包 ----
set "SOURCE=%~dp0WmsMapPlugin\autocad\WmsMapPlugin.bundle"
set "TARGET=%APPDATA%\Autodesk\ApplicationPlugins\WmsMapPlugin.bundle"

if not exist "%SOURCE%\Contents\WmsMapPlugin.dll" (
  echo  [错误] 未找到编译产物: %SOURCE%\Contents\WmsMapPlugin.dll
  echo.
  echo  请先编译: dotnet build autocad\WmsMapPlugin.sln
  echo  或确认下载的是完整发布包
  echo.
  pause
  exit /b 1
)

REM ---- 检查 AutoCAD 环境 ----
if not exist "%APPDATA%\Autodesk" (
  echo  [警告] 未检测到 AutoCAD 用户数据目录
  echo         将尝试安装，但可能需要先启动过一次 AutoCAD
  echo.
)

REM ---- 删除旧版本 ----
if exist "%TARGET%" (
  echo  [1/2] 删除旧版本...
  rmdir /s /q "%TARGET%" 2>nul
)

REM ---- 拷贝插件包 ----
echo  [2/2] 安装插件...
xcopy "%SOURCE%" "%TARGET%\" /E /I /Q /Y >nul
if %ERRORLEVEL% neq 0 (
  echo  [错误] 安装失败，请检查文件权限
  pause
  exit /b 1
)

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     安装成功！                       ║
echo  ╚══════════════════════════════════════╝
echo.
echo  安装位置: %TARGET%
echo.
echo  使用方法:
echo    1. 启动 AutoCAD（或重启已打开的 AutoCAD）
echo    2. 在命令行输入 WMSMAP 回车
echo    3. 在弹出的面板中设置投影、添加图层
echo.
pause
