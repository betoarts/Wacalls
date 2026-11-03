@echo off
chcp 65001 >nul
title WaCalls Chat - Reiniciar Servidor
cd /d "%~dp0"

echo ==============================================================================
echo                        WaCalls Chat — Reiniciar Servidor
echo ==============================================================================
echo.

call "%~dp0parar.bat"
ping -n 2 127.0.0.1 >nul
call "%~dp0iniciar.bat"