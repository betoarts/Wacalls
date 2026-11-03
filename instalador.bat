@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title WaCalls Chat - Instalador para Windows

:: Muda para o diretÃ³rio onde o script estÃ¡ localizado
cd /d "%~dp0"

echo ==============================================================================
echo                      WaCalls Chat â€” Instalador para Windows
echo ==============================================================================
echo.

:: Verifica se o PowerShell estÃ¡ disponÃ­vel
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERRO] PowerShell nao foi encontrado no sistema.
    echo O instalador requer o Windows PowerShell 5.1 ou superior.
    pause
    exit /b 1
)

:: Executa o script PowerShell com bypass de polÃ­tica de execuÃ§Ã£o
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalador.ps1" %*
set SCRIPT_EXIT_CODE=%ERRORLEVEL%

if %SCRIPT_EXIT_CODE% neq 0 (
    echo.
    echo [AVISO] O instalador encerrou com codigo %SCRIPT_EXIT_CODE%.
    echo Se ocorreu algum erro, verifique as mensagens acima.
    echo.
    pause
)

exit /b %SCRIPT_EXIT_CODE%
