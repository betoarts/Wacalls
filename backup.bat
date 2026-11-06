@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title WaCalls Chat - Backup do Sistema
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%1"=="" (
    echo.
    pause
)
exit /b %EXIT_CODE%
