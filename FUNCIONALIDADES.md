# Documentação de Funcionalidades — WaCalls Chat

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Este catálogo detalha todas as funcionalidades implementadas no **WaCalls Chat**, organizadas por módulo do sistema, refletindo o comportamento atual do frontend (`client/`) e do backend em Go (`cmd/server/`).

---

## 1. Módulo de Chat e Atendimento (`/chats`)
- **Chat Multicanal em Tempo Real:** Comunicação simultânea via **múltiplas instâncias WhatsApp (`whatsmeow`)** — pareamento por QR Code ou Código de Pareamento — e suporte à **WhatsApp Cloud API oficial da Meta** (credenciais protegidas com AES-GCM).
- **Organização em Abas e Filtros:** Separação dos atendimentos em **Atendendo**, **Aguardando** e **Grupos**, com filtros por não lidas, tags e ordenação, além de aceitação, transferência entre operadores/filas e devolução para fila.
- **Envio Rico de Mídias e Interações:** Texto, imagens (visualizador com zoom, giro e download), vídeos, áudios gravados com onda sonora ao vivo, documentos e colagem direta da área de transferência (`Ctrl+V`). Suporta responder citando, encaminhar, editar, apagar mensagens e reagir com emojis.
- **Notas Privadas Internas:** Permite registrar observações amarelas internas visíveis apenas aos atendentes na timeline da conversa, sem enviar nada ao cliente no WhatsApp.
- **Mensagens Apagadas Ocultas:** Mensagens revogadas são removidas automaticamente da thread e das prévias da lista lateral.
- **Respostas Rápidas (`/atalhos`):** Snippets reutilizáveis com variáveis dinâmicas (`{{nome}}`, `{{protocolo}}`, `{{atendente}}`), contador de uso e anexo de mídia (imagem, vídeo, áudio ou documento de até 32 MB) enviado com o texto como legenda.
- **Assinatura, Saudação e Follow-up:** Assinatura automática do atendente ligável/desligável por conversa, saudação no pareamento (`WACALLS_WELCOME` / `WACALLS_WELCOME_MESSAGE`), **agendamento de mensagens** por data/hora e **follow-up automático** (cancelado caso o cliente responda).
- **Histórico & Motivos de Encerramento:** Fechamento individual ou em lote com motivo obrigatório/opcional e linha do tempo inline no painel de detalhes do contato.
- **Execução Manual de Fluxo e Alertas Sonoros:** Disparo manual de um chatbot dentro do chat e avisos sonoros para novas mensagens e atendimentos em espera.

---

## 2. Contatos & Tags Unificadas (`/contacts` e `/tags`)
- **Tags em Pessoas e Grupos:** Sistema unificado de etiquetas coloridas compatível tanto com contatos individuais (`@s.whatsapp.net` / `@lid`) quanto com **grupos do WhatsApp (`@g.us`)**.
- **Busca e Criação Inline no Chat:** No cabeçalho do atendimento (`/chats`), no painel lateral de detalhes ou na tabela de contatos, é possível buscar tags existentes e criar novas tags com seletor de cores na hora.
- **Ações em Lote (`/contacts`):** Seleção múltipla de contatos e grupos para **aplicar ou remover etiquetas em massa** com um clique (`POST /api/tags/bulk/attach` e `POST /api/tags/bulk/detach`).
- **Filtros & Tempo Real (SSE):** Filtragem de conversas por tag em *Aguardando*, *Atendendo* e *Grupos*, além de filtragem direta em `/contacts?tagId=...`, com sincronização instantânea entre operadores via evento SSE `chat-tags`.
- **Agenda Sincronizada & Resolução `@lid`:** Sincronização automática de nomes e avatares do WhatsApp, edição de contato, importação e resolução transparente de identificadores `@lid`.

---

## 3. Kanban CRM (`/kanban`)
- **CRUD Completo de Quadros, Colunas e Cards:** Criação, renomeação, edição, reordenação e exclusão de quadros (`boards`), etapas (`columns`) e cartões (`cards`), além de templates prontos (Atendimento, Vendas, Suporte).
- **Cards Ricos com Imagens, Datas e Atendente:** Upload e exibição de **imagem no card** (`/api/kanban/upload`), **data de vencimento (`dueAt`)**, descrição, cor de destaque e **identificação automática do atendente responsável (`assigneeId`)** que realizou o atendimento.
- **Drag & Drop e SLA por Coluna:** Movimentação fluida entre colunas e quadros, cálculo de SLA (horas por etapa) com alertas visuais de atraso e tipos de etapa (`open`, `won`, `lost`).
- **Vínculo com Chat & Automações:** Vincule conversas direto a um card pela tela de chat e configure automações por evento (`replied`, `answered_call`, `new_contact`).

---

## 4. Flow Builder — Construtor Visual de Chatbots e URAs (`/flows`)
- **Editor Visual em Canvas (`@xyflow/react`):** Monte fluxos ligando blocos por arraste e solte, com ativação por palavras-chave, vínculo direto por conexão, detecção de saídas desconectadas e duplicação de fluxos.
- **Blocos de Conteúdo e Interação:** `Texto`, `Mídia` (imagem/vídeo/áudio/documento), `Menu` numerado, `Msg Interativa` (botões e listas nativas), `Pergunta Aberta` (armazena em variável) e `Intervalo`.
- **Lógica, Tags e Roteamento:** `Se / Senão`, `Randomizador` com pesos A/B, `Trocar Fluxo`, `Fila` e nós de **`Marcar Tag` (`chat_tag_add`)** / **`Remover Tag` (`chat_tag_remove`)** com persistência real no banco e notificação SSE no chat.
- **Integrações & Simulador Embutido:** Blocos de `Variável`, `Requisição HTTP` (com captura de resposta JSON) e `n8n Webhook`, além de simulador interno para testar o fluxo antes de publicar.

---

## 5. Campanhas & Disparos em Massa (`/campaigns`)
- **Multi-Formato e Variáveis:** Envios programados com texto, imagem, áudio, vídeo ou documento e substituição dinâmica de campos do contato (`{{nome}}`, etc.).
- **Audiência Flexível com Trava Anti-Grupos:** Seleção por lista manual, importação CSV, conversas recentes ou por **tag** — com **proteção automática que exclui grupos (`@g.us`)** dos destinatários ao importar por tag.
- **Controles Anti-Bloqueio e Métricas:** Rodízio automático entre conexões conectadas, intervalo aleatório entre disparos, limite por hora/dia, aquecimento progressivo, janela de horário/dias úteis, pausa/retomada e acompanhamento por status (enviadas, na fila e falhadas).

---

## 6. Telefonia VoIP & Chamadas WhatsApp (WebRTC + Codec MLow)
- **Discador Integrado & Flutuante:** Chamadas de áudio reais pelo navegador via WebRTC utilizando números E.164 e o **codec Pure-Go MLow** integrado (sem dependências nativas externas).
- **Identificação e Controle de Chamada:** Exibição de nome e foto do contato ao receber ou realizar ligações, janela de toque para atender/recusar e barra flutuante persistente (Mute, Hold e Desligar) em qualquer página.
- **Gravação e Links Assinados:** Gravação automática em Opus/WAV com player integrado nos relatórios e download protegido por assinatura HMAC-SHA256 com tempo de expiração.

---

## 7. Inteligência Artificial (STT & TTS)
- **Transcrição de Áudio (STT):** Conversão automática e pesquisável de mensagens de voz e gravações de chamadas em texto via OpenAI Whisper ou serviço compatível (`WACALLS_STT_URL`).
- **Síntese de Voz (TTS):** Geração de áudios para atendimento/URA via Piper, OpenAI TTS ou eSpeak (`WACALLS_TTS_URL` / `OPENAI_API_KEY`).

---

## 8. Gestão de Filas e Roteamento (`/queues`)
- **Distribuição Automática:** Estratégias configuráveis por fila (`round-robin`, menor carga, aleatório ou manual).
- **Controle de Carga & Visibilidade:** Limite máximo de atendimentos simultâneos por agente e escopo isolado de filas e conexões por usuário.
- **Expediente e Fora de Horário:** Horários por dia da semana, fuso horário, feriados e disparo de mensagem automática fora do expediente.

---

## 9. Dashboard, Relatórios & SLA (`/reports`)
- **KPIs e Gráficos de Atendimento:** Volume de chamadas e atendimentos por período (7, 30 ou 90 dias), filtrados por conexão.
- **Monitoramento de SLA:** Tempo Médio de Primeira Resposta (TMR), Tempo Médio de Atendimento (TMA), taxa de cumprimento e alertas de conversas próximas ao estouro do SLA.
- **Ranking de Agentes & CSAT:** Desempenho comparativo por operador, motivos de encerramento frequentes e pesquisa de satisfação (**CSAT**) enviada após o fechamento.

---

## 10. Administração Multi-Tenant, E-mail SMTP, Backup & Segurança
- **Multi-Tenancy e Permissões (`/admin/users`):** Suporte a múltiplas empresas isoladas (usuário raiz + operadores), permissões granulares por módulo, trava de segurança de administrador único e histórico auditável de alterações de papel.
- **Autenticação 2FA (TOTP) e Sessões:** Proteção opcional em duas etapas (Google Authenticator/Authy), rate limit de autenticação e teto de logins simultâneos configurável (`WACALLS_MAX_SESSOES`).
- **E-mail SMTP e Recuperação de Senha (`/settings/email` & `/reset-password`):** Configuração de servidor SMTP com botão de teste (`/api/billing/smtp/test`), verificação por código e redefinição de senha via e-mail com revogação de sessões antigas.
- **Backup & Restauração (`/settings/backup`):** Estatísticas do banco SQLite (modo WAL) e mídias, exportação em `.zip` e restauração direta pelo painel, além de utilitários Windows ([`backup.bat`](backup.bat) / [`restaurar.bat`](restaurar.bat)).
- **Planos & Free Tier:** Controles opcionais de cotas gratuitas e integração Stripe para cobrança recorrente em modo SaaS.

---

## 11. Whitelabel, Idiomas & Empacotamento
- **Whitelabel Completo (`/settings/whitelabel`):** Nome do sistema, logotipos claro/escuro, favicon, splash screen, paleta de cores e prévia em tempo real.
- **Multi-idioma e Temas:** Tema claro/escuro e tradução em **4 idiomas** (`PT-BR`, `EN`, `ES` e `AR` com suporte RTL).
- **Instaladores e Deploy:** Instalador Windows 1-clique ([`instalador.bat`](instalador.bat)), empacotador `.exe` via Inno Setup ([`gerar-instalador.bat`](gerar-instalador.bat) + [`wacalls.iss`](wacalls.iss)) e provisionamento automatizado Ubuntu/VPS com Nginx + SSL + `systemd` ([`instalador.sh`](instalador.sh)).

---

## 12. Licença MIT

O **WaCalls Chat** é distribuído como software de código aberto sob os termos da **Licença MIT** ([`LICENSE`](LICENSE)):

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

> Componentes de terceiros incorporados ao projeto preservam suas licenças originais compatíveis (como o codec MLow em [`internal/voip/media/mlow/README.md`](internal/voip/media/mlow/README.md)).

---
*Documentação atualizada em novembro de 2026.*
