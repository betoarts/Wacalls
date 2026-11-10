# 🚀 Guia de Setup Local (Windows / Linux / macOS)

> 💡 **Instaladores Automatizados**:
> - **Windows (Setup Local)**: Utilize [`instalador.bat`](instalador.bat) ou [`instalador.ps1`](instalador.ps1).
> - **Windows (Gerador `.exe` Distribuível)**: Utilize [`gerar-instalador.bat`](gerar-instalador.bat) + [`wacalls.iss`](wacalls.iss) (Inno Setup 6) para gerar `dist-installer\WaCalls_Setup_v1.0.0.exe`.
> - **Linux / VPS (Ubuntu 22.04+)**: Utilize [`instalador.sh`](instalador.sh) para configurar Go, Node.js, serviço `systemd` e proxy reverso Nginx com SSL.

Este guia explica como instalar, executar em modo desenvolvimento, compilar para produção e fazer backup do **WaCalls Chat**. Consulte também o [`README.md`](README.md) e o catálogo completo em [`FUNCIONALIDADES.md`](FUNCIONALIDADES.md).

---

## 1. Pré-requisitos

Instale as ferramentas abaixo uma única vez na máquina:

- **Node.js 20 LTS ou superior** (inclui `npm` 10+) — [nodejs.org](https://nodejs.org/)
- **Go 1.22 ou superior** *(projeto configurado com Go `1.26.4` no [`go.mod`](go.mod))* — [go.dev/dl](https://go.dev/dl/)
- **Git** — [git-scm.com](https://git-scm.com/)
- **Inno Setup 6** *(opcional — necessário apenas se quiser gerar o instalador `.exe` via [`gerar-instalador.bat`](gerar-instalador.bat))* — [jrsoftware.org/isdl.php](https://jrsoftware.org/isdl.php)

Confirme as instalações no terminal:

```bash
node -v        # v20.x.x ou superior
npm -v         # 10.x.x ou superior
go version     # go1.22+ (recomendado go1.26.4)
git --version
```

> ⚠️ Se algum comando recém-instalado não for reconhecido, **feche e reabra o terminal** para recarregar o `PATH`.

---

## 2. Clonar o Repositório

```bash
git clone https://github.com/betoarts/Wacalls.git
cd Wacalls
```

*(Opcional)* Crie seu arquivo `.env` a partir do modelo padrão [`.env.default`](.env.default) para customizar porta, segredos (`SESSION_SECRET`, `RECORDING_SIGNING_KEY`), Redis ou STT/TTS:

**Windows (PowerShell):**
```powershell
Copy-Item .env.default .env -ErrorAction SilentlyContinue
```

**Linux / macOS:**
```bash
cp -n .env.default .env
```

---

## 3. Instalação de Dependências

Na raiz do projeto:

```bash
npm install          # Instala dependências da raiz
npm run setup        # Instala dependências do frontend (client/) e baixa módulos Go
```

---

## 4. Executando a Aplicação

### Opção Windows: Instalador 1-Clique (`instalador.bat` / `instalador.ps1`) — Mais Fácil

No Windows, dê um duplo clique em [`instalador.bat`](instalador.bat) (ou execute via terminal):

```bat
instalador.bat
```

O script verifica pré-requisitos, compila o frontend (`dist/`) e o executável `wacalls.exe`, configura o `.env` e prepara os scripts operacionais na pasta:

- **[`iniciar.bat`](iniciar.bat) / [`WaCalls.vbs`](WaCalls.vbs)**: Inicia o `wacalls.exe` e abre o painel no navegador (`http://localhost:8080`, ou conforme `PORT` / `WACALLS_ADDR` no `.env`).
- **[`parar.bat`](parar.bat) / [`parar.vbs`](parar.vbs)**: Encerra os processos do servidor com segurança.
- **[`reiniciar.bat`](reiniciar.bat)**: Reinicia o servidor.
- **[`status.bat`](status.bat)**: Mostra status do processo, uso de memória e porta ativa.
- **[`backup.bat`](backup.bat) / [`restaurar.bat`](restaurar.bat)**: Cria e restaura backups locais (`.zip`) contendo banco SQLite e pasta `media/`.
- **[`gerar-instalador.bat`](gerar-instalador.bat)**: Compila `dist/` + `wacalls.exe` e empacota o instalador gráfico `dist-installer\WaCalls_Setup_v1.0.0.exe` usando [`wacalls.iss`](wacalls.iss).
- **[`desinstalar.bat`](desinstalar.bat)**: Remove atalhos e tarefas de inicialização com o Windows.

---

### Opção A: Usando o Script `dev.sh` (Linux / macOS / WSL) — Recomendado para Dev

```bash
chmod +x dev.sh
./dev.sh
```

O [`dev.sh`](dev.sh) verifica pré-requisitos e portas livres, sobe o **backend Go em `:3001`** e o **frontend Vite em `:5173`** com logs coloridos. Opções extras:

```bash
./dev.sh --setup      # Instala dependências (Go + Node)
./dev.sh --server     # Inicia apenas o backend Go (:3001)
./dev.sh --client     # Inicia apenas o frontend Vite (:5173)
./dev.sh --build      # Gera build de produção (dist/ + binário Go)
./dev.sh --clean      # Remove artefatos de build
```

---

### Opção B: Modo Desenvolvimento em Dois Terminais (Windows / Linux / macOS)

Em desenvolvimento, o Vite ([`client/vite.config.ts`](client/vite.config.ts)) roda em `http://localhost:5173` e redireciona `/api/*` para `http://localhost:3001`. Por isso, execute backend e frontend em terminais separados:

#### Terminal 1 — Backend Go (porta `:3001`)
Na raiz do repositório:

```bash
go mod download
go run ./cmd/server -addr :3001 -debug
```

#### Terminal 2 — Frontend Vite (porta `:5173`)
Na raiz do repositório (via scripts de [`package.json`](package.json)):

```bash
npm run dev
```

*(Equivalente a entrar em `client/` e rodar `npm run dev`.)*

Acesse no navegador: **`http://localhost:5173`**

---

### Opção C: Build Local em Porta Única (Estilo Produção)

Se preferir servir tudo em uma única porta (`:8080`, ou conforme `PORT` / `WACALLS_ADDR` no `.env`), compile o frontend para `dist/` e execute o servidor Go:

```bash
npm run build
npm run start
```

*(Ou compile um binário dedicado com `go build -ldflags="-s -w" -o wacalls.exe ./cmd/server` no Windows / `-o wacalls` no Linux e acesse **`http://localhost:8080`**.)*

---

## 🔑 Credenciais Padrão de Acesso

Na primeira inicialização com o banco SQLite vazio, a conta administradora padrão é criada automaticamente:

| Campo | Valor Padrão |
|---|---|
| **E-mail** | `wacalls@admin.com` |
| **Senha** | `admin` |

> 🔒 **Recomendação de Segurança**: Altere a senha imediatamente após o primeiro acesso na área de perfil/usuários ou via flags de linha de comando (`-reset-admin-email` / `-reset-admin-password` em [`cmd/server/main.go`](cmd/server/main.go)).

---

## 🔄 Atualizando o Projeto após `git pull`

Sempre que atualizar o código fonte local:

```bash
git pull origin main
npm run setup
npm run build
```

No Windows, execute [`reiniciar.bat`](reiniciar.bat) (ou reexecute [`instalador.bat`](instalador.bat) / `go build -ldflags="-s -w" -o wacalls.exe ./cmd/server` caso o código Go tenha mudado).

---

## 💾 Backup e Restauração

- **Pelo Painel Web (`/settings/backup`)**: Administradores podem visualizar o tamanho do banco e das mídias, baixar um arquivo `.zip` completo do banco SQLite + mídias ou restaurar a partir de um backup existente.
- **Via Scripts Windows**: Execute [`backup.bat`](backup.bat) para salvar em `backups/` e [`restaurar.bat`](restaurar.bat) para restaurar.

---

## 🛠️ Resolução de Problemas Comuns

| Erro / Sintoma | Causa Provável | Solução |
|---|---|---|
| `vite: command not found` | Dependências de `client/` não instaladas | Execute `npm run setup` na raiz do projeto |
| `[vite] http proxy error: ECONNREFUSED` | Backend Go não está rodando na porta `:3001` | Suba o backend com `go run ./cmd/server -addr :3001 -debug` (ou `./dev.sh`) |
| Página em branco ou `404` na porta `:8080` | Build `dist/` ausente ou desatualizado | Execute `npm run build` na raiz do projeto |
| `go: command not found` | Go não instalado ou ausente no `PATH` | Instale o Go 1.22+ (`1.26.4` recomendado) e reabra o terminal |
| Login padrão rejeitado | `wacalls.db` já possuía usuários cadastrados | Redefina com `-reset-admin-email` / `-reset-admin-password` ou resete o banco |
| Porta `:8080` ou `:3001` já em uso | Outra instância ativa ou serviço local | Pare com [`parar.bat`](parar.bat) ou defina outra porta via `-addr` / `.env` |

---

## 🧹 Resetando o Banco de Dados Local

Caso queira zerar o banco SQLite local e recriar o administrador padrão:

1. Pare o servidor (`Ctrl + C` ou [`parar.bat`](parar.bat)).
2. Remova os arquivos do banco:

**Windows (PowerShell):**
```powershell
Remove-Item wacalls.db, wacalls.db-shm, wacalls.db-wal -ErrorAction SilentlyContinue
```

**Linux / macOS:**
```bash
rm -f wacalls.db wacalls.db-shm wacalls.db-wal
```

3. Inicie a aplicação novamente — o schema SQLite será recriado automaticamente com a conta `wacalls@admin.com` / `admin`.

---

## 📄 Licença MIT

Este projeto é distribuído como software livre sob a **Licença MIT**. Consulte o texto oficial completo em [`LICENSE`](LICENSE):

- **Copyright**: `Copyright (c) 2026 Humberto Moura`
- **Liberdades**: uso comercial ou privado, modificação, distribuição e sublicenciamento permitidos, mantendo o aviso de copyright e a cópia da licença nos arquivos distribuídos.
