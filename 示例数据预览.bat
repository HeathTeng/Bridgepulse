@echo off
chcp 65001 >nul
rem 用示例数据打开桌面小工具，不需要 WHOOP 账号
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo 第一次使用：请先在本文件夹打开 PowerShell，运行 npm install
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo 第一次打开，正在下载桌面窗口组件（约 100MB，只需一次）...
  node node_modules\electron\install.js
  if errorlevel 1 (
    echo 下载失败，请检查网络后再试。
    pause
    exit /b 1
  )
)
start "" "node_modules\electron\dist\electron.exe" . --demo
