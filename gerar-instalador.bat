@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title WaCalls Chat - Gerador de Instalador Windows (.exe)
cd /d "%~dp0"

echo ==============================================================================
echo              WaCalls Chat - Compilador do Instalador Windows (.exe)
echo ==============================================================================
echo.

:: 1. Localizar compilador do Inno Setup (ISCC.exe)
set "ISCC_PATH="
where iscc >nul 2>nul
if !ERRORLEVEL! equ 0 (
    set "ISCC_PATH=iscc"
) else if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
) else if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
    set "ISCC_PATH=%ProgramFiles%\Inno Setup 6\ISCC.exe"
)

if "%ISCC_PATH%"=="" (
    echo [AVISO] Inno Setup nao encontrado. Tentando instalar via winget...
    winget install --id JRSoftware.InnoSetup -e --silent --accept-package-agreements --accept-source-agreements
    if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" (
        set "ISCC_PATH=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
    ) else if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
        set "ISCC_PATH=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
    ) else (
        echo [ERRO] Falha ao encontrar o Inno Setup 6.
        echo Baixe e instale manualmente de: https://jrsoftware.org/isdl.php
        pause
        exit /b 1
    )
)
echo [OK] Compilador Inno Setup localizado: "%ISCC_PATH%"

:: 2. Verificar ou gerar icone app.ico
if not exist "assets\app.ico" (
    echo [INFO] Gerando assets\app.ico a partir de client\public\favicon.png...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Drawing; $bmp = [System.Drawing.Bitmap]::FromFile('client\public\favicon.png'); $thumb = New-Object System.Drawing.Bitmap($bmp, 256, 256); $h = $thumb.GetHicon(); $icon = [System.Drawing.Icon]::FromHandle($h); $fs = New-Object System.IO.FileStream('assets\app.ico', [System.IO.FileMode]::Create); $icon.Save($fs); $fs.Close(); $icon.Dispose(); $thumb.Dispose(); $bmp.Dispose();"
)
if exist "assets\app.ico" (
    echo [OK] Icone 'assets\app.ico' pronto.
) else (
    echo [ERRO] Nao foi possivel gerar assets\app.ico.
    pause
    exit /b 1
)

:: 3. Compilar Frontend (React / Vite)
echo.
echo [1/3] Compilando Frontend (React SPA)...
if not exist "client\package.json" (
    echo [ERRO] Diretorio 'client' nao encontrado!
    pause
    exit /b 1
)

pushd client
call npm run build
set "BUILD_EXIT=!ERRORLEVEL!"
popd

if !BUILD_EXIT! neq 0 (
    echo [ERRO] Falha ao compilar o frontend!
    pause
    exit /b 1
)
echo [OK] Frontend compilado na pasta 'dist\'.

:: 4. Compilar Backend (Go)
echo.
echo [2/3] Compilando Backend Go (wacalls.exe)...
go build -ldflags="-s -w" -o wacalls.exe ./cmd/server
if !ERRORLEVEL! neq 0 (
    echo [ERRO] Falha ao compilar o backend Go!
    pause
    exit /b 1
)
echo [OK] Executavel 'wacalls.exe' compilado com sucesso!

:: 5. Empacotar Instalador com Inno Setup
echo.
echo [3/3] Criando pacote do instalador Windows com Inno Setup...
if not exist "dist-installer" mkdir "dist-installer"

"%ISCC_PATH%" wacalls.iss
if !ERRORLEVEL! neq 0 (
    echo [ERRO] Falha ao gerar o instalador!
    pause
    exit /b 1
)

echo.
echo ==============================================================================
echo [SUCESSO] Instalador gerado com sucesso!
echo ==============================================================================
echo.
dir /B "dist-installer\*.exe"
echo.
echo O instalador esta pronto na pasta: dist-installer\
echo Pode enviar este arquivo .exe diretamente para seus clientes.
echo.
pause
