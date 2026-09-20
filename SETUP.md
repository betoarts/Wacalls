# 🚀 Guia de Setup Local (Windows / Linux / macOS)

> 💡 **Dica para Produção / VPS**: No Linux/Ubuntu, utilize o script automatizado [`instalador.sh`](instalador.sh) para configurar a aplicação, Nginx com SSL e serviço systemd em poucos minutos.

Este guia rápido explica como rodar o **WaCalls Chat** localmente em ambiente de desenvolvimento.

---

## 1. Pré-requisitos

Instale os pré-requisitos abaixo (uma única vez por máquina):

- **Node.js 20 LTS ou superior** (inclui npm) — [nodejs.org](https://nodejs.org/)
- **Go 1.22 ou superior** — [go.dev/dl](https://go.dev/dl/)
- **Git** — [git-scm.com](https://git-scm.com/)

Confirme a instalação no seu terminal:

```bash
node -v   # v20.x.x ou superior
npm -v    # 10.x.x ou superior
go version
git --version
```

> ⚠️ Se algum comando não for reconhecido, **feche e reabra o terminal** após a instalação.

---

## 2. Clonar o Repositório

```bash
git clone https://github.com/betoarts/Wacalls.git
cd Wacalls
```

---

## 3. Instalação de Dependências

Na raiz do projeto:

```bash
npm install          # Instala dependências da raiz (concurrently, etc.)
npm run setup        # Instala dependências do frontend (client/) + baixa módulos Go
```

---

## 4. Executando a Aplicação

### Opção A: Usando o Script `dev.sh` (Linux / macOS / WSL) — Recomendado

```bash
chmod +x dev.sh
./dev.sh
```

O script verifica automaticamente portas livres, instala dependências se necessário e sobe backend e frontend juntos com logs coloridos.

---

### Opção B: Via NPM (Windows / Linux / macOS)

```bash
npm run dev
```

Isso inicia o **frontend (5173)** e o **backend Go (3001/8080)** simultaneamente. Para encerrar, pressione `Ctrl + C`.

---

### Opção C: Dois Terminais Separados

Se preferir visualizar os logs do backend e frontend em janelas separadas:

#### Terminal 1 — Frontend (porta 5173)
```bash
cd client
npm install          # Apenas na primeira vez ou após git pull
npm run dev          # Sobe o Vite em http://localhost:5173
```

#### Terminal 2 — Backend Go (porta 3001 ou 8080)
Na raiz do repositório:

```bash
go mod download      # Baixa dependências Go (primeira vez)
go run ./cmd/server  # Sobe o servidor HTTP na porta :8080 (ou :3001)
```

---

## 🔑 Credenciais Padrão de Acesso

Abra o navegador em **`http://localhost:5173`** e faça login com as credenciais padrão geradas na primeira execução:

| Campo | Valor Padrão | Valor Alternativo |
|-------|--------------|-------------------|
| **E-mail** | `wacalls@admin.com` | `admin@equipechat.com` |
| **Senha** | `admin` | `adminpro` |

> 🔒 **Recomendação de Segurança**: Altere a senha do administrador logo após o primeiro acesso na tela de **Usuários & Perfil**.

---

## 🔄 Atualizando o Projeto após `git pull`

Sempre que atualizar seu código local com `git pull`:

```bash
git pull origin main
npm run setup
npm run dev
```

---

## 🛠️ Resolução de Problemas Comuns

| Erro / Sintoma | Causa Provável | Solução |
|----------------|----------------|---------|
| `vite: command not found` | Dependências do cliente não instaladas | Execute `npm run setup` na raiz do projeto |
| `concurrently: command not found` | Faltou `npm install` na raiz | Execute `npm install` na raiz do projeto |
| `[vite] http proxy error: ECONNREFUSED` | Backend Go não está rodando | Inicie o backend (`./dev.sh` ou `go run ./cmd/server`) |
| `go: command not found` | Go não instalado ou fora do PATH | Instale o Go e reabra o terminal |
| Login não aceita o usuário padrão | O banco SQLite já continha outros usuários | Pare o backend, remova `wacalls.db*` e suba novamente |

---

## 🧹 Resetando o Banco de Dados Local

Caso queira zerar o banco de dados e recriar o usuário administrador padrão:

1. Pare o backend.
2. Execute o comando de remoção:

**Windows (PowerShell):**
```powershell
Remove-Item wacalls.db, wacalls.db-shm, wacalls.db-wal -ErrorAction SilentlyContinue
```

**Linux / macOS:**
```bash
rm -f wacalls.db wacalls.db-shm wacalls.db-wal
```

3. Inicie a aplicação novamente — o banco será reconstruído e a conta `wacalls@admin.com` / `admin` recriada automaticamente.