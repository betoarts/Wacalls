#Requires -Version 5.1
<#
.SYNOPSIS
    Script de Backup Completo do WaCalls Chat (Banco de dados SQLite + Midias).
#>

[CmdletBinding()]
param(
    [string]$OutputDir = "backups",
    [switch]$NoMedia
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                      WaCalls Chat - Backup de Dados" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

$targetDir = Join-Path $ScriptDir $OutputDir
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$zipPath = Join-Path $targetDir "wacalls_backup_$timestamp.zip"
$tempFolder = Join-Path $env:TEMP "wacalls_bkp_$timestamp"

New-Item -ItemType Directory -Path $tempFolder -Force | Out-Null

try {
    # 1. Copiando banco de dados SQLite
    Write-Host "[1/3] " -NoNewline -ForegroundColor Cyan
    Write-Host "Copiando banco de dados SQLite..."
    $dbPath = Join-Path $ScriptDir "wacalls.db"
    $tempDbPath = Join-Path $tempFolder "wacalls.db"

    if (Test-Path $dbPath) {
        Copy-Item $dbPath $tempDbPath -Force
        $walPath = Join-Path $ScriptDir "wacalls.db-wal"
        if (Test-Path $walPath) {
            Copy-Item $walPath (Join-Path $tempFolder "wacalls.db-wal") -Force
        }
        $shmPath = Join-Path $ScriptDir "wacalls.db-shm"
        if (Test-Path $shmPath) {
            Copy-Item $shmPath (Join-Path $tempFolder "wacalls.db-shm") -Force
        }
        Write-Host "      [OK] Banco de dados copiado com sucesso." -ForegroundColor Green
    } else {
        Write-Host "      [AVISO] 'wacalls.db' nao encontrado." -ForegroundColor Yellow
    }

    # 2. Copiando arquivos de midia
    Write-Host "[2/3] " -NoNewline -ForegroundColor Cyan
    Write-Host "Coletando midias e arquivos de configuracao..."
    if (-not $NoMedia) {
        $mediaDir = Join-Path $ScriptDir "media"
        if (Test-Path $mediaDir) {
            $destMedia = Join-Path $tempFolder "media"
            Copy-Item $mediaDir $destMedia -Recurse -Force
            $mediaCount = (Get-ChildItem -Path $destMedia -Recurse -File).Count
            Write-Host "      [OK] $mediaCount arquivos de midia copiados." -ForegroundColor Green
        }
    }

    $envPath = Join-Path $ScriptDir ".env"
    if (Test-Path $envPath) {
        Copy-Item $envPath (Join-Path $tempFolder ".env.backup") -Force
    }

    # 3. Compactando arquivo ZIP
    Write-Host "[3/3] " -NoNewline -ForegroundColor Cyan
    Write-Host "Compactando arquivo ZIP final..."
    Compress-Archive -Path "$tempFolder\*" -DestinationPath $zipPath -CompressionLevel Optimal -Force

    $fileSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

    Write-Host ""
    Write-Host "==============================================================================" -ForegroundColor Green
    Write-Host "  [SUCESSO] Backup gerado com sucesso!" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
    Write-Host "  Arquivo: $zipPath" -ForegroundColor White
    Write-Host "  Tamanho: $fileSizeMB MB" -ForegroundColor Gray
    Write-Host ""
}
finally {
    if (Test-Path $tempFolder) {
        Remove-Item -Path $tempFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
}
