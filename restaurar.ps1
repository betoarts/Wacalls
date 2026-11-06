#Requires -Version 5.1
<#
.SYNOPSIS
    Script de Restauracao de Backup do WaCalls Chat.
#>

[CmdletBinding()]
param(
    [string]$ZipFile,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                   WaCalls Chat - Restauracao de Backup" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# Se nenhum arquivo foi informado, procura o backup mais recente em backups\
if (-not $ZipFile) {
    $latest = Get-ChildItem -Path (Join-Path $ScriptDir "backups") -Filter "*.zip" -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) {
        $ZipFile = $latest.FullName
    }
}

if (-not $ZipFile -or -not (Test-Path $ZipFile)) {
    Write-Host "[ERRO] Nenhum arquivo .zip informado ou encontrado em backups\." -ForegroundColor Red
    Write-Host "Uso: .\restaurar.bat ""caminho\para\arquivo.zip""" -ForegroundColor Yellow
    exit 1
}

Write-Host "Arquivo selecionado:" -ForegroundColor White
Write-Host "  $ZipFile" -ForegroundColor Gray
Write-Host ""
Write-Host "[ATENCAO] Esta operacao substituira o banco de dados e as midias atuais." -ForegroundColor Yellow
Write-Host "Uma copia de seguranca preventiva do banco atual sera criada automaticamente." -ForegroundColor Yellow
Write-Host ""

if (-not $Force) {
    $resp = Read-Host "Deseja prosseguir com a restauracao? (S/N)"
    if ($resp -notmatch "^[sSyY]") {
        Write-Host "Operacao cancelada pelo usuario." -ForegroundColor Gray
        exit 0
    }
}

# 1. Finaliza wacalls.exe se estiver rodando
Write-Host "[1/4] " -NoNewline -ForegroundColor Cyan
Write-Host "Verificando processos ativos..."
Stop-Process -Name "wacalls" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

# 2. Copia preventiva
Write-Host "[2/4] " -NoNewline -ForegroundColor Cyan
Write-Host "Criando copia preventiva do banco atual..."
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbPath = Join-Path $ScriptDir "wacalls.db"
if (Test-Path $dbPath) {
    $preRestorePath = Join-Path $ScriptDir "wacalls.db.pre_restore_$timestamp"
    Copy-Item $dbPath $preRestorePath -Force
    Write-Host "      [OK] Copia salva como: wacalls.db.pre_restore_$timestamp" -ForegroundColor Green
}

# 3. Descompacta
Write-Host "[3/4] " -NoNewline -ForegroundColor Cyan
Write-Host "Extraindo conteudo do backup..."
$tempFolder = Join-Path $env:TEMP "wacalls_restore_$timestamp"
New-Item -ItemType Directory -Path $tempFolder -Force | Out-Null

try {
    Expand-Archive -Path $ZipFile -DestinationPath $tempFolder -Force

    # 4. Restaura arquivos
    Write-Host "[4/4] " -NoNewline -ForegroundColor Cyan
    Write-Host "Restaurando banco de dados e midias..."
    $extractedDb = Join-Path $tempFolder "wacalls.db"
    if (Test-Path $extractedDb) {
        Remove-Item (Join-Path $ScriptDir "wacalls.db-wal") -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $ScriptDir "wacalls.db-shm") -Force -ErrorAction SilentlyContinue
        Copy-Item $extractedDb $dbPath -Force
        Write-Host "      [OK] Banco de dados 'wacalls.db' restaurado." -ForegroundColor Green
    } else {
        Write-Host "      [AVISO] 'wacalls.db' nao encontrado no zip." -ForegroundColor Yellow
    }

    $extractedMedia = Join-Path $tempFolder "media"
    if (Test-Path $extractedMedia) {
        $destMedia = Join-Path $ScriptDir "media"
        if (-not (Test-Path $destMedia)) {
            New-Item -ItemType Directory -Path $destMedia -Force | Out-Null
        }
        Copy-Item "$extractedMedia\*" $destMedia -Recurse -Force
        Write-Host "      [OK] Pasta 'media\' restaurada." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "==============================================================================" -ForegroundColor Green
    Write-Host "  [SUCESSO] Restauracao concluida com sucesso!" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
    Write-Host "Voce ja pode iniciar o servidor normalmente (iniciar.bat ou atalho WaCalls)." -ForegroundColor White
    Write-Host ""
}
finally {
    if (Test-Path $tempFolder) {
        Remove-Item -Path $tempFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
}
