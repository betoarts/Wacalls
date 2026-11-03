@echo off
chcp 65001 >nul
title WaCalls Chat - Status do Servidor
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador.ps1" -Action Status
echo.
pause