@echo off
rem Xuanmen Guishilu - local TRPG launcher
rem Double-click to start. Extra args are passed through, e.g.:
rem   start.bat -Port 9000 -NoBrowser
chcp 65001 >nul
setlocal
title Xuanmen Guishilu :: local service

set "PS=powershell.exe"
where pwsh >nul 2>nul
if %errorlevel%==0 set "PS=pwsh.exe"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 (
    echo.
    echo Startup failed. See the message above.
    pause
)

endlocal
