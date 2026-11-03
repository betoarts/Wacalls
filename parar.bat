@echo off
chcp 65001 >nul
title WaCalls Chat - Parar Servidor
cd /d "%~dp0"

echo ==============================================================================
echo                         WaCalls Chat — Parar Servidor
echo ==============================================================================
echo.

tasklist /FI "IMAGENAME eq wacalls.exe" 2>nul | find /I /N "wacalls.exe" >nul
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Finalizando processos do wacalls.exe...
    taskkill /IM wacalls.exe /F /T >nul 2>&1
    echo [OK] Servidor WaCalls finalizado com sucesso!
) else (
    echo [INFO] O servidor WaCalls nao esta em execucao.
)

ping -n 3 127.0.0.1 >nul
exit /b 0