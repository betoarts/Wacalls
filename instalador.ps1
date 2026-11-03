#Requires -Version 5.1
<#
.SYNOPSIS
    Instalador e Gerenciador do WaCalls Chat para Windows.
.DESCRIPTION
    Script completo para instalação, compilação, configuração e gerenciamento
    do WaCalls Chat no Windows (Frontend React + Backend Go + SQLite).
.PARAMETER Action
    Ação a executar: Interactive, FullInstall, BuildOnly, Start, Stop, Status,
    CreateShortcut, AutoStart, RemoveAutoStart, ResetAdmin, FirewallRule.
.PARAMETER Port
    Porta HTTP do servidor (padrão: 8080).
.PARAMETER AdminEmail
    E-mail do administrador padrão (padrão: wacalls@admin.com).
.PARAMETER AdminPassword
    Senha do administrador padrão (padrão: admin).
.PARAMETER DbPath
    Caminho do banco SQLite (padrão: wacalls.db).
.PARAMETER Silent
    Modo silencioso (sem menus interativos).
#>

[CmdletBinding()]
param(
    [ValidateSet("Interactive", "FullInstall", "BuildOnly", "Start", "Stop", "Status", "CreateShortcut", "AutoStart", "RemoveAutoStart", "ResetAdmin", "FirewallRule")]
    [string]$Action = "Interactive",

    [int]$Port = 8080,
    [string]$AdminEmail = "wacalls@admin.com",
    [string]$AdminPassword = "admin",
    [string]$DbPath = "wacalls.db",
    [switch]$Silent
)

# Configura encoding do console para UTF-8
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

# ==============================================================================
# Funções de Logging e Cores
# ==============================================================================
function Log-Info($msg) {
    Write-Host " [INFO]  " -ForegroundColor Cyan -NoNewline
    Write-Host $msg
}

function Log-Ok($msg) {
    Write-Host " [OK]    " -ForegroundColor Green -NoNewline
    Write-Host $msg
}

function Log-Warn($msg) {
    Write-Host " [AVISO] " -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}

function Log-Error($msg) {
    Write-Host " [ERRO]  " -ForegroundColor Red -NoNewline
    Write-Host $msg
}

function Log-Header($title) {
    Write-Host ""
    Write-Host "==============================================================================" -ForegroundColor DarkCyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "==============================================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

function Show-Banner {
    Clear-Host
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "           📞 WaCalls Chat — Instalador para Windows" -ForegroundColor White
    Write-Host "   Plataforma de Atendimento Multicanal, VoIP WebRTC & WhatsApp em Go" -ForegroundColor Gray
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host ""
}

# ==============================================================================
# Verificação de Permissões de Administrador
# ==============================================================================
function Test-IsAdmin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-EnvPath {
    # Atualiza PATH da sessão atual caso novos programas tenham sido instalados via winget/msi
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path    = "$machinePath;$userPath"
}

# ==============================================================================
# Verificação de Pré-requisitos
# ==============================================================================
function Test-CommandExists($cmd) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    return ($null -ne $found)
}

function Get-NpmCommand {
    # No Windows PowerShell, chamar 'npm' invoca 'npm.ps1' que falha se a política
    # de execução estiver restrita. 'npm.cmd' executa diretamente sem erro.
    if (Test-CommandExists "npm.cmd") {
        return "npm.cmd"
    }
    if (Test-CommandExists "npm") {
        return "npm"
    }
    return $null
}

function Check-Prerequisites {
    Log-Header "1. Verificando Pré-requisitos do Sistema"
    Refresh-EnvPath
    $allOk = $true

    # 1. Go
    if (Test-CommandExists "go") {
        $goVer = (go version) -replace "^go version ", ""
        Log-Ok "Go instalado: $goVer"
    } else {
        Log-Warn "Go não encontrado no PATH."
        if (Test-CommandExists "winget") {
            $resp = if ($Silent) { "S" } else { Read-Host "  Deseja instalar o Go automaticamente via winget? (S/N)" }
            if ($resp -match "^[sSyY]") {
                Log-Info "Instalando Go via winget..."
                winget install --id GoLang.Go -e --silent --accept-package-agreements --accept-source-agreements
                Refresh-EnvPath
                if (Test-CommandExists "go") {
                    Log-Ok "Go instalado com sucesso!"
                } else {
                    Log-Error "Falha ao registrar Go no PATH. Baixe e instale manualmente de: https://go.dev/dl/"
                    $allOk = $false
                }
            } else {
                Log-Error "Go é necessário para compilar o backend. Baixe em: https://go.dev/dl/"
                $allOk = $false
            }
        } else {
            Log-Error "Go não encontrado. Baixe e instale em: https://go.dev/dl/"
            $allOk = $false
        }
    }

    # 2. Node.js e NPM
    $npmCmd = Get-NpmCommand
    if ((Test-CommandExists "node") -and ($null -ne $npmCmd)) {
        $nodeVer = node --version
        $npmVer = & $npmCmd --version
        Log-Ok "Node.js instalado: $nodeVer (npm: v$npmVer)"
    } else {
        Log-Warn "Node.js / npm não encontrado."
        if (Test-CommandExists "winget") {
            $resp = if ($Silent) { "S" } else { Read-Host "  Deseja instalar o Node.js LTS via winget? (S/N)" }
            if ($resp -match "^[sSyY]") {
                Log-Info "Instalando Node.js LTS via winget..."
                winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
                Refresh-EnvPath
                $npmCmd = Get-NpmCommand
                if ((Test-CommandExists "node") -and ($null -ne $npmCmd)) {
                    Log-Ok "Node.js e npm instalados com sucesso!"
                } else {
                    Log-Error "Falha ao registrar Node.js. Baixe manualmente em: https://nodejs.org/"
                    $allOk = $false
                }
            } else {
                Log-Error "Node.js é necessário para compilar o frontend SPA. Baixe em: https://nodejs.org/"
                $allOk = $false
            }
        } else {
            Log-Error "Node.js não encontrado. Baixe e instale em: https://nodejs.org/"
            $allOk = $false
        }
    }

    # 3. Git (opcional mas recomendado)
    if (Test-CommandExists "git") {
        $gitVer = git --version
        Log-Ok "Git instalado: $gitVer"
    } else {
        Log-Warn "Git não foi encontrado (recomendado para atualizações futuras)."
    }

    if (-not $allOk) {
        Write-Host ""
        Log-Error "Alguns pré-requisitos essenciais não foram atendidos."
        Log-Info "Após instalar o Go ou Node.js, feche e reabra esta janela para que o PATH seja atualizado."
        return $false
    }

    Log-Ok "Todos os pré-requisitos estão atendidos!"
    return $true
}

# ==============================================================================
# Verificação de Portas
# ==============================================================================
function Test-PortAvailable([int]$checkPort) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $checkPort)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Ensure-Port([int]$initialPort) {
    $p = $initialPort
    if (Test-PortAvailable $p) {
        return $p
    }

    Log-Warn "A porta $p já está sendo utilizada por outro processo."
    if ($Silent) {
        # Procura próxima porta livre
        while (-not (Test-PortAvailable $p)) {
            $p++
        }
        Log-Info "Porta alternativa selecionada automaticamente: $p"
        return $p
    }

    while (-not (Test-PortAvailable $p)) {
        Write-Host ""
        $userChoice = Read-Host "Informe outra porta livre (ou pressione Enter para testar $($p + 1))"
        if ([string]::IsNullOrWhiteSpace($userChoice)) {
            $p++
        } else {
            if ([int]::TryParse($userChoice, [ref]$p)) {
                # testa a porta informada
            } else {
                Write-Host "Porta inválida. Tente novamente." -ForegroundColor Red
            }
        }
    }

    Log-Ok "Porta $p está disponível."
    return $p
}

# ==============================================================================
# Geração / Configuração de .env
# ==============================================================================
function Generate-RandomKey([int]$length = 32) {
    $bytes = New-Object byte[] $length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
}

function Setup-EnvFile([int]$targetPort, [string]$dbFile) {
    Log-Header "2. Configurando Variáveis de Ambiente (.env)"
    $envPath = Join-Path $ScriptDir ".env"

    $sessionSecret = Generate-RandomKey 32
    $recordSigningKey = Generate-RandomKey 32

    if (Test-Path $envPath) {
        Log-Info "Arquivo .env já existente detectado. Atualizando configurações essenciais..."
        $content = Get-Content $envPath -Raw

        # Atualiza ou adiciona WACALLS_ADDR
        if ($content -match "WACALLS_ADDR=") {
            $content = $content -replace "WACALLS_ADDR=.*", "WACALLS_ADDR=:$targetPort"
        } else {
            $content += "`r`nWACALLS_ADDR=:$targetPort"
        }

        # Atualiza ou adiciona WACALLS_DB
        if ($content -match "WACALLS_DB=") {
            $content = $content -replace "WACALLS_DB=.*", "WACALLS_DB=$dbFile"
        } else {
            $content += "`r`nWACALLS_DB=$dbFile"
        }

        Set-Content -Path $envPath -Value $content -NoNewline
        Log-Ok "Arquivo .env atualizado com sucesso."
    } else {
        Log-Info "Criando novo arquivo .env com chaves de criptografia seguras..."
        $newEnv = @"
# ==============================================================================
# CONFIGURAÇÃO DO WACALLS CHAT (WINDOWS)
# ==============================================================================

# SERVIDOR E BANCO DE DADOS
WACALLS_ADDR=:$targetPort
WACALLS_DB=$dbFile
WACALLS_DEBUG=false
DB_DRIVER=sqlite

# REDIS (Opcional - deixe vazio para usar SQLite local puro)
# REDIS_URL=redis://127.0.0.1:6379/0

# SEGURANÇA E CRIPTOGRAFIA (Chaves geradas automaticamente pelo instalador)
SESSION_SECRET=$sessionSecret
RECORDING_SIGNING_KEY=$recordSigningKey
WACALLS_LICENSE_REQUIRED=0

# TRANSCRIÇÃO DE ÁUDIO STT (Opcional - Whisper / OpenAI)
# WACALLS_STT_URL=https://api.openai.com/v1/audio/transcriptions
# WACALLS_STT_AUTH=Bearer sk-proj-seu-token-aqui
# WACALLS_STT_MODEL=whisper-1
# WACALLS_STT_LANG=pt
# WACALLS_STT_MODE=multipart

# SÍNTESE DE VOZ TTS (Opcional)
# WACALLS_TTS_URL=http://127.0.0.1:5005/api/tts
"@
        Set-Content -Path $envPath -Value $newEnv -NoNewline
        Log-Ok "Arquivo .env criado com sucesso em: $envPath"
    }
}

# ==============================================================================
# Compilação do Frontend SPA
# ==============================================================================
function Build-Frontend {
    Log-Header "3. Instalando Dependências e Compilando Frontend SPA"
    $npmCmd = Get-NpmCommand
    if ($null -eq $npmCmd) {
        Log-Error "npm não encontrado! Impossível compilar o frontend."
        return $false
    }

    $clientDir = Join-Path $ScriptDir "client"
    if (-not (Test-Path (Join-Path $clientDir "package.json"))) {
        Log-Error "Diretório client/package.json não encontrado."
        return $false
    }

    Log-Info "Instalando dependências do React no diretório 'client'..."
    & $npmCmd --prefix client install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Falha ao instalar dependências do npm."
        return $false
    }

    Log-Info "Executando build do Vite para produção..."
    & $npmCmd --prefix client run build
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Falha ao executar build do frontend Vite."
        return $false
    }

    $distIndex = Join-Path $ScriptDir "dist\index.html"
    if (-not (Test-Path $distIndex)) {
        Log-Error "Arquivo de saída 'dist/index.html' não encontrado após o build!"
        return $false
    }

    Log-Ok "Frontend compilado com sucesso em: dist\"
    return $true
}

# ==============================================================================
# Compilação do Backend Go
# ==============================================================================
function Build-Backend {
    Log-Header "4. Baixando Módulos e Compilando Backend Go"
    if (-not (Test-CommandExists "go")) {
        Log-Error "Go não encontrado no PATH! Impossível compilar o backend."
        return $false
    }

    Log-Info "Baixando módulos Go (go mod download)..."
    go mod download
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Falha ao baixar dependências do Go."
        return $false
    }

    # Finaliza qualquer processo em execução antes de substituir o executável
    Stop-WaCallsServer -Quiet

    Log-Info "Compilando executável nativo wacalls.exe (Go puro, CGO desativado)..."
    $env:CGO_ENABLED = "0"
    go build -ldflags="-s -w" -o wacalls.exe ./cmd/server
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Falha na compilação do wacalls.exe."
        return $false
    }

    $exePath = Join-Path $ScriptDir "wacalls.exe"
    if (-not (Test-Path $exePath)) {
        Log-Error "Executável wacalls.exe não foi gerado."
        return $false
    }

    $sizeMb = [math]::Round(((Get-Item $exePath).Length / 1MB), 2)
    Log-Ok "Backend compilado com sucesso: wacalls.exe ($sizeMb MB)"
    return $true
}

# ==============================================================================
# Gerenciamento de Processos (Iniciar, Parar, Status)
# ==============================================================================
function Stop-WaCallsServer([switch]$Quiet) {
    $processes = Get-Process -Name "wacalls" -ErrorAction SilentlyContinue
    if ($processes) {
        if (-not $Quiet) { Log-Info "Encerrando processo(s) do wacalls.exe em execução..." }
        foreach ($p in $processes) {
            try {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            } catch {}
        }
        Start-Sleep -Seconds 1
        if (-not $Quiet) { Log-Ok "Processos do WaCalls encerrados." }
    } else {
        if (-not $Quiet) { Log-Info "Nenhum processo do WaCalls em execução." }
    }
}

function Start-WaCallsServer([int]$runPort = $Port) {
    $envPath = Join-Path $ScriptDir ".env"
    if (Test-Path $envPath) {
        foreach ($l in (Get-Content $envPath)) {
            if ($l -match "^WACALLS_ADDR=:?(\d+)") {
                $runPort = [int]$matches[1]
            } elseif ($l -match "^PORT=(\d+)") {
                $runPort = [int]$matches[1]
            }
        }
    }
    $exePath = Join-Path $ScriptDir "wacalls.exe"
    if (-not (Test-Path $exePath)) {
        Log-Error "Executável wacalls.exe não encontrado! Execute a instalação primeiro."
        return $false
    }

    $existing = Get-Process -Name "wacalls" -ErrorAction SilentlyContinue
    if ($existing) {
        Log-Warn "O servidor WaCalls já está em execução (PID: $($existing[0].Id))."
        Start-Process "http://localhost:$runPort"
        return $true
    }

    Log-Info "Iniciando WaCalls na porta $runPort..."
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exePath
    $psi.Arguments = "-addr :$runPort"
    $psi.WorkingDirectory = $ScriptDir
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
    $psi.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($psi) | Out-Null

    Start-Sleep -Seconds 2
    Log-Ok "Servidor iniciado com sucesso!"
    Start-Process "http://localhost:$runPort"
    return $true
}

function Show-WaCallsStatus {
    Log-Header "Status do Servidor WaCalls"
    $proc = Get-Process -Name "wacalls" -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "  STATUS:       " -NoNewline
        Write-Host "EM EXECUÇÃO" -ForegroundColor Green
        Write-Host "  PID:          $($proc.Id)"
        Write-Host "  Memória:      $([math]::Round($proc.WorkingSet64 / 1MB, 2)) MB"
        Write-Host "  Iniciado em:  $($proc.StartTime.ToString('dd/MM/yyyy HH:mm:ss'))"

        $conns = Get-NetTCPConnection -OwningProcess $proc.Id -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            Write-Host "  Portas:       " -NoNewline
            $ports = ($conns | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ", "
            Write-Host $ports -ForegroundColor Cyan
        }
    } else {
        Write-Host "  STATUS:       " -NoNewline
        Write-Host "PARADO" -ForegroundColor Yellow
        Write-Host "  Para iniciar, execute o arquivo iniciar.bat" -ForegroundColor Gray
    }
    Write-Host ""
}

# ==============================================================================
# Criação de Atalhos (Desktop e Menu Iniciar)
# ==============================================================================
function Create-Shortcuts {
    Log-Header "5. Criando Atalhos de Acesso Rápido"
    try {
        $wshShell = New-Object -ComObject WScript.Shell
        $desktopPath = [System.Environment]::GetFolderPath("Desktop")
        $startMenuPath = [System.Environment]::GetFolderPath("Programs")

        $targetBat = Join-Path $ScriptDir "iniciar.bat"
        $iconPath = Join-Path $ScriptDir "wacalls.exe"

        # Atalho na Área de Trabalho
        $desktopLnk = Join-Path $desktopPath "WaCalls Chat.lnk"
        $shortcut = $wshShell.CreateShortcut($desktopLnk)
        $shortcut.TargetPath = $targetBat
        $shortcut.WorkingDirectory = $ScriptDir
        $shortcut.Description = "Iniciar WaCalls Chat"
        if (Test-Path $iconPath) {
            $shortcut.IconLocation = "$iconPath,0"
        }
        $shortcut.Save()
        Log-Ok "Atalho criado na Área de Trabalho: 'WaCalls Chat'"

        # Atalho no Menu Iniciar
        $startMenuLnk = Join-Path $startMenuPath "WaCalls Chat.lnk"
        $shortcutMenu = $wshShell.CreateShortcut($startMenuLnk)
        $shortcutMenu.TargetPath = $targetBat
        $shortcutMenu.WorkingDirectory = $ScriptDir
        $shortcutMenu.Description = "Iniciar WaCalls Chat"
        if (Test-Path $iconPath) {
            $shortcutMenu.IconLocation = "$iconPath,0"
        }
        $shortcutMenu.Save()
        Log-Ok "Atalho criado no Menu Iniciar: 'WaCalls Chat'"

        return $true
    } catch {
        Log-Warn "Não foi possível criar os atalhos automaticamente: $_"
        return $false
    }
}

# ==============================================================================
# Configuração de Inicialização Automática com o Windows
# ==============================================================================
function Configure-AutoStart {
    Log-Header "Configurando Inicialização com o Windows"
    $taskName = "WaCallsChat"
    $iniciarBat = Join-Path $ScriptDir "iniciar.bat"

    try {
        # Cria ou atualiza Tarefa Agendada no Windows (ao fazer logon)
        $action = "cmd.exe /c `"$iniciarBat`""
        $cmd = "schtasks.exe /Create /TN `"$taskName`" /TR `"$action`" /SC ONLOGON /F"
        cmd.exe /c $cmd | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Log-Ok "Tarefa de inicialização automática '$taskName' configurada com sucesso!"
            Log-Info "O WaCalls Chat será iniciado automaticamente sempre que você entrar no Windows."
        } else {
            # Fallback: Atalho na pasta Inicializar (Startup)
            $startupFolder = [System.Environment]::GetFolderPath("Startup")
            $startupLnk = Join-Path $startupFolder "WaCalls Chat.lnk"
            $wshShell = New-Object -ComObject WScript.Shell
            $shortcut = $wshShell.CreateShortcut($startupLnk)
            $shortcut.TargetPath = $iniciarBat
            $shortcut.WorkingDirectory = $ScriptDir
            $shortcut.Save()
            Log-Ok "Atalho adicionado na pasta Inicializar (Startup) com sucesso!"
        }
        return $true
    } catch {
        Log-Error "Erro ao configurar inicialização automática: $_"
        return $false
    }
}

function Remove-AutoStart {
    Log-Header "Removendo Inicialização Automática"
    $taskName = "WaCallsChat"
    cmd.exe /c "schtasks.exe /Delete /TN `"$taskName`" /F" 2>$null

    $startupFolder = [System.Environment]::GetFolderPath("Startup")
    $startupLnk = Join-Path $startupFolder "WaCalls Chat.lnk"
    if (Test-Path $startupLnk) {
        Remove-Item $startupLnk -Force -ErrorAction SilentlyContinue
    }
    Log-Ok "Inicialização automática desativada."
}

# ==============================================================================
# Regra de Firewall do Windows
# ==============================================================================
function Configure-FirewallRule([int]$rulePort = $Port) {
    Log-Header "Configuração de Firewall do Windows"
    if (-not (Test-IsAdmin)) {
        Log-Warn "A configuração do firewall requer privilégios de Administrador."
        Log-Info "Execute o instalador clicando com o botão direito e selecionando 'Executar como Administrador'."
        return $false
    }

    try {
        $ruleName = "WaCalls Chat (Porta $rulePort)"
        Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

        New-NetFirewallRule -DisplayName $ruleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort $rulePort `
            -Profile Any `
            -Description "Permite conexões de rede locais para o servidor WaCalls Chat" | Out-Null

        Log-Ok "Regra de firewall criada para permitir conexões TCP na porta $rulePort."
        return $true
    } catch {
        Log-Warn "Não foi possível criar a regra de firewall automaticamente: $_"
        return $false
    }
}

# ==============================================================================
# Redefinição / Criação de Usuário Administrador
# ==============================================================================
function Manage-AdminUser {
    Log-Header "Gerenciamento de Administrador"
    $exePath = Join-Path $ScriptDir "wacalls.exe"
    if (-not (Test-Path $exePath)) {
        Log-Error "Executável wacalls.exe não encontrado! Compile a aplicação primeiro."
        return
    }

    Write-Host "Contas cadastradas no banco de dados:" -ForegroundColor Cyan
    & $exePath -list-users
    Write-Host ""

    $email = Read-Host "Digite o e-mail do admin a criar ou redefinir (ex: wacalls@admin.com)"
    if ([string]::IsNullOrWhiteSpace($email)) {
        Log-Warn "Nenhum e-mail informado. Operação cancelada."
        return
    }

    $pass = Read-Host "Digite a nova senha para $email"
    if ([string]::IsNullOrWhiteSpace($pass)) {
        Log-Warn "Senha não pode ser vazia. Operação cancelada."
        return
    }

    Log-Info "Atualizando credenciais..."
    & $exePath -reset-admin-email $email -reset-admin-password $pass
    Log-Ok "Credenciais salvas com sucesso!"
}

# ==============================================================================
# Fluxo de Instalação Completa
# ==============================================================================
function Run-FullInstallation {
    Show-Banner
    Log-Header "Iniciando Instalação Completa do WaCalls Chat para Windows"

    # 1. Pré-requisitos
    if (-not (Check-Prerequisites)) {
        return $false
    }

    # 2. Porta e Arquivo .env
    $targetPort = Ensure-Port $Port
    Setup-EnvFile $targetPort $DbPath

    # 3. Compilação do Frontend SPA
    if (-not (Build-Frontend)) {
        Log-Error "Falha na etapa de build do frontend. Abortando."
        return $false
    }

    # 4. Compilação do Backend Go
    if (-not (Build-Backend)) {
        Log-Error "Falha na etapa de build do backend. Abortando."
        return $false
    }

    # 5. Administrador Padrao
    Log-Info "Configurando conta de administrador inicial ()..."
    $exePath = Join-Path $ScriptDir "wacalls.exe"
    & $exePath -reset-admin-email $AdminEmail -reset-admin-password $AdminPassword 2>$null | Out-Null
    Log-Ok "Conta de administrador configurada."

    # 6. Atalhos
    Create-Shortcuts

    # 6. Resumo e Sucesso
    Log-Header "🎉 Instalação Concluída com Sucesso!"
    Write-Host "  URL de Acesso:      " -NoNewline
    Write-Host "http://localhost:$targetPort" -ForegroundColor Green
    Write-Host "  E-mail padrão:      " -NoNewline
    Write-Host "$AdminEmail" -ForegroundColor Yellow
    Write-Host "  Senha padrão:       " -NoNewline
    Write-Host "$AdminPassword" -ForegroundColor Yellow
    Write-Host "  Banco de Dados:     $DbPath (SQLite)"
    Write-Host ""
    Write-Host "  Arquivos de Controle gerados na pasta do projeto:" -ForegroundColor Cyan
    Write-Host "    - iniciar.bat     -> Inicia o servidor e abre o navegador"
    Write-Host "    - parar.bat       -> Encerra o servidor WaCalls"
    Write-Host "    - reiniciar.bat   -> Reinicia o servidor"
    Write-Host "    - status.bat      -> Exibe status e consumo de memória"
    Write-Host ""

    if (-not $Silent) {
        $startNow = Read-Host "Deseja iniciar o WaCalls Chat agora mesmo? (S/N)"
        if ($startNow -match "^[sSyY]") {
            Start-WaCallsServer $targetPort
        }
    }
    return $true
}

# ==============================================================================
# Menu Interativo
# ==============================================================================
function Show-InteractiveMenu {
    while ($true) {
        Show-Banner
        Write-Host "Escolha uma das opções abaixo:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  [1] " -ForegroundColor Yellow -NoNewline
        Write-Host "Instalação Completa (Recomendado na primeira execução)"
        Write-Host "  [2] " -ForegroundColor Yellow -NoNewline
        Write-Host "Apenas Compilar / Atualizar (Frontend + Backend)"
        Write-Host "  [3] " -ForegroundColor Yellow -NoNewline
        Write-Host "Iniciar Servidor WaCalls"
        Write-Host "  [4] " -ForegroundColor Yellow -NoNewline
        Write-Host "Parar Servidor WaCalls"
        Write-Host "  [5] " -ForegroundColor Yellow -NoNewline
        Write-Host "Verificar Status do Servidor"
        Write-Host "  [6] " -ForegroundColor Yellow -NoNewline
        Write-Host "Criar Atalho na Área de Trabalho e Menu Iniciar"
        Write-Host "  [7] " -ForegroundColor Yellow -NoNewline
        Write-Host "Configurar Inicialização Automática com o Windows"
        Write-Host "  [8] " -ForegroundColor Yellow -NoNewline
        Write-Host "Desativar Inicialização Automática"
        Write-Host "  [9] " -ForegroundColor Yellow -NoNewline
        Write-Host "Gerenciar / Redefinir Administrador"
        Write-Host "  [F] " -ForegroundColor Yellow -NoNewline
        Write-Host "Liberar Porta no Firewall do Windows"
        Write-Host "  [0] " -ForegroundColor Yellow -NoNewline
        Write-Host "Sair"
        Write-Host ""

        $choice = Read-Host "Opção"
        switch ($choice.ToUpper()) {
            "1" {
                Run-FullInstallation
                Write-Host ""
                Read-Host "Pressione Enter para voltar ao menu principal..."
            }
            "2" {
                Show-Banner
                Build-Frontend
                Build-Backend
                Write-Host ""
                Read-Host "Pressione Enter para voltar ao menu principal..."
            }
            "3" {
                Start-WaCallsServer $Port
                Start-Sleep -Seconds 2
            }
            "4" {
                Stop-WaCallsServer
                Start-Sleep -Seconds 2
            }
            "5" {
                Show-WaCallsStatus
                Read-Host "Pressione Enter para continuar..."
            }
            "6" {
                Create-Shortcuts
                Write-Host ""
                Read-Host "Pressione Enter para continuar..."
            }
            "7" {
                Configure-AutoStart
                Write-Host ""
                Read-Host "Pressione Enter para continuar..."
            }
            "8" {
                Remove-AutoStart
                Write-Host ""
                Read-Host "Pressione Enter para continuar..."
            }
            "9" {
                Manage-AdminUser
                Write-Host ""
                Read-Host "Pressione Enter para continuar..."
            }
            "F" {
                Configure-FirewallRule $Port
                Write-Host ""
                Read-Host "Pressione Enter para continuar..."
            }
            "0" {
                Log-Info "Até logo!"
                return
            }
            default {
                Write-Host "Opção inválida! Pressione Enter..." -ForegroundColor Red
                Read-Host | Out-Null
            }
        }
    }
}

# ==============================================================================
# Ponto de Entrada Principal
# ==============================================================================
switch ($Action) {
    "Interactive"    { Show-InteractiveMenu }
    "FullInstall"    { Run-FullInstallation }
    "BuildOnly"      { Build-Frontend; Build-Backend }
    "Start"          { Start-WaCallsServer $Port }
    "Stop"           { Stop-WaCallsServer }
    "Status"         { Show-WaCallsStatus }
    "CreateShortcut" { Create-Shortcuts }
    "AutoStart"      { Configure-AutoStart }
    "RemoveAutoStart"{ Remove-AutoStart }
    "ResetAdmin"     { Manage-AdminUser }
    "FirewallRule"   { Configure-FirewallRule $Port }
}
