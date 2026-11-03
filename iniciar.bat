@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title WaCalls Chat - Servidor
cd /d "%~dp0"

echo ==============================================================================
echo                         WaCalls Chat — Iniciar Servidor
echo ==============================================================================
echo.

:: Detectar porta configurada no .env ou padrao 8080
set "APP_PORT=8080"
if exist ".env" (
    for /f "usebackq eol=# tokens=1,2 delims==" %%A in (".env") do (
        if "%%A"=="PORT" set "APP_PORT=%%B"
        if "%%A"=="WACALLS_ADDR" (
            set "ADDR=%%B"
            set "ADDR=!ADDR::=!"
            if not "!ADDR!"=="" set "APP_PORT=!ADDR!"
        )
    )
)

:: Verifica se wacalls.exe ja esta em execucao
tasklist /FI "IMAGENAME eq wacalls.exe" 2>nul | find /I /N "wacalls.exe" >nul
if "%ERRORLEVEL%"=="0" (
    echo [INFO] O servidor WaCalls ja esta rodando na porta %APP_PORT%!
    echo [INFO] Abrindo navegador em http://localhost:%APP_PORT% ...
    start http://localhost:%APP_PORT%
    ping -n 3 127.0.0.1 >nul
    exit /b 0
)

:: Verifica se o executavel existe
if not exist "wacalls.exe" (
    echo [ERRO] O executavel 'wacalls.exe' nao foi encontrado!
    echo Execute 'instalador.bat' para compilar a aplicacao primeiro.
    echo.
    pause
    exit /b 1
)

:: Verifica se a pasta dist existe
if not exist "dist\index.html" (
    echo [AVISO] 'dist\index.html' nao foi encontrado!
    echo O frontend SPA precisa ser compilado para o painel funcionar corretamente.
)

echo [INFO] Iniciando WaCalls na porta %APP_PORT%...
start "WaCalls Server" /min "%~dp0wacalls.exe"

:: Aguarda 2 segundos para o processo inicializar
ping -n 3 127.0.0.1 >nul

:: Abre o navegador
echo [INFO] Servidor iniciado com sucesso!
echo [INFO] Abrindo navegador em http://localhost:%APP_PORT% ...
start http://localhost:%APP_PORT%

echo.
echo ==============================================================================
echo  WaCalls rodando com sucesso!
echo  URL:              http://localhost:%APP_PORT%
echo  Login padrao:     wacalls@admin.com
echo  Senha padrao:     admin
echo.
echo  Para parar o servidor, execute: parar.bat
echo ==============================================================================
ping -n 4 127.0.0.1 >nul
exit /b 0