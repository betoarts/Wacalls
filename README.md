<p align="center">
  <img src="assets/banner.jpg" alt="WaCalls Chat Banner" width="100%" style="border-radius: 10px;">
</p>

# 📞 WaCalls Chat

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **Plataforma completa de Atendimento Multicanal, Telefonia VoIP via WebRTC (Codec MLow), Automação de WhatsApp, Construtor Visual de Fluxos (Flow Builder), Tags Unificadas (Contatos e Grupos), Kanban CRM e Inteligência Artificial.**

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [Principais Recursos](#-principais-recursos)
- [Arquitetura & Tecnologias](#-arquitetura--tecnologias)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação e Execução Rápida](#-instalação-e-execução-rápida)
  - [Windows: Instalador 1-Clique e Gerador `.exe`](#opção-windows-instalador-1-clique-instaladorbat--instaladorps1)
  - [Linux / VPS (`instalador.sh`)](#opção-linux--vps-instaladorsh)
  - [Modo Desenvolvimento (`dev.sh`, NPM e Manual)](#opção-1-script-de-desenvolvimento-devsh---recomendado)
- [Credenciais Padrão](#-credenciais-padrão)
- [Módulos & Funcionalidades](#-módulos--funcionalidades)
  - [1. Chat Multiatendimento & WhatsApp](#1-chat-multiatendimento--whatsapp)
  - [2. Contatos & Tags Unificadas (Pessoas e Grupos)](#2-contatos--tags-unificadas-pessoas-e-grupos)
  - [3. Telefonia VoIP & Chamadas WhatsApp (WebRTC + MLow)](#3-telefonia-voip--chamadas-whatsapp-webrtc--mlow)
  - [4. Flow Builder (Construtor Visual de Chatbots & URAs)](#4-flow-builder-construtor-visual-de-chatbots--uras)
  - [5. Kanban & Gestão de Leads (CRM)](#5-kanban--gestão-de-leads-crm)
  - [6. Filas de Atendimento & Roteamento Inteligente](#6-filas-de-atendimento--roteamento-inteligente)
  - [7. Campanhas & Disparos em Massa](#7-campanhas--disparos-em-massa)
  - [8. Inteligência Artificial, Transcrição (STT) & Voz (TTS)](#8-inteligência-artificial-transcrição-stt--voz-tts)
  - [9. Relatórios, SLA & Métricas de Performance](#9-relatórios-sla--métricas-de-performance)
  - [10. Administração Multi-Tenant, E-mail SMTP, Backup & Segurança](#10-administração-multi-tenant-e-mail-smtp-backup--segurança)
  - [11. Whitelabel Completo](#11-whitelabel-completo)
- [Variáveis de Ambiente (.env)](#-variáveis-de-ambiente-env)
- [Linha de Comando (Flags & Manutenção do Servidor)](#-linha-de-comando-flags--manutenção-do-servidor)
- [Deploy em Produção](#-deploy-em-produção)
- [Resolução de Problemas (Troubleshooting)](#-resolução-de-problemas-troubleshooting)
- [Licença MIT](#-licença-mit)

> 📚 **Guias relacionados:** [Guia de Setup Local (`SETUP.md`)](SETUP.md) · [Catálogo de Funcionalidades (`FUNCIONALIDADES.md`)](FUNCIONALIDADES.md) · [Licença MIT (`LICENSE`)](LICENSE)

---

## 🌟 Visão Geral

O **WaCalls Chat** é uma plataforma open-source moderna para centralizar o atendimento da sua empresa em múltiplos canais. Ele combina a mensageria do WhatsApp (via instâncias multi-dispositivo `whatsmeow` ou **WhatsApp Cloud API** oficial da Meta) com chamadas de voz reais pelo navegador (WebRTC + codec MLow em Pure-Go), construtor visual de chatbots/URAs, sistema unificado de tags e CRM Kanban.

A aplicação é dividida em:
- **Backend em Go (`cmd/server`)**: Binário único, leve e rápido, sem dependência de CGO, com persistência em SQLite (modo WAL ativado), cache opcional em memória ou Redis para escala, sinalização WebRTC nativa, codec MLow integrado e motor WhatsApp multi-dispositivo.
- **Frontend em React 19 + TypeScript (`client`)**: Interface SPA responsiva compilada para `dist/`, com tema claro/escuro, whitelabel dinâmico, editor visual `@xyflow/react`, arraste de cards via `@dnd-kit`, internacionalização (`i18next`) e eventos em tempo real via Server-Sent Events (SSE).

---

## 🚀 Principais Recursos

- 💬 **Multi-atendimento WhatsApp em Tempo Real**: Gerencie várias conexões e operadores simultaneamente em abas organizadas (*Atendendo*, *Aguardando* e *Grupos*), com notas privadas internas e assinatura automática por atendente.
- 🏷️ **Tags Unificadas (Contatos e Grupos)**: Crie, edite, aplique e remova etiquetas coloridas diretamente no cabeçalho da conversa, no painel de detalhes, na tabela de contatos (`/contacts`) e em lote para contatos individuais (`@s.whatsapp.net` / `@lid`) e grupos (`@g.us`), com filtros e atualização instantânea via SSE (`chat-tags`).
- 📞 **Telefonia VoIP & Chamadas WhatsApp**: Realize e receba ligações pelo navegador via WebRTC com codec **MLow** Pure-Go, gravação automática em Opus/WAV, barra de chamada persistente e download protegido por HMAC-SHA256.
- 🔀 **Flow Builder com Nós Visuais**: Monte chatbots e URAs visuais com menus interativos, botões/listas nativas, perguntas abertas, condições Se/Senão, randomizadores A/B, **nós de adicionar/remover tags persistidos no banco**, requisições HTTP, webhooks n8n e simulador embutido.
- 📋 **Kanban CRM Completo**: Quadros (`boards`), etapas (`columns`) e cartões (`cards`) totalmente editáveis e removíveis, com upload de imagens nos cards, datas de vencimento, exibição do atendente responsável, SLA por etapa, Drag & Drop, vínculo direto com chats e automações por eventos.
- 👥 **Filas & Roteamento Round-Robin**: Distribuição balanceada entre agentes com limite de carga simultânea e controle de expediente.
- 📢 **Campanhas & Disparos em Massa**: Envios programados com cadência segura anti-bloqueio, variáveis dinâmicas e segmentação por tag com trava automática que exclui grupos (`@g.us`) das listas de disparo.
- 🎙️ **IA para Transcrição (STT) & Voz (TTS)**: Transcrição automática de áudios recebidos e gravações de chamadas (OpenAI Whisper ou endpoints compatíveis) e síntese de voz (Piper / OpenAI / eSpeak) para URAs.
- 💾 **Backup & Restauração + E-mail SMTP**: Exportação/importação de banco SQLite e mídias em `.zip` direto pelo painel (`/settings/backup`) ou scripts Windows, além de SMTP configurável com teste de envio (`/settings/email`).
- 🏢 **Multi-Tenant, Whitelabel & Segurança 2FA**: Isolamento de dados por empresa (admin tenant + operadores vinculados), customização completa de marca/cores (`/settings/whitelabel`), autenticação 2FA TOTP e controle de sessões simultâneas.

---

## 🛠️ Arquitetura & Tecnologias

### Backend (Go)
| Componente | Tecnologia | Descrição |
|---|---|---|
| **Linguagem** | Go (`go 1.26.4` / compatível `1.22+`) | Alta performance, concorrência nativa e binário único |
| **Banco de Dados** | SQLite (`modernc.org/sqlite`) | Pure-Go, sem CGO, modo WAL com índices multi-tenant |
| **Engine WhatsApp** | `go.mau.fi/whatsmeow` + Cloud API | Multi-Device (QR Code / Pairing Code) e API oficial da Meta |
| **VoIP / WebRTC & Áudio** | `pion/webrtc/v4` + `mlow` | Sinalização WebRTC e codec MLow vendored em Pure-Go |
| **Tempo Real** | Server-Sent Events (SSE) | Notificações em tempo real (`chat-tags`, mensagens, chamadas, metas) |
| **Cache & Fan-out** | Memória / Redis (`go-redis/v9`) | Cache de consultas e suporte opcional a Redis |
| **Criptografia** | AES-GCM, bcrypt & HMAC-SHA256 | Proteção de credenciais Cloud API, senhas e links de áudio |

### Frontend (React + Vite)
| Componente | Tecnologia | Descrição |
|---|---|---|
| **Framework** | React 19 + TypeScript | Interface declarativa com tipagem estrita |
| **Build Tool** | Vite 7 | Compilação rápida para `dist/` com HMR em desenvolvimento |
| **Estilização** | Tailwind CSS v4 + Radix UI | Componentes acessíveis com tema claro/escuro |
| **Flow Canvas** | `@xyflow/react` | Editor visual de fluxos de chatbot e URA |
| **Kanban Drag-and-Drop** | `@dnd-kit/core` & `@dnd-kit/sortable` | Movimentação fluida de cards e colunas |
| **Estado & Queries** | Zustand + TanStack Query v5 | Cache de requisições e estado sincronizado por SSE |
| **Internacionalização** | `i18next` & `react-i18next` | Suporte multi-idioma (`PT-BR`, `EN`, `ES`, `AR` com RTL) |
| **Gráficos & Ícones** | Recharts & Lucide Icons | Dashboards de atendimento, SLA e chamadas |

---

## 📂 Estrutura do Projeto

```text
├── client/                     # Frontend React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/         # Componentes UI e de domínio (Chat, Flow, Kanban, Calls, Campaigns)
│   │   ├── pages/              # Telas (/chats, /contacts, /kanban, /tags, /flows, /campaigns, /settings/*, /help, /features)
│   │   ├── stores/             # Stores Zustand (auth, chats, sessions, theme, calls)
│   │   ├── services/           # Clientes HTTP REST / SSE
│   │   ├── types/              # Interfaces TypeScript compartilhadas
│   │   └── i18n/               # Arquivos de tradução
│   └── package.json            # Dependências e scripts do frontend
│
├── cmd/
│   ├── server/                 # Backend principal WaCalls em Go
│   │   ├── main.go             # Inicialização, flags CLI, -static dist e graceful shutdown
│   │   ├── httpapi.go          # Roteador HTTP, CORS, SSE e SPA static handler
│   │   ├── authapi.go          # Login, usuários, multi-tenant, permissões, 2FA e sessões
│   │   ├── tagapi.go / tagstore.go         # CRUD, vínculo unitário/em lote e SSE de tags
│   │   ├── contactsapi.go / contactsync.go # Contatos, @lid, filtros e importação WhatsApp
│   │   ├── kanbanapi.go / kanbanstore.go   # Quadros, colunas, cards, upload, datas e automações
│   │   ├── flowexec.go / flowexec_chat.go  # Motor de execução de fluxos e nós de tags
│   │   ├── campaignapi.go / campaignrunner.go # Disparo de campanhas e audiência
│   │   ├── backupapi.go        # Exportação/importação de backup (.zip) via painel
│   │   ├── billingapi.go / email_brand.go  # SMTP, templates de e-mail, planos e Free Tier
│   │   ├── license.go          # Validador opcional de licença comercial (desligado na versão livre)
│   │   └── *_test.go           # Suíte de testes automatizados (tags, kanban, fluxos, calls, backup)
│   └── migrate/                # Utilitário CLI de migração SQLite -> MariaDB/MySQL (experimental)
│
├── internal/
│   ├── cache/                  # Cache em memória ou Redis
│   ├── storage/                # Abstração SQLite (WAL)
│   ├── voip/                   # Pilha WebRTC, RTP/SRTP e codec Pure-Go MLow (internal/voip/media/mlow)
│   └── wa/                     # Wrapper whatsmeow e cliente WhatsApp Cloud API
│
├── assets/                     # Ícones (.ico/.png) e banner do projeto
├── media/                      # Mídias de entrada/saída, avatares, Kanban e gravações
├── dist/                       # Saída compilada do frontend Vite (servida automaticamente pelo Go)
├── .env.default                # Modelo padrão de configuração para produção/instalador
├── LICENSE                     # Licença MIT oficial do projeto
├── README.md                   # Documentação principal
├── SETUP.md                    # Guia rápido de instalação e desenvolvimento local
├── FUNCIONALIDADES.md          # Catálogo detalhado de recursos por módulo
├── wacalls.iss / gerar-instalador.bat # Script Inno Setup para gerar WaCalls_Setup_v1.0.0.exe
├── instalador.bat / instalador.ps1    # Instalador e gerenciador interativo Windows
├── iniciar.bat / parar.bat / reiniciar.bat / status.bat # Scripts operacionais Windows
├── backup.bat / backup.ps1 / restaurar.bat / restaurar.ps1 # Backup/restauração local Windows
├── dev.sh                      # Orquestrador de desenvolvimento/build Linux/macOS/WSL
├── instalador.sh               # Instalador automatizado Ubuntu/VPS com Nginx + SSL + systemd
└── package.json                # Scripts raiz de orquestração
```

---

## 💻 Pré-requisitos

- **Node.js**: Versão 20 LTS ou superior ([nodejs.org](https://nodejs.org/))
- **NPM**: Versão 10 ou superior
- **Go**: Versão 1.22 ou superior — projeto configurado em Go `1.26.4` no [`go.mod`](go.mod) ([go.dev/dl](https://go.dev/dl/))
- **Git**: Para clonagem e atualizações ([git-scm.com](https://git-scm.com/))
- **Inno Setup 6** *(opcional, apenas para empacotar o instalador `.exe` no Windows via [`gerar-instalador.bat`](gerar-instalador.bat))*

---

## ⚡ Instalação e Execução Rápida

### Opção Windows: Instalador 1-Clique (`instalador.bat` / `instalador.ps1`)

No Windows, execute [`instalador.bat`](instalador.bat) (ou [`instalador.ps1`](instalador.ps1)) para verificar dependências, compilar frontend e backend, configurar `.env` a partir de [`.env.default`](.env.default) e criar atalhos:

```bat
instalador.bat
```

Scripts operacionais incluídos para Windows:
- **`iniciar.bat` / `WaCalls.vbs`**: Inicia o `wacalls.exe` e abre o painel no navegador (`http://localhost:8080` ou porta configurada no `.env`).
- **`parar.bat` / `parar.vbs`**: Encerra o processo `wacalls.exe` com segurança.
- **`reiniciar.bat`**: Reinicia o servidor.
- **`status.bat`**: Exibe status do processo, memória e portas em escuta.
- **`backup.bat` / `restaurar.bat`**: Realiza backup e restauração local de `wacalls.db` e pasta `media/`.
- **`gerar-instalador.bat`**: Compila `dist/` + `wacalls.exe` e gera o instalador distribuível `dist-installer\WaCalls_Setup_v1.0.0.exe` usando [`wacalls.iss`](wacalls.iss) (Inno Setup 6).
- **`desinstalar.bat`**: Remove atalhos e inicialização automática com o Windows.

---

### Opção Linux / VPS (`instalador.sh`)

Em servidores Ubuntu 22.04+ LTS, utilize [`instalador.sh`](instalador.sh) para provisionar Go, Node.js, compilação completa, serviço `systemd` e proxy reverso Nginx com suporte a SSE e SSL:

```bash
chmod +x instalador.sh
sudo ./instalador.sh
```

---

### Opção 1: Script de Desenvolvimento (`dev.sh`) - Recomendado

Em Linux, macOS ou WSL/Git Bash, o script [`dev.sh`](dev.sh) sobe o backend Go na porta `:3001` e o frontend Vite em `:5173` com verificações automáticas:

```bash
chmod +x dev.sh
./dev.sh
```

Opções disponíveis no `dev.sh`:
```bash
./dev.sh --help       # Exibe ajuda e opções
./dev.sh --setup      # Instala dependências (Go + Node)
./dev.sh --server     # Inicia apenas o backend Go (:3001)
./dev.sh --client     # Inicia apenas o frontend Vite (:5173)
./dev.sh --build      # Compila frontend (dist/) e binário de produção
./dev.sh --clean      # Limpa artefatos temporários de build
```

---

### Opção 2: Via NPM Scripts

Na raiz do projeto:

```bash
# 1. Instalar dependências do frontend (client/) e baixar módulos Go
npm run setup

# 2. Compilar SPA para a pasta dist/
npm run build
```

Para executar em modo desenvolvimento com NPM, abra dois terminais:
- Terminal 1 (Backend Go): `npm run start` *(ou `go run ./cmd/server -addr :3001 -debug` para o proxy padrão do Vite em `client/vite.config.ts`)*
- Terminal 2 (Frontend Vite): `npm run dev` *(acesso em `http://localhost:5173`)*

Para gerar o instalador `.exe` no Windows via NPM:
```bash
npm run build:installer
```

---

### Opção 3: Execução Manual em Dois Terminais

#### Terminal 1 — Backend (Go)
```bash
go mod download
go run ./cmd/server -addr :3001 -debug
```

#### Terminal 2 — Frontend (Vite)
```bash
cd client
npm install
npm run dev
```

Acesse no navegador: **`http://localhost:5173`**

> 💡 Se compilar o frontend com `npm --prefix client run build` (gerando `dist/`) e subir apenas `go run ./cmd/server` (ou `./wacalls.exe`), o próprio servidor Go serve o sistema completo em uma única porta (`http://localhost:8080`, ou conforme `PORT` / `WACALLS_ADDR` no `.env`).

---

## 🔑 Credenciais Padrão

Na primeira execução com o banco vazio, o administrador padrão é criado automaticamente (configurável por flags `-seed-admin-email` e `-seed-admin-password` em [`cmd/server/main.go`](cmd/server/main.go)):

| Campo | Valor Padrão |
|---|---|
| **E-mail** | `wacalls@admin.com` |
| **Senha** | `admin` |

> ⚠️ **IMPORTANTE**: Altere a senha padrão imediatamente após o primeiro login na área de **Usuários & Perfil**.

---

## 📦 Módulos & Funcionalidades

### 1. Chat Multiatendimento & WhatsApp
- **Sessões Multi-Dispositivo**: Conecte múltiplos números WhatsApp via QR Code ou Código de Pareamento de 8 dígitos.
- **WhatsApp Cloud API**: Suporte à API oficial da Meta com credenciais criptografadas (AES-GCM) e webhooks validados por assinatura.
- **Abas e Fluxo de Trabalho**: Separação em **Atendendo**, **Aguardando** e **Grupos**, aceitação, transferência entre operadores/filas e histórico de encerramentos com timeline inline.
- **Notas Privadas**: Registre observações internas dentro da conversa sem enviar mensagens para o cliente no WhatsApp.
- **Mensagens Apagadas Ocultas**: Mensagens revogadas são removidas automaticamente das threads e prévias.
- **Respostas Rápidas (`/atalhos`)**: Templates com variáveis dinâmicas (`{{nome}}`, `{{protocolo}}`, `{{atendente}}`) e anexos de mídia (imagem, vídeo, áudio ou documento até 32 MB).
- **Mensagens Agendadas, Follow-up & Assinatura**: Agendamento por data/hora, lembretes que se cancelam quando o cliente responde e assinatura configurável por operador.

---

### 2. Contatos & Tags Unificadas (Pessoas e Grupos)
- **Tags em Contatos e Grupos**: Aplique e remova etiquetas coloridas tanto em conversas 1:1 (`@s.whatsapp.net` / `@lid`) quanto em **grupos do WhatsApp (`@g.us`)**.
- **Criação Rápida & Busca Inline**: Pesquise tags disponíveis ou crie novas com seletor de cores diretamente no dropdown do cabeçalho do chat (`/chats`), no painel lateral de detalhes ou na tela de Contatos (`/contacts`).
- **Gerenciamento em Lote**: Selecione múltiplos contatos e grupos na tela `/contacts` e aplique ou remova tags em massa via `POST /api/tags/bulk/attach` e `POST /api/tags/bulk/detach`.
- **Filtros & Tempo Real (SSE)**: Filtre conversas por tag em *Aguardando*, *Atendendo* e *Grupos* ou na listagem `/contacts?tagId=...`, com sincronização instantânea entre abas/operadores pelo evento SSE `chat-tags`.
- **Gestão Centralizada (`/tags` e `/contacts`)**: CRUD completo de etiquetas por tenant, importação/sincronização de agenda do WhatsApp e resolução de números ocultos (`@lid`).

---

### 3. Telefonia VoIP & Chamadas WhatsApp (WebRTC + MLow)
- **Discador Integrado**: Realize chamadas de áudio diretamente pelo painel para contatos ou números em formato E.164.
- **Codec Pure-Go MLow & WebRTC**: Receba e atenda ligações do WhatsApp no navegador sem plugins ou DLLs extras.
- **Gravação Automática & Links Assinados**: Gravação em Opus/WAV com player embutido no histórico e download protegido por HMAC-SHA256 com expiração.
- **Barra de Chamada Persistente**: Controles globais de mudo (Mute), música de espera (Hold) e encerramento durante toda a navegação.

---

### 4. Flow Builder (Construtor Visual de Chatbots & URAs)
Editor no-code/low-code em `@xyflow/react` (`/flows`, `/flows/:id`):

```text
[Início] ──> [Menu / Botões] ──┬─ (1: Vendas)  ──> [Marcar Tag: VIP] ──> [Fila: Comercial]
                               ├─ (2: Suporte) ──> [Se/Senão: Horário] ──> [Atendente]
                               └─ (3: Outros)  ──> [Requisição HTTP / n8n Webhook]
```

- **Conteúdo**: `Texto` e `Conteúdo / Mídia` (imagem, vídeo, áudio e documento com variáveis).
- **Interação**: `Menu`, `Msg Interativa` (botões nativos ou listas), `Pergunta Aberta` (salva em variável) e `Intervalo`.
- **Lógica & Sistema**: `Se / Senão`, `Randomizador` A/B, `Fila`, `Marcar Tag` (`chat_tag_add` — busca ou cria a tag no tenant e persiste no contato/grupo com SSE), `Remover Tag` (`chat_tag_remove`) e `Trocar Fluxo`.
- **Integrações & Testes**: `Variável`, `Requisição HTTP` (com mapeamento JSON para variáveis), `n8n Webhook` e **Simulador integrado**.

---

### 5. Kanban & Gestão de Leads (CRM)
- **CRUD Completo (`/kanban`)**: Crie, edite e exclua quadros (`boards`), etapas (`columns`) e cartões (`cards`).
- **Cartões Ricos**: Suporte a imagem de capa com upload direto (`/api/kanban/upload`), data de vencimento (`dueAt`), cor, descrição, exibição do atendente responsável (`assigneeId`) e vínculo direto com o chat do WhatsApp.
- **Movimentação & SLA**: Drag & Drop fluido (`@dnd-kit`), SLA configurável em horas por coluna com destaque visual de atraso e tipos de etapa (`open`, `won`, `lost`).
- **Automações**: Mova ou crie cards automaticamente a partir de gatilhos (`replied`, `answered_call`, `new_contact`).

---

### 6. Filas de Atendimento & Roteamento Inteligente
- **Distribuição Round-Robin**: Balanceamento automático de novos atendimentos entre operadores da fila.
- **Controle de Carga & Expediente**: Limite de atendimentos simultâneos por agente, configuração de horários por dia da semana e mensagem automática fora de horário.

---

### 7. Campanhas & Disparos em Massa
- **Segmentação por Tags e Contatos (`/campaigns`)**: Monte listas manualmente, via CSV ou importando contatos por tag (`/api/tags/{id}/chats`).
- **Trava de Segurança para Grupos**: Grupos (`@g.us`) marcados com tags são automaticamente filtrados ao carregar destinatários de uma tag em campanhas.
- **Cadência Anti-Bloqueio**: Intervalos aleatórios entre disparos, janelas de horário/dias úteis e acompanhamento de progresso em tempo real.

---

### 8. Inteligência Artificial, Transcrição (STT) & Voz (TTS)
- **Speech-to-Text (STT)**: Transcrição automática e pesquisável de áudios recebidos e chamadas via OpenAI Whisper ou servidor compatível (`WACALLS_STT_URL`).
- **Text-to-Speech (TTS)**: Síntese de voz para URAs via Piper, OpenAI TTS ou eSpeak (`WACALLS_TTS_URL` / `OPENAI_API_KEY`).

---

### 9. Relatórios, SLA & Métricas de Performance
- **Dashboard (`/reports`)**: Volume de atendimentos, chamadas realizadas/recebidas/atendidas, Tempo Médio de Primeira Resposta (TMR) e Tempo Médio de Atendimento (TMA).
- **CSAT & Ranking**: Coleta automática de pesquisa de satisfação ao finalizar atendimentos e ranking individual por operador.

---

### 10. Administração Multi-Tenant, E-mail SMTP, Backup & Segurança
- **Multi-Tenancy (`/admin/users`)**: Usuários raiz por empresa com gerenciamento de operadores/sub-usuários, permissões granulares e vínculo por filas/conexões.
- **Autenticação 2FA (TOTP) & Sessões**: Suporte a Google Authenticator/Authy, rate limit de login e limite configurável de logins simultâneos (`WACALLS_MAX_SESSOES`).
- **Configuração SMTP & E-mail (`/settings/email`)**: Cadastro de servidor SMTP com teste de envio (`/api/billing/smtp/test`), verificação de conta por código e fluxo completo de recuperação de senha (`/reset-password`).
- **Backup & Restauração (`/settings/backup`)**: Painel administrativo com estatísticas do banco/mídias e exportação/importação em `.zip` (além dos scripts locais `backup.bat` / `restaurar.bat`).
- **Free Tier & Cobrança**: Controle opcional de cotas gratuitas e planos via Stripe configuráveis pelo administrador SaaS.

---

### 11. Whitelabel Completo
Em `/settings/whitelabel`: personalize nome do sistema, nome curto, logotipos para temas claro e escuro, favicon, splash screen, paleta de cores primária e links institucionais.

---

## ⚙️ Variáveis de Ambiente (.env)

O servidor carrega automaticamente o arquivo `.env` no diretório de execução (veja também [`.env.default`](.env.default)):

```bash
# ==============================================================================
# SERVIDOR, REDE E BANCO DE DADOS
# ==============================================================================
WACALLS_ADDR=:8080                     # Endereço/porta de escuta HTTP (ou use PORT=8080)
WACALLS_DB=wacalls.db                  # Caminho do banco SQLite
WACALLS_DEBUG=false                    # Ativar logs detalhados (true/false ou 1)
DB_DRIVER=sqlite                       # Driver do banco (sqlite com modo WAL)
REDIS_URL=redis://127.0.0.1:6379/0     # Redis opcional para cache/fan-out distribuído
WACALLS_ALLOWED_ORIGINS=               # Origens CORS extras separadas por vírgula

# ==============================================================================
# SEGURANÇA, SESSÕES E LICENCIAMENTO
# ==============================================================================
SESSION_SECRET=troque-por-chave-forte-aleatoria    # Criptografia de credenciais Cloud API
RECORDING_SIGNING_KEY=troque-por-chave-hmac-16chars # Assinatura HMAC para links de áudio
WACALLS_MAX_SESSOES=1                              # Máximo de logins simultâneos por usuário
WACALLS_LICENSE_REQUIRED=0                         # 0 = versão livre MIT (padrão)

# ==============================================================================
# TRANSCRIÇÃO (STT) & SÍNTESE DE VOZ (TTS)
# ==============================================================================
OPENAI_API_KEY=                                    # Chave OpenAI opcional para TTS/STT em nuvem
WACALLS_STT_URL=https://api.openai.com/v1/audio/transcriptions
WACALLS_STT_AUTH=Bearer sk-proj-seu-token
WACALLS_STT_MODEL=whisper-1
WACALLS_STT_LANG=pt
WACALLS_STT_MODE=multipart                         # "multipart" (OpenAI) ou "raw"

WACALLS_TTS_URL=http://127.0.0.1:5005/api/tts
WACALLS_TTS_AUTH=
WACALLS_TTS_VOICE=pt_BR-faber-medium

# ==============================================================================
# SAUDAÇÃO NO PAREAMENTO
# ==============================================================================
WACALLS_WELCOME=on                     # "on" ativa saudação ao conectar novo WhatsApp, "off" desativa
WACALLS_WELCOME_MESSAGE=✅ WhatsApp conectado com sucesso!
```

---

## 💻 Linha de Comando (Flags & Manutenção do Servidor)

O binário compilado (`wacalls` no Linux/macOS ou `wacalls.exe` no Windows) oferece flags de execução e manutenção direta:

```bash
# Iniciar em porta e banco customizados especificando o build SPA
./wacalls -addr :8080 -db wacalls.db -static ./dist

# Listar usuários cadastrados no banco
./wacalls -db wacalls.db -list-users

# Criar ou redefinir senha de administrador diretamente via CLI
./wacalls -db wacalls.db -reset-admin-email "wacalls@admin.com" -reset-admin-password "NovaSenhaSegura123"

# Customizar seed inicial em instalações novas e limite de chamadas simultâneas por conexão
./wacalls -max-calls-per-session 8 -seed-admin-email "admin@empresa.com" -seed-admin-password "SenhaForte"
```

*(Outras flags disponíveis em `main.go`: `-debug`, `-license`, `-license-info`.)*

---

## 🚀 Deploy em Produção

### 1. Build do Frontend
```bash
npm --prefix client install
npm --prefix client run build
```
O Vite gera os arquivos otimizados em `./dist` (auto-detectados pelo servidor Go).

### 2. Build do Backend Go
```bash
go build -ldflags="-s -w" -o wacalls ./cmd/server
```
*(No Windows: `-o wacalls.exe` ou execute `gerar-instalador.bat` para gerar o `.exe` de instalação completo em `dist-installer/`.)*

### 3. Exemplo de Serviço Systemd (`/etc/systemd/system/wacalls.service`)
```ini
[Unit]
Description=WaCalls Chat Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/wacalls
ExecStart=/opt/wacalls/wacalls -addr :8080 -db /opt/wacalls/wacalls.db -static /opt/wacalls/dist
Restart=always
RestartSec=5
Environment=SESSION_SECRET=umaChaveMuitoLongaESegura123456
Environment=WACALLS_WELCOME=off

[Install]
WantedBy=multi-user.target
```

### 4. Configuração Reversa Nginx (com WebSockets e SSE)
```nginx
server {
    server_name chat.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Configurações essenciais para SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## ❓ Resolução de Problemas (Troubleshooting)

| Sintoma | Causa Mais Provável | Como Resolver |
|---|---|---|
| `vite: command not found` | Dependências do `client/` não instaladas | Execute `npm run setup` na raiz ou `npm install` dentro de `client/` |
| `proxy error: /api/... ECONNREFUSED` | Backend Go não está em execução | Inicie o backend na porta `:3001` (`./dev.sh`, `npm run start` ou `go run ./cmd/server -addr :3001`) |
| `404` nas rotas do painel em produção | Pasta `dist/` ausente ou desatualizada | Execute `npm --prefix client run build` na raiz |
| Login rejeitado com admin padrão | Banco `wacalls.db` já possui usuários | Redefina com `-reset-admin-email` / `-reset-admin-password` ou remova `wacalls.db*` |
| Mensagens e tags (`chat-tags`) não atualizam ao vivo | Buffer ativo no proxy reverso | Adicione `proxy_buffering off;` no Nginx |
| Gravação/ligação sem áudio | Microfone bloqueado ou contexto não-HTTPS | Permita o microfone e sirva via HTTPS em produção (ou `localhost` localmente) |
| Áudio de URA mudo no fluxo | TTS (Piper/OpenAI) não configurado | Verifique `WACALLS_TTS_URL` ou `OPENAI_API_KEY` |

---

## 📄 Licença MIT

Este projeto é software livre distribuído sob a **Licença MIT**. Consulte também o arquivo [`LICENSE`](LICENSE).

```text
MIT License

Copyright (c) 2026 Humberto Moura

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

> Nota: componentes de terceiros incorporados ao repositório mantêm suas respectivas atribuições MIT originais (como o codec MLow em [`internal/voip/media/mlow/README.md`](internal/voip/media/mlow/README.md)).

---

<div align="center">
  <sub>Desenvolvido por Humberto Moura · Licenciado sob os termos da Licença MIT.</sub>
</div>
