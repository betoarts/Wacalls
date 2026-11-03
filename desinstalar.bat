@echo off
chcp 65001 >nul
title WaCalls Chat - Desinstalador
cd /d "%~dp0"

echo ==============================================================================
echo                      WaCalls Chat â€” Desinstalador Windows
echo ==============================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& {
    Write-Host '1. Encerrando processos do WaCalls...' -ForegroundColor Cyan
    Get-Process -Name wacalls -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    Write-Host '2. Removendo Inicializacao Automatica...' -ForegroundColor Cyan
    cmd.exe /c 'schtasks.exe /Delete /TN WaCallsChat /F' 2>`$null
    `$startupLnk = Join-Path ([System.Environment]::GetFolderPath('Startup')) 'WaCalls Chat.lnk'
    if (Test-Path `$startupLnk) { Remove-Item `$startupLnk -Force -ErrorAction SilentlyContinue }

    Write-Host '3. Removendo Atalhos da Area de Trabalho e Menu Iniciar...' -ForegroundColor Cyan
    `$desktopLnk = Join-Path ([System.Environment]::GetFolderPath('Desktop')) 'WaCalls Chat.lnk'
    `$startMenuLnk = Join-Path ([System.Environment]::GetFolderPath('Programs')) 'WaCalls Chat.lnk'
    if (Test-Path `$desktopLnk) { Remove-Item `$desktopLnk -Force -ErrorAction SilentlyContinue }
    if (Test-Path `$startMenuLnk) { Remove-Item `$startMenuLnk -Force -ErrorAction SilentlyContinue }

    Write-Host '4. Deseja remover o banco de dados (wacalls.db) e configuracoes (.env)?' -ForegroundColor Yellow
    `$resp = Read-Host '   Digite S para APAGAR ou N para MANTER os dados (S/N)'
    if (`$resp -match '^[sSyY]') {
        Remove-Item 'wacalls.db*' -Force -ErrorAction SilentlyContinue
        Remove-Item '.env' -Force -ErrorAction SilentlyContinue
        Write-Host '   Banco de dados e .env removidos.' -ForegroundColor Red
    } else {
        Write-Host '   Banco de dados e .env foram preservados.' -ForegroundColor Green
    }

    Write-Host ''
    Write-Host '[OK] Desinstalacao concluida com sucesso!' -ForegroundColor Green
}"

echo.
pause
