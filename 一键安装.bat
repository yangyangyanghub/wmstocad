@echo off
echo.
echo ========================================
echo   WMS Map Plugin Install
echo ========================================
echo.

set SOURCE=%~dp0WmsMapPlugin\autocad\WmsMapPlugin.bundle
set SHARED=%~dp0WmsMapPlugin\shared
set TARGET=%APPDATA%\Autodesk\ApplicationPlugins\WmsMapPlugin.bundle

if not exist "%SOURCE%\Contents\WmsMapPlugin.dll" (
  echo [Error] DLL not found: %SOURCE%\Contents\WmsMapPlugin.dll
  pause
  exit /b 1
)

if not exist "%SHARED%\map.html" (
  echo [Error] Frontend not found: %SHARED%\map.html
  pause
  exit /b 1
)

if exist "%TARGET%" (
  echo [1/3] Removing old version...
  rmdir /s /q "%TARGET%" 2>nul
)

echo [2/3] Installing plugin...
xcopy "%SOURCE%" "%TARGET%\" /E /I /Q /Y >nul

echo [3/3] Copying frontend...
xcopy "%SHARED%" "%TARGET%\Contents\shared\" /E /I /Q /Y >nul

echo.
echo ========================================
echo   Install Success!
echo ========================================
echo.
echo Location: %TARGET%
echo.
echo Usage:
echo   1. Start AutoCAD (or restart if open)
echo   2. Type WMSMAP in command line
echo.
pause