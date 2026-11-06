@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title WaCalls Chat - Restaurar Backup
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restaurar.ps1" -ZipFile "%~1"
set "EXIT_CODE=%ERRORLEVEL%"

if "%2"=="" (
    echo.
    pause
)
exit /b %EXIT_CODE%
