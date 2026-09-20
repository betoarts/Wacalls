#!/usr/bin/env bash
# ==============================================================================
# WaCalls Chat — Script de desenvolvimento local
# ==============================================================================
# Uso:
#   ./dev.sh              Inicia backend + frontend em modo desenvolvimento
#   ./dev.sh --build      Compila o binário de produção + frontend
#   ./dev.sh --server     Inicia apenas o backend Go
#   ./dev.sh --client     Inicia apenas o frontend Vite
#   ./dev.sh --setup      Apenas instala dependências (Go + Node)
#   ./dev.sh --clean      Remove artefatos de build e banco de dados
#   ./dev.sh --help       Mostra esta ajuda
#
# Portas padrão (desenvolvimento):
#   Backend Go:    http://localhost:3001  (API)
#   Frontend Vite: http://localhost:5173  (proxy /api → :3001)
#
# Login padrão:
#   Email: wacalls@admin.com
#   Senha: admin
#
# Variáveis de ambiente opcionais:
#   WACALLS_ADDR=:3001     Porta do backend Go
#   WACALLS_DB=wacalls.db  Caminho do banco SQLite
#   WACALLS_DEBUG=true     Ativa logging detalhado
# ==============================================================================

set -euo pipefail

# ── Cores ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Diretório do projeto ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

# ── Variáveis de configuração ─────────────────────────────────────────────────
# Porta 3001 como padrão de DEV para evitar conflito com serviços na 8080.
# O proxy do Vite (client/vite.config.ts) já aponta para :3001.
GO_ADDR="${WACALLS_ADDR:-:3001}"
DB_PATH="${WACALLS_DB:-wacalls.db}"
GO_DEBUG="${WACALLS_DEBUG:-false}"

# ── Funções auxiliares ────────────────────────────────────────────────────────

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_header()  { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

show_help() {
    sed -n '2,/^# =====/{ /^# =====/d; s/^# \?//; p }' "$0"
    exit 0
}

# Extrai apenas o número da porta de um endereço como ":3001" ou "0.0.0.0:3001"
get_port_number() {
    echo "$1" | grep -oE '[0-9]+$'
}

# Verifica se uma porta está disponível
check_port_available() {
    local port="$1"
    if ss -tlnp "sport = :${port}" 2>/dev/null | grep -q LISTEN; then
        return 1  # ocupada
    fi
    return 0  # livre
}

# ── Verificação de pré-requisitos ─────────────────────────────────────────────
check_prereqs() {
    log_header "Verificando pré-requisitos"
    local ok=true

    # Go
    if command -v go &>/dev/null; then
        local go_ver
        go_ver="$(go version | awk '{print $3}')"
        log_ok "Go encontrado: ${go_ver}"
    else
        log_error "Go não encontrado. Instale: https://go.dev/dl/"
        ok=false
    fi

    # Node.js
    if command -v node &>/dev/null; then
        local node_ver
        node_ver="$(node --version)"
        log_ok "Node.js encontrado: ${node_ver}"

        # Verificar versão mínima (>= 18)
        local major
        major="$(echo "$node_ver" | sed 's/^v//' | cut -d. -f1)"
        if [ "$major" -lt 18 ]; then
            log_warn "Node.js >= 18 recomendado (atual: ${node_ver})"
        fi
    else
        log_error "Node.js não encontrado. Instale: https://nodejs.org/"
        ok=false
    fi

    # npm
    if command -v npm &>/dev/null; then
        local npm_ver
        npm_ver="$(npm --version)"
        log_ok "npm encontrado: v${npm_ver}"
    else
        log_error "npm não encontrado. Normalmente vem com o Node.js."
        ok=false
    fi

    if [ "$ok" = false ]; then
        log_error "Instale as dependências faltantes e tente novamente."
        exit 1
    fi
}

# ── Instalação de dependências ────────────────────────────────────────────────
install_deps() {
    log_header "Instalando dependências"

    # Go modules
    log_info "Baixando módulos Go..."
    (cd "$PROJECT_DIR" && go mod download)
    log_ok "Módulos Go prontos"

    # Node.js — client
    log_info "Instalando pacotes Node.js do client..."
    (cd "$PROJECT_DIR/client" && npm install --no-audit --no-fund)
    log_ok "Pacotes Node.js do client prontos"
}

# ── Iniciar backend Go ────────────────────────────────────────────────────────
start_server() {
    log_header "Iniciando backend Go"

    local port
    port="$(get_port_number "$GO_ADDR")"

    if ! check_port_available "$port"; then
        log_error "Porta ${port} já está em uso!"
        log_info "Use WACALLS_ADDR=:PORTA ./dev.sh --server para especificar outra porta"
        exit 1
    fi

    local args=("-addr" "$GO_ADDR" "-db" "$DB_PATH")
    if [ "$GO_DEBUG" = "true" ]; then
        args+=("-debug")
    fi

    log_info "Backend Go: http://localhost:${port}"
    log_info "Banco de dados: ${DB_PATH}"
    log_info "Admin padrão: wacalls@admin.com / admin"

    (cd "$PROJECT_DIR" && exec go run ./cmd/server "${args[@]}")
}

# ── Iniciar frontend Vite ─────────────────────────────────────────────────────
start_client() {
    log_header "Iniciando frontend Vite"

    local port
    port="$(get_port_number "$GO_ADDR")"

    log_info "Frontend Vite: http://localhost:5173"
    log_info "Proxy /api → http://localhost:${port}"

    (cd "$PROJECT_DIR/client" && exec npx vite --host)
}

# ── Build de produção ─────────────────────────────────────────────────────────
build_production() {
    log_header "Build de produção"

    # Frontend
    log_info "Compilando frontend..."
    (cd "$PROJECT_DIR/client" && npm install --no-audit --no-fund && npm run build)
    log_ok "Frontend compilado em dist/"

    # Backend
    log_info "Compilando backend..."
    (cd "$PROJECT_DIR" && go build -o wacalls ./cmd/server)
    log_ok "Binário compilado: ./wacalls"

    echo ""
    log_header "Build concluído!"
    log_info "Para rodar em produção:"
    echo -e "  ${CYAN}./wacalls -addr :8080 -db wacalls.db${NC}"
    echo ""
    log_info "O binário serve o frontend automaticamente de dist/"
    log_info "Acesse: http://localhost:8080"
    log_info "Login: wacalls@admin.com / admin"
}

# ── Limpeza ───────────────────────────────────────────────────────────────────
clean() {
    log_header "Limpando artefatos"

    local items=(
        "$PROJECT_DIR/wacalls"
        "$PROJECT_DIR/dist"
        "$PROJECT_DIR/client/dist"
        "$PROJECT_DIR/wacalls.db"
        "$PROJECT_DIR/wacalls.db-shm"
        "$PROJECT_DIR/wacalls.db-wal"
        "$PROJECT_DIR/client/node_modules"
        "$PROJECT_DIR/node_modules"
    )

    for item in "${items[@]}"; do
        if [ -e "$item" ]; then
            rm -rf "$item"
            log_ok "Removido: $(basename "$item")"
        fi
    done

    log_ok "Limpeza concluída"
}

# ── Modo desenvolvimento (backend + frontend simultâneos) ─────────────────────
start_dev() {
    check_prereqs
    install_deps

    local port
    port="$(get_port_number "$GO_ADDR")"

    # Verificar se a porta do backend está livre
    if ! check_port_available "$port"; then
        log_error "Porta ${port} já está em uso por outro processo!"
        log_info "Especifique outra porta: WACALLS_ADDR=:PORTA ./dev.sh"
        exit 1
    fi

    log_header "Iniciando WaCalls em modo desenvolvimento"
    echo -e "  ${CYAN}Backend  →${NC} http://localhost:${port}       (API)"
    echo -e "  ${CYAN}Frontend →${NC} http://localhost:5173      (Vite dev server)"
    echo -e "  ${CYAN}Login    →${NC} wacalls@admin.com / admin"
    echo -e ""
    echo -e "  ${YELLOW}Abra http://localhost:5173 no navegador${NC}"
    echo -e "  ${YELLOW}Pressione Ctrl+C para parar ambos${NC}"
    echo ""

    # Trap para matar ambos os processos ao encerrar
    trap 'log_info "Encerrando..."; kill 0 2>/dev/null; exit 0' INT TERM

    # Iniciar backend em background
    local server_args=("-addr" "$GO_ADDR" "-db" "$DB_PATH")
    if [ "$GO_DEBUG" = "true" ]; then
        server_args+=("-debug")
    fi
    (cd "$PROJECT_DIR" && go run ./cmd/server "${server_args[@]}") &
    local server_pid=$!

    # Aguardar backend iniciar
    sleep 3

    # Verificar se o backend iniciou corretamente
    if ! kill -0 "$server_pid" 2>/dev/null; then
        log_error "Backend falhou ao iniciar. Verifique os logs acima."
        exit 1
    fi
    log_ok "Backend Go iniciado (PID: ${server_pid})"

    # Iniciar frontend em background
    (cd "$PROJECT_DIR/client" && npx vite --host) &
    local client_pid=$!

    # Esperar qualquer processo terminar
    wait -n "$server_pid" "$client_pid" 2>/dev/null || true

    # Se um morreu, matar o outro
    kill "$server_pid" "$client_pid" 2>/dev/null || true
    wait 2>/dev/null || true
}

# ── Ponto de entrada ──────────────────────────────────────────────────────────
main() {
    local mode="${1:-dev}"

    case "$mode" in
        --help|-h|help)
            show_help
            ;;
        --setup|setup)
            check_prereqs
            install_deps
            log_ok "Setup concluído! Execute ./dev.sh para iniciar."
            ;;
        --build|build)
            check_prereqs
            install_deps
            build_production
            ;;
        --server|server)
            check_prereqs
            start_server
            ;;
        --client|client)
            check_prereqs
            start_client
            ;;
        --clean|clean)
            clean
            ;;
        dev|"")
            start_dev
            ;;
        *)
            log_error "Modo desconhecido: $mode"
            show_help
            ;;
    esac
}

main "$@"
