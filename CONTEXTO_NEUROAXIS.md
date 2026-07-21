# CONTEXTO_NEUROAXIS.md

> Documento de contexto gerado em 2026-07-20 para planejamento de um **app mobile companion** do NEUROAXIS. Escrito a partir da leitura direta do código-fonte atual (não commitado em sua maior parte — ver seção 9) e da memória de sessões anteriores.

---

## 0. Atualização — 2026-07-21 (mudanças desta sessão, ainda não refletidas no resto do documento)

O restante deste documento é um snapshot de 2026-07-20. Desde então, numa única sessão, foram feitas as seguintes mudanças (nenhuma commitada ainda — ver seção 9 atualizada):

### 0.1 Redesenho de UI: shell só-chat + duas gavetas deslizantes

`dashboard.html` deixou de ser 3-colunas fixas (sidebar | chat | rpanel). Agora:
- Janela abre mostrando **só o chat**, full-width.
- Ícone `☰` no canto superior esquerdo da topbar abre **gaveta esquerda** (`#drawer-left`, overlay deslizante, não redimensiona o chat): CPU/RAM (sparklines), temperatura, bateria, estabilidade 24h, armazenamento, gerenciador de processos — os três últimos agrupados em blocos `#widget-perf`/`#widget-storage`/`#widget-taskmgr` com `id` próprio pra suportar reorder/hide (ver 0.3).
- Ícone `⚙` no canto superior direito abre **gaveta direita** (`#drawer-right`) com 4 abas internas: **Configurações** (atalho, API key, insights + botão "Abrir configurações completas" que chama `nx.openConfigWindow()` → IPC `config:open-window` → abre a janela `config.html` já existente, em vez de duplicar os campos), **Presets**, **Mídia**, **Personalização**.
- Backdrop fecha a gaveta aberta ao clicar fora; `Esc` também fecha.

### 0.2 Sistema de tema

4 paletas prontas (`THEMES` em `dashboard.html`: `default`/`ocean`/`ember`/`forest`), aplicadas via `document.documentElement.style.setProperty()` nas CSS custom properties já existentes (`--purple`, `--cyan`, etc). Os pontos que tinham cor hardcoded em JS (canvas de CPU/RAM, canvas de estabilidade/anomalias) foram refatorados pra ler a cor via `getThemeColor()` (`getComputedStyle`), senão o gráfico ficava com a cor antiga "grudada" ao trocar de tema. Tema escolhido persiste em `AppConfig.theme` (novo campo).

### 0.3 Reorder/hide de widgets da gaveta esquerda

Aba Personalização tem lista com ▲▼ (reordenar) + checkbox (mostrar/ocultar) pros 3 blocos (`perf`/`storage`/`taskmgr`). Persistido em `AppConfig.layout = { order: string[], hidden: string[] }` (novo campo). Aplicado via `appendChild` (reordena nós DOM existentes) + classe `.widget-hidden` (`display:none`, sem parar a telemetria de baixo).

### 0.4 Presets por voz + `presetsStore.ts`

**Problema achado e corrigido:** `presets.json` (em `src/config/`) era lido/escrito diretamente por 4 lugares diferentes (`runPreset.ts`, `tray.ts`, `router.ts`, `main.ts`) e ficava em `dist/config/presets.json` — **`npm run build` sobrescrevia qualquer preset criado em runtime**, porque `copy-assets.mjs` recopia `src/config/presets.json` → `dist/config/presets.json` toda vez. Corrigido com `src/services/presetsStore.ts`: `electron-store` própria (nome `"presets"`), seedada do `presets.json` estático só na primeira execução (se o store estiver vazio); depois disso o arquivo estático nunca mais é tocado. Os 4 consumidores migrados pra ler/escrever pelo store.

Nova ação do brain: `create_preset` — "crie o preset assassins creed" faz o brain gerar, no mesmo JSON, um preset com `actions` internas combinando os tipos já existentes (`play_music`, `open_app`, etc), salvo via `src/actions/createPreset.ts` → `presetsStore.savePreset()`. `runPreset.ts` também passou a rodar as ações via `routeAction()` (`router.ts`) em vez de manter um switch duplicado próprio — o switch antigo estava **faltando casos** (`media_control`, `window_management`, `system_info`, `clipboard_read` não funcionavam dentro de presets antes dessa mudança).

### 0.5 Saudação falada no boot

`main.ts`, dentro de `app.on("ready")`: `speak("Oi! O que faremos hoje?")` — dispara **uma vez por processo** (não repete ao reabrir a janela do dashboard, só num restart completo do app).

### 0.6 Dead code removido (resolve a seção 6.2 abaixo)

`chat.html`, `preload-chat.ts`, `voice-overlay.html`, `preload-voice.ts` deletados — confirmado via grep que nada em `src/` os referenciava. `copy-assets.mjs` limpo (removida a cópia condicional desses arquivos).

### 0.7 Bug de TTS (seção 6.1 abaixo) — causa raiz confirmada e corrigida

Rodei o app de verdade (fora do sandbox padrão — precisou `env -u ELECTRON_RUN_AS_NODE`, que vem setado por padrão no ambiente de execução de agente e força o Electron a rodar em modo Node puro, sem `app`/`BrowserWindow`/`ipcMain`) e capturei o erro real que antes morria em silêncio:

```
[TTS] falha na síntese neural (msedge-tts): Connect Error: [object Object]
```

Confirma a hipótese da seção 6.1: `msedge-tts` falha ao conectar no backend da Microsoft (rede/token — problema conhecido e recorrente desse pacote não-oficial). Correção em `src/services/tts.ts`:
- Todo ponto de falha agora loga (`console.error`) em vez de engolir o erro em silêncio.
- **Fallback automático pra SAPI offline do Windows** (`System.Speech.Synthesis` via PowerShell) sempre que o `msedge-tts` falhar (síntese, playback MCI, ou spawn do PowerShell) — o app não fica mais completamente mudo sem motivo.
- Adicionado `ProsodyOptions` (rate `-8%`, pitch `-3%`) na chamada neural, pra soar menos robótico/apressado quando o `msedge-tts` de fato conectar.
- Voz trocada pra masculina nos dois caminhos: neural agora é `pt-BR-AntonioNeural` (era `FranciscaNeural`); fallback SAPI agora prefere `Gender -eq 'Male'` entre vozes de cultura `pt*` instaladas, caindo pra qualquer voz `pt*` se não achar macho.

**Pendência aberta:** o usuário instalou a voz "Microsoft Daniel" (pt-BR, masculina) via Configurações do Windows, mas ela é uma voz **OneCore** (`HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`) — **invisível pro SAPI clássico** (`System.Speech.Synthesis`, `HKLM:\SOFTWARE\Microsoft\Speech\Voices\Tokens`) que o fallback usa. Confirmado por inspeção direta do registro nas duas máquinas — só "Microsoft Maria" (pt-BR, Female) e "Microsoft Zira" (en-US, Female) aparecem pro SAPI clássico; o Daniel só existe do lado OneCore. Duas soluções identificadas, nenhuma aplicada ainda (usuário adiou — "deixa pra lá"):
1. **Ponte de registro** (recomendada): copiar a chave `MSTTS_V110_ptBR_DanielM` de `Speech_OneCore\Voices\Tokens` pra `Speech\Voices\Tokens` (script já escrito e entregue ao usuário, precisa rodar como Administrador uma vez — sessão do agente não é admin, não pôde rodar sozinho).
2. Reescrever o fallback pra usar a API `Windows.Media.SpeechSynthesis` (WinRT, já enxerga vozes OneCore nativamente) em vez de `System.Speech` — não precisa admin, mas interop assíncrono WinRT via PowerShell `-EncodedCommand`/`-WindowStyle Hidden` é bem mais frágil.

Até essa pendência ser resolvida, o fallback offline continua falando com a Maria (feminina), não o Daniel.

### 0.8 Config: novos campos em `AppConfig`

```typescript
interface UiLayout { order: string[]; hidden: string[]; }
interface AppConfig {
  // ...campos já existentes (shortcut, autoLaunch, silenceMs, maxRecordMs, voice, sttModel, brainModel, chatHistoryTurns, chatIdleResetMs, serverPort)
  theme: string;      // "default" | "ocean" | "ember" | "forest"
  layout: UiLayout;   // ordem/visibilidade dos widgets da gaveta esquerda
}
```

---

## 1. Visão geral do projeto

**NEUROAXIS** (nome de produto também referido como "Jarvis PC" na especificação original) é um assistente de voz desktop pessoal para Windows, construído em Electron + TypeScript. Roda inteiramente em segundo plano, vivendo como ícone na bandeja do sistema (system tray), sem aparecer na barra de tarefas.

Fluxo central: usuário pressiona um atalho de teclado global (`Ctrl+Shift+J` por padrão) de qualquer lugar do sistema → fala um comando em português do Brasil → o app grava o áudio, transcreve, decide a intenção via LLM, executa a ação real no Windows (abrir programas, tocar música, controlar volume, tirar screenshot, consultar sistema, etc.) e fala a resposta de volta em voz sintetizada.

É um projeto de uso pessoal real (não um protótipo/MVP descartável) do usuário Zak (zakduwe@gmail.com), rodando em Windows 11 Pro.

**O motivo de existir o app mobile companion:** o NEUROAXIS já expõe um servidor HTTP+WebSocket local (`src/services/server.ts`, porta 4200) pensado desde o início como ponte para um cliente mobile — autenticado por token, com rota de comando de texto e streaming de áudio via WebSocket. Isso já está implementado no lado desktop; falta o app mobile em si.

---

## 2. Stack técnica completa

### Desktop (NEUROAXIS em si)

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Electron | `^31.7.7` |
| Linguagem | TypeScript | `^5.5.4` (compila para CommonJS em `dist/`) |
| Node.js | processo principal (main) | via Electron 31 |
| STT (transcrição) | Groq API — Whisper (`whisper-large-v3` ou `whisper-large-v3-turbo`) | via REST `https://api.groq.com/openai/v1/audio/transcriptions` |
| Brain (decisão de intenção) | Groq API — Llama (`llama-3.3-70b-versatile` ou `llama-3.1-8b-instant`) | via REST `https://api.groq.com/openai/v1/chat/completions`, `response_format: json_object` |
| TTS (síntese de voz) | `msedge-tts` (^1.3.4) — voz neural `pt-BR-AntonioNeural`, gera MP3 via streaming da API não-oficial do Edge Read Aloud; **fallback automático pra SAPI offline** (`System.Speech.Synthesis`) se o msedge-tts falhar (ver seção 0.7) | reproduzido localmente via PowerShell + `winmm.dll` (MCI), ou via SAPI direto no fallback |
| Persistência local | `electron-store` (^8.2.0) | API key, overrides de config, token do servidor mobile |
| Auto-start | `auto-launch` (^5.0.6) | registra o app para iniciar com o Windows |
| Instalador | `electron-builder` (^24.13.3) | gera `.exe` NSIS |
| Áudio (gravação) | Web Audio API no renderer (`recorder.html`, janela oculta) → IPC → main | MediaRecorder produz WebM/Opus |
| Ações de sistema | `child_process` do Node → PowerShell (scripts inline, P/Invoke via `Add-Type`) | sem dependências nativas compiladas |
| Servidor local (bridge mobile) | HTTP + WebSocket nativos do Node.js (`node:http`), **zero dependências extras** — implementação manual do handshake WS (RFC 6455) | porta 4200 (configurável) |
| Notificações | Electron `Notification` API nativa do Windows | |

Não há build tool de frontend (webpack/vite) — os arquivos `.html` do renderer são estáticos, copiados para `dist/` via `scripts/copy-assets.mjs`, e os preloads são compilados pelo `tsc` normal junto com o resto do projeto.

### Mobile (app companion — a construir)

Ainda não existe código do app mobile. O que já existe do lado desktop e que o app mobile vai consumir:

- **Autenticação:** token hex de 32 bytes (64 chars), gerado uma vez e persistido via `electron-store` (`getOrCreateServerToken()` em `src/main/config.ts`). Enviado como `Authorization: Bearer <token>` em toda requisição HTTP e no handshake do WebSocket.
- **`GET /api/health`** → `{ status: "ok", version, wsClients }` — healthcheck simples.
- **`POST /api/command`** → body `{ text: string }` → resposta `{ reply: string }`. Roda o mesmo pipeline de decisão (brain) + execução de ação que o desktop usa, mas sem STT — o app mobile precisa mandar texto já transcrito (ou usar o WS de áudio abaixo).
- **`WS /api/stream`** → cliente manda frames binários de áudio (cada mensagem binária = um arquivo de áudio completo, tratado como unidade); servidor transcreve via Groq Whisper, decide e executa, e responde com frames de texto JSON: `{type:"transcript",text}`, depois `{type:"reply",reply}`, ou `{type:"error",error}`. Também aceita frame de texto `{"type":"command","text":"..."}` para pular a etapa de áudio.
- **Telemetria via WS:** a cada 5s, se houver clientes WS conectados, o servidor faz broadcast de `{type:"telemetry", ...SystemTelemetry}` com CPU/RAM/disco/bateria/processos.
- CORS liberado (`Access-Control-Allow-Origin: *`) — não há whitelist de origem, só o token protege o acesso.
- Servidor faz bind em `0.0.0.0` (acessível na rede local, não só localhost) — pensado para o celular acessar via IP do PC na mesma rede Wi-Fi.

**Implicação de design para o app mobile:** ele vai rodar na mesma rede local que o PC (não há relay/nuvem), vai precisar descobrir/configurar o IP:porta do PC manualmente (não há mDNS/discovery implementado ainda), e vai reusar majoritariamente TypeScript/JS do lado protocolo (os tipos de mensagem WS já estão definidos em `server.ts`).

---

## 3. Arquitetura e fluxo de funcionamento

### 3.1 Fluxo completo de um comando de voz (desktop)

1. **Ativação:** `Ctrl+Shift+J` (global shortcut do Electron) dispara `handleShortcut()` em `src/main/main.ts`. Se não há API key configurada, abre a janela de configuração e para. Caso contrário, interrompe qualquer TTS/fila em andamento (`interruptAll()`), abre a janela `dashboard.html` (se não estiver visível) e dispara `startListening()`.
2. **Gravação:** `startListening()` garante que a `recorderWin` (janela oculta, sempre viva) está carregada, muda o estado global para `"listening"` e manda `start-recording` via IPC com `{silenceMs, maxRecordMs}` vindos da config. O renderer (`recorder.html` + `preload-recorder.ts`) usa a Web Audio API para capturar o mic, corta automaticamente após `silenceMs` de silêncio (padrão 2500ms) com teto de `maxRecordMs` (padrão 120000ms = 2min), e manda o buffer de áudio de volta via IPC (`audio-data`). Também envia nível RMS em tempo real (`audio-level`) para animar waveform na UI.
3. **Transcrição (STT):** ao receber `audio-data`, o main incrementa um token de invalidação (`currentToken`), muda estado para `"processing"`, e chama `transcribe()` (`src/services/stt.ts`) que manda o áudio (Blob `audio/webm`) para a Groq com `model=<sttModel>`, `language=pt`, `response_format=json`, `temperature=0`. Se o áudio é curto demais (<1024 bytes) trata como silêncio e retorna string vazia sem chamar a API.
4. **Decisão (Brain):** o texto transcrito vai para `decideBrain()` (`src/services/brain.ts`), que monta um histórico de conversa (últimas `chatHistoryTurns * 2` mensagens, resetado após `chatIdleResetMs` de inatividade) e chama a Groq Chat Completions com um system prompt extenso (regras + ~25 exemplos few-shot em PT-BR) pedindo **sempre** `{"actions":[...]}` — um array, mesmo para pedido único, suportando comandos compostos ("e", "depois", "também" → múltiplas ações).
5. **Execução:** cada ação do array passa por `routeAction()` (`src/actions/router.ts`), um switch que despacha para o módulo executor correspondente (todos em `src/actions/`, cada um exporta uma função async que retorna uma string de confirmação em PT-BR). As ações rodam sequencialmente (não em paralelo), e cada resultado é acumulado.
6. **Resposta:** as strings de confirmação são concatenadas, mandadas como notificação nativa do Windows, enviadas para a UI (`dashWin.webContents.send("voice:reply", ...)`) e faladas via `speak()` — uma fila (`speakQueue`) que garante que só uma fala toca por vez, chamando `synthesize()` (`src/services/tts.ts`).
7. **Volta ao idle:** no `finally`, se o token não foi invalidado por uma nova interação, o estado volta para `"idle"`.

Toda a lógica é protegida por um sistema de **cancelamento por token**: cada novo comando incrementa `currentToken`; callbacks assíncronos verificam se seu token ainda é o atual antes de agir, evitando que uma resposta atrasada de uma interação anterior "vaze" para o estado atual.

### 3.2 Máquina de estados

`src/main/state.ts` — `EventEmitter` simples com 5 estados: `idle | listening | processing | speaking | error`. Emite evento `"change"` que atualiza o menu da bandeja (ícone/tooltip, via `tray.ts`) e notifica a janela do dashboard (`dashWin.webContents.send("voice:state", s)`).

### 3.3 Chat de texto (alternativa à voz, mesma pipeline)

`ipcMain.on("chat:send", ...)` em `main.ts` roda exatamente o mesmo pipeline de brain → router → speak, mas pulando a etapa de STT (o texto já vem digitado do dashboard). Usa o mesmo bloqueio de estado (`if (!state.is("idle"))`) para não sobrepor interações.

### 3.4 Bridge mobile (servidor local)

`src/services/command.ts` expõe `processCommand(text)` — uma função **pura**, sem dependência de IPC ou referências de janela (`decideBrain` + `routeAction` em sequência, retorna string concatenada). Essa função é compartilhada entre:
- o handler `POST /api/command` do servidor HTTP,
- o handler de comando de texto do WebSocket,
- e é a mesma lógica que roda no chat.send do desktop.

Isso significa que **qualquer cliente** (desktop, mobile, ou teoricamente um terceiro) que envie texto para o servidor local recebe o mesmo comportamento de decisão/execução que o app desktop.

### 3.5 Comunicação renderer ↔ main (IPC)

Todo `BrowserWindow` usa `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, e expõe uma API mínima via `contextBridge` em arquivos `preload-*.ts` dedicados por janela — nenhum HTML tem acesso direto a APIs do Node/Electron.

---

## 4. Estrutura de pastas e arquivos principais

```
neuroaxis/
├── src/
│   ├── main/
│   │   ├── main.ts            # entry point Electron: janelas, IPC, shortcut, speak queue, telemetry loop, lifecycle
│   │   ├── config.ts          # electron-store: apiKey, overrides de AppConfig, token do servidor mobile
│   │   ├── state.ts           # máquina de estados idle/listening/processing/speaking/error
│   │   ├── notify.ts          # wrapper de notificação nativa do Windows
│   │   └── tray.ts            # ícone da bandeja + menu contextual (status, frequentes, presets, dashboard, config, sair)
│   │
│   ├── services/
│   │   ├── stt.ts             # transcrição via Groq Whisper
│   │   ├── brain.ts           # decisão de intenção via Groq Llama; BrainAction (union de 17 tipos, ver abaixo); histórico de chat
│   │   ├── tts.ts             # síntese via msedge-tts + reprodução PowerShell/MCI, com fallback SAPI offline (ver seção 0.7); fila de cancelamento
│   │   ├── command.ts         # processCommand(text) puro — usado pelo server.ts e pelo chat desktop
│   │   ├── server.ts          # servidor HTTP+WS local (bridge mobile), porta 4200, auth por token
│   │   ├── history.ts         # ranking de comandos mais usados (para submenu "Frequentes")
│   │   ├── presetsStore.ts    # NOVO (seção 0.4): electron-store dos presets, seedado de presets.json no 1º run, sobrevive a `npm run build`
│   │   ├── telemetryLog.ts    # log de anomalias de sistema (CPU sustentado, spike, RAM alta)
│   │   └── errors.ts          # NeuroaxisError tipado, com .message (técnico) e .spoken (PT-BR falável)
│   │
│   ├── actions/                # cada arquivo = 1 executor de BrainAction, retorna string de confirmação PT-BR
│   │   ├── router.ts           # switch BrainAction → executor + list/delete de presets (lendo presetsStore)
│   │   ├── openApp.ts          # abre programa (resolução via PowerShell + Get-StartApps/App Paths/PATH; launch via shell.openPath ou explorer.exe)
│   │   ├── closeApp.ts         # Stop-Process via PowerShell
│   │   ├── openUrl.ts          # abre URL direta ou busca no navegador padrão
│   │   ├── playMusic.ts        # protocolo spotify:search: com fallback YouTube Music
│   │   ├── writeText.ts        # copia texto gerado pelo brain para clipboard
│   │   ├── createFile.ts       # cria .txt na Área de Trabalho e abre
│   │   ├── clipboardAction.ts  # lê clipboard, processa com o brain, retorna/recopiar
│   │   ├── screenshot.ts       # captura tela via PowerShell (System.Windows.Forms + System.Drawing)
│   │   ├── systemInfo.ts       # RAM/CPU/bateria/disco/hora/data/temperatura + getSystemTelemetry() + getDashboardTelemetry() + getTopProcesses() + killProcess() + startMonitor()
│   │   ├── volumeControl.ts    # volume absoluto/relativo/mute via Windows Audio API (PowerShell)
│   │   ├── mediaControl.ts     # play/pause/skip/previous/volume via VK codes (keybd_event P/Invoke)
│   │   ├── windowManagement.ts # maximize/minimize/focus/close via ShowWindowAsync/SetForegroundWindow/PostMessage(WM_CLOSE)
│   │   ├── runPreset.ts        # executa sequência de ações de um preset via routeAction() (seção 0.4)
│   │   └── createPreset.ts     # NOVO (seção 0.4): salva preset novo (gerado pelo brain) no presetsStore
│   │
│   ├── renderer/
│   │   ├── dashboard.html + preload-dashboard.ts   # janela ÚNICA (1024×720, sem frame): chat full-width + 2 gavetas deslizantes (seção 0.1) + temas (0.2) + reorder/hide (0.3)
│   │   ├── config.html + preload-config.ts         # tela de configuração completa (API key, silêncio, gravação, histórico, atalho, modelos IA) — aberta de dentro da gaveta direita agora
│   │   └── recorder.html + preload-recorder.ts     # janela oculta, sempre viva: captura de áudio + envio de nível RMS
│   │   (chat.html/preload-chat.ts e voice-overlay.html/preload-voice.ts — órfãos, DELETADOS na seção 0.6)
│   │
│   └── config/
│       ├── apps.json           # ~55 entradas: nome PT-BR/EN → comando/protocolo/AppID Windows
│       └── presets.json        # seed inicial (2 presets: "gaming", "trabalho") — só lido na 1ª execução, ver presetsStore.ts
│
├── scripts/
│   ├── copy-assets.mjs         # copia HTML/JSON de src/ para dist/ após tsc
│   └── clean.mjs                # limpa dist/ antes do build
│
├── build/icon.ico
├── package.json
├── tsconfig.json
├── CLAUDE.md                   # especificação original do projeto (em PT-BR), decisões técnicas fechadas
├── HANDOFF.md                  # notas de handoff de sessão anterior (parcialmente desatualizado — ver seção 6)
└── NEUROAXIS.txt               # documentação de usuário/produto completa em PT-BR
```

### `BrainAction` — union type completo (`src/services/brain.ts`)

```typescript
type BrainAction =
  | { action: "play_music";        query: string }
  | { action: "open_url";          url_or_query: string }
  | { action: "open_app";          app_name: string }
  | { action: "close_app";         app_name: string }
  | { action: "volume_control";    level: number | "up" | "down" | "mute" | "unmute" }
  | { action: "media_control";     operation: MediaOperation }   // play/pause/skip/previous/volume_up/volume_down
  | { action: "window_management"; target_app: string; operation: WinOperation }  // maximize/minimize/focus/close
  | { action: "write_text";        content: string; description: string }
  | { action: "create_file";       filename: string; content: string; description: string }
  | { action: "clipboard_read";    instruction: string }
  | { action: "screenshot";        filename?: string }
  | { action: "system_info";       query: string }   // ram/cpu/battery/disk/hora/data/cpu_temperature
  | { action: "run_preset";        preset_name: string }
  | { action: "list_presets" }
  | { action: "delete_preset";     preset_name: string }
  | { action: "create_preset";     preset_name: string; description: string; icon?: string; actions: BrainAction[] }  // NOVO — seção 0.4
  | { action: "chat";              reply: string }
  | { action: "unknown" };
```

O brain sempre responde `{"actions":[...]}` — suporta múltiplas ações por comando de voz.

---

## 5. Funcionalidades que já funcionam de verdade (testadas)

Segundo o handoff da última sessão de trabalho no código (arquivo `HANDOFF.md`), os seguintes pontos foram corrigidos e validados:

- **Abertura de apps de fato em primeiro plano** — problema original era que o PowerShell (processo oculto/detached) não tem permissão de foreground do Windows; app abria invisível em background. Corrigido: PowerShell só resolve o AppID/path (query read-only); o Electron lança via `shell.openPath()` (caminho de exe) ou via `spawn("explorer.exe", ["shell:AppsFolder\\<AppID>"])` para apps UWP/Store (Explorer tem foreground rights nativos). Timeout de 4s protege contra travamento.
- **Resolução de app por 3 estratégias em cascata:** `Get-StartApps` (nome parcial, case-insensitive) → registry `App Paths` (HKCU/HKLM) → `Get-Command` no PATH.
- **Atalho global não travava mais o estado** — antes, se o estado não fosse `idle`, o atalho simplesmente não fazia nada silenciosamente; corrigido com `interruptAll()` antes de reiniciar a escuta.
- **Janelas reaparecendo corretamente** — checagem de `isDestroyed()` e `isMinimized()` antes de `.show()/.focus()`, com reset de referência se a janela foi destruída sem emitir `"closed"`.
- **Cancelamento de TTS em andamento** — `cancelSpeak()` mata o processo PowerShell ativo de reprodução; `interruptAll()` limpa a fila de fala e incrementa o token de invalidação.

Comandos de voz cobertos pelo brain e roteados corretamente (com base na leitura do código atual, não necessariamente todos testados manualmente): tocar música (Spotify/YouTube Music fallback), abrir/fechar programas mapeados em `apps.json` (~55 entradas), abrir sites/buscas, ajuste de volume (absoluto e relativo), controle de mídia via tecla virtual (funciona com qualquer player, não só Spotify), gerenciamento de janela (maximizar/minimizar/focar/fechar), escrever texto pro clipboard, criar arquivo .txt, ler/processar clipboard, tirar screenshot, consultar RAM/CPU/bateria/disco/hora/data/temperatura de CPU, presets (executar/listar/apagar), conversa livre (chat), comandos compostos (múltiplas ações num só comando de voz).

O servidor HTTP+WS local (porta 4200) inicia junto com o app e expõe `/api/health`, `/api/command` e `/api/stream`, todos com auth por token — implementado na íntegra, mas **sem cliente conhecido testando contra ele ainda** (não há app mobile).

---

## 6. Funcionalidades quebradas ou incompletas

### 6.1 BUG PRINCIPAL: TTS não fala mais ("ele não fala mais") — ✅ RESOLVIDO em 2026-07-21, ver seção 0.7

Causa raiz confirmada foi exatamente a hipótese 1 abaixo (falha de rede do `msedge-tts`, engolida em silêncio). Corrigido com fallback SAPI offline + logging. Análise original da sessão de 2026-07-20 mantida abaixo por contexto histórico — a pendência real que resta é só a voz do fallback (Daniel/OneCore, seção 0.7), não mais o "não fala nada".

**Sintoma relatado pelo usuário:** o assistente processa o comando (a ação executa, a notificação nativa aparece com o texto da resposta), mas **nenhum áudio sai** — a fala simplesmente não acontece. Segundo o usuário, esse bug **já vinha de sessões anteriores** (não é uma regressão desta sessão) e **não há mensagem de erro visível** associada — o app se comporta normalmente em todo o resto do fluxo.

**Causa raiz mais provável, com base na leitura do código atual (`src/services/tts.ts`):**

1. O pipeline de TTS atual usa `msedge-tts` (pacote npm que reimplementa/chama a API não-documentada do "Edge Read Aloud" da Microsoft) para gerar um MP3 via streaming, salva em arquivo temporário, e reproduz via PowerShell usando `winmm.dll` (MCI — `mciSendString`). **Isso requer conexão de rede** com o backend da Microsoft — não é TTS offline.
2. **Toda a cadeia de erro é engolida silenciosamente.** Em `synthesize()`, qualquer falha — no `catch` do bloco principal, no handler `audioStream.on("error", rej)`, no `ps.on("error", ...)` do processo PowerShell — chama apenas `finish()`, que resolve a Promise **sem nunca rejeitar nem propagar o erro para cima**. O código em `main.ts` que chama `speak()` também está dentro de um `try { await synthesize(item.text); } catch { /* best-effort */ }` — ou seja, **mesmo se algo escapasse, seria descartado de propósito**. Resultado: se a chamada ao backend do Edge falhar (rede, mudança de auth/token da API não-oficial, rate limit, certificado, proxy, etc.), o app simplesmente "termina" a fala sem tocar nada e sem notificar o usuário. Não há log persistido do erro real em lugar nenhum acessível.
3. **Contradição na documentação vs. código:** `HANDOFF.md` (de uma sessão anterior) afirma explicitamente que "TTS atual usa PowerShell SAPI offline (sem dependência de edge-tts ou API externa)" e que o `tts.ts` usa `System.Speech.Synthesis` do Windows. **Isso não corresponde ao código atual** — o `tts.ts` de hoje usa `msedge-tts` (dependência de rede) e reprodução MP3 via MCI, não `System.Speech`. Isso indica que em algum momento entre aquela sessão e agora, a implementação de TTS foi trocada de SAPI-offline para msedge-tts-cloud (provavelmente para ter voz mais natural — `pt-BR-FranciscaNeural` é uma voz neural, SAPI teria só vozes robóticas do Windows), e essa troca é justamente onde o bug "não fala mais" provavelmente começou a acontecer, silenciosamente, sem que ninguém percebesse porque não há telemetria de erro nesse caminho.
4. O pacote `msedge-tts` (`^1.3.4`) depende de um endpoint não-oficial da Microsoft que é conhecido por mudar requisitos de autenticação/headers periodicamente sem aviso — um padrão comum de falha nesse tipo de biblioteca.

**O que ainda NÃO foi verificado nesta sessão (precisa de teste manual/log real):** não rodei o app (`npm run dev`) nem capturei stderr real do processo PowerShell nem do stream do `msedge-tts` para confirmar qual das hipóteses acima é a causa exata. A recomendação para quem for debugar de verdade: remover temporariamente os `catch` silenciosos em `tts.ts` (ou adicionar `console.error`/`notify()` nos catches) e rodar em `npm run dev` para ver o erro real na primeira tentativa de fala.

### 6.2 Janelas órfãs no código (dead code, não é bug funcional mas é debt relevante) — ✅ RESOLVIDO em 2026-07-21, ver seção 0.6

Arquivos deletados. Descrição original mantida por contexto:

`chat.html` + `preload-chat.ts` e `voice-overlay.html` + `preload-voice.ts` **não eram referenciados em nenhum lugar de `src/`** (confirmado via busca — zero `loadFile`/`import` apontando pra eles). Segundo a memória da sessão de 2026-06-23 (`Pillar 4 Expansion`), essas duas janelas foram **substituídas por uma janela única `dashboard.html`** (1024×720, sidebar + chat central + painel direito) que unifica tudo. Os arquivos antigos nunca foram deletados e continuam aparecendo como modificados no `git status` — provavelmente resquício de edições feitas antes da unificação, ou arquivos mantidos "por segurança" que ninguém limpou. **Para quem for planejar o app mobile:** ignore esses dois arquivos como referência de UI — a UI de verdade e mais recente é `dashboard.html`.

### 6.3 Debug notification pendente de remoção

Em `openApp.ts`, uma chamada `notify("NEUROAXIS — Resolvido", ...)` foi deixada intencionalmente ativa (conforme `HANDOFF.md`) para depurar a resolução de AppID, com nota explícita para removê-la "depois de confirmar que todos os apps abrem corretamente". Não há confirmação registrada de que isso foi feito — pode ainda estar mostrando notificações de debug em todo `open_app`.

### 6.4 GUID paths do Get-StartApps

Apps cujo `Get-StartApps` retorna um path no formato `{GUID}\app.exe` são tratados pelo código atual como caminho absoluto (porque não começa com letra de unidade tipo `C:\`), mas `shell.openPath()` provavelmente falha nesse formato — precisaria cair no fallback `launchViaExplorer` também para esses casos, e não fica claro pela leitura se isso já foi corrigido.

### 6.5 Apps não instalados ainda mapeados

`apps.json` lista programas (Notion, Slack, Zoom, Figma, Postman, Acrobat, etc.) que podem não estar de fato instalados na máquina do usuário — gera resposta "não encontrei" quando pedido, comportamento correto mas pode confundir se o usuário achar que deveria funcionar.

### 6.6 Instalador não testado após últimas mudanças

`npm run dist` gera o `.exe` NSIS, mas segundo o handoff anterior isso **não foi testado** após as últimas alterações de código.

---

## 7. Decisões técnicas importantes já tomadas

Estas decisões vêm principalmente do `CLAUDE.md` (especificação original, marcada como "propositalmente fechada para evitar ambiguidade") e do código:

- **Electron + TypeScript obrigatório**, sem framework de frontend (sem React/Vue) — os `.html` do renderer são vanilla JS/HTML/CSS estático.
- **Groq como único provedor de IA** — tanto para STT (Whisper) quanto para o "cérebro" de decisão (Llama), sempre com saída estruturada JSON (`response_format: json_object`), nunca texto livre parseado manualmente.
- **JSON estruturado com poucos few-shots** no system prompt do brain — decisão explícita para melhorar precisão de mapeamento frase→ação; hoje o prompt tem ~25 exemplos (cresceu bastante além do "poucos" original conforme mais ações foram adicionadas).
- **Nunca hardcode nem versiona a API key** — sempre via `electron-store` local, pedida numa tela mínima na primeira execução.
- **Fechar janela principal não mata o processo** — só "Sair" no menu da bandeja realmente encerra (`appQuitting` flag controla isso no evento `close` do `dashWin`).
- **App nunca deve travar/fechar por erro de rede, mic ausente, API key inválida, ou app não encontrado** — todo erro é tipado (`NeuroaxisError`) com uma versão técnica (`.message`) e uma versão falável em PT-BR (`.spoken`), e o app sempre volta ao estado idle no `finally`. (Nota: esse princípio é justamente o que tornou o bug de TTS silencioso — os catches "nunca travar" acabaram também escondendo o erro real do TTS, sem alternativa de log.)
- **Cancelamento cooperativo por token de invalidação** (`currentToken`) em vez de cancelamento real de requisições — abordagem simples que evita race conditions entre comandos sobrepostos sem precisar de `AbortController` em cada chamada de rede.
- **Fila de fala single-threaded** (`speakQueue` + `isSpeaking` flag) — garante que nunca duas falas tocam ao mesmo tempo, mesmo com comandos compostos gerando várias respostas.
- **Unificação de UI em uma única janela `dashboard.html`** (decisão tomada em 2026-06-23, "Pillar 4 Expansion") substituindo as janelas separadas de chat e overlay de voz — mais simples de manter, um único preload, um único estado de UI.
- **Servidor mobile como HTTP+WS nativo do Node, zero dependências extras** — decisão deliberada de não trazer `ws`/`express` para manter o app leve; implementação manual do protocolo WebSocket (RFC 6455) direto em `server.ts`.
- **`processCommand()` puro, desacoplado de IPC** — decisão arquitetural específica para permitir reuso entre desktop (chat) e servidor mobile sem duplicar lógica de decisão/execução.
- **PowerShell como "runtime" de baixo nível para quase toda ação de sistema** (abrir app, fechar processo, volume, mídia, janela, screenshot, temperatura de CPU) em vez de módulos nativos Node compilados — decisão de simplicidade/portabilidade (sem `node-gyp`, sem binários nativos para empacotar no instalador), ao custo de spawnar um processo PowerShell por ação (overhead pequeno mas não-zero) e de scripts inline como strings (mais frágil, mais difícil de testar).
- **TTS trocado de System.Speech/SAPI (offline) para `msedge-tts` (voz neural via nuvem)** — não documentado explicitamente como decisão consciente em nenhum arquivo atual, mas evidenciado pelo código: a troca visava voz mais natural (`FranciscaNeural`) em vez das vozes robóticas do SAPI nativo do Windows. Esse é provavelmente o ponto de origem do bug da seção 6.1.

---

## 8. O que ainda falta implementar (roadmap original)

Do `CLAUDE.md` (fora de escopo desta versão, deixado documentado para evolução futura) e do `NEUROAXIS.txt`:

- **Wake-word por voz** — hoje ativação é só por atalho de teclado; não há escuta passiva contínua.
- **Integração com Spotify Web API** — hoje `play_music` só abre o Spotify/YouTube Music já na busca certa via protocolo; não há play/pause/skip/controle real via API (o `media_control` atual usa teclas virtuais de mídia do sistema, que funcionam com qualquer player em foco, não é integração dedicada ao Spotify).
- **Suporte a outros idiomas** além de PT-BR (STT, brain, e TTS todos fixos em português).
- **Tela de troca de atalho de teclado** — a estrutura de config já suporta (`AppConfig.shortcut`, captura de combinação já existe na UI de config), mas não fica claro se está 100% funcional ponta a ponta.
- **Criação de presets por voz** ("cria um preset gaming que abre o Steam e...") — hoje presets só são criados editando `presets.json` manualmente; por voz só dá pra listar/executar/apagar.
- **Interface web de administração de presets.**
- **Integração com calendário** (ler compromissos do dia).
- **Controle de smart home** (Philips Hue, etc.).
- **Modo offline completo** com Whisper local (`whisper.cpp`) — hoje depende 100% da Groq para STT e brain, e (segundo o código atual) também para TTS via `msedge-tts`, apesar do documento de handoff antigo sugerir que TTS seria offline.
- **O app mobile companion em si** — é o motivo deste documento. O lado servidor já está pronto (seção 3.4); falta todo o cliente.

### Checklist de validação manual ainda pendente (documentado no `CLAUDE.md`, nunca confirmado como concluído)

- [ ] Colar a `GROQ_API_KEY` na primeira abertura
- [ ] Confirmar permissão de microfone liberada pelo Windows
- [ ] Com outro app em foco, `Ctrl+Shift+J` muda o ícone da bandeja para "ouvindo"
- [ ] Comando de música abre Spotify/YouTube Music na busca certa
- [ ] Comando de site abre o navegador na busca certa
- [ ] Comando de programa abre o app pedido
- [ ] Pergunta livre recebe resposta falada — **bloqueado pelo bug da seção 6.1**
- [ ] Reiniciar o PC e o Jarvis/NEUROAXIS aparece sozinho na bandeja
- [ ] Instalador `.exe` roda limpo em outra pasta/perfil

---

## 9. Estado do repositório Git (nota importante para quem for colaborar)

- Branch atual: `main`. Único commit no histórico: `c3f8c3d feat: initial commit — NEUROAXIS voice assistant`.
- **A grande maioria do código descrito neste documento está em working tree modificado, não commitado** — nada foi commitado nem na sessão de 2026-07-20 nem na de 2026-07-21 (mudanças da seção 0). Isso é relevante pra quem for colaborar: nenhuma das mudanças descritas neste documento (redesign de UI, presetsStore, create_preset, fix de TTS) está protegida em nenhum ponto de restauração no Git ainda — tudo só existe em disco.
- Arquivos novos desde 2026-07-20 (além dos já `??` na sessão anterior): `src/services/presetsStore.ts`, `src/actions/createPreset.ts`.
- Arquivos deletados nesta sessão (existiam como `??`/modificados antes, não existem mais): `src/renderer/chat.html`, `src/renderer/preload-chat.ts`, `src/renderer/voice-overlay.html`, `src/renderer/preload-voice.ts`.
- `src/renderer/dashboard.html`, `src/main/main.ts`, `src/main/config.ts`, `src/main/tray.ts`, `src/services/brain.ts`, `src/services/tts.ts`, `src/actions/router.ts`, `src/actions/runPreset.ts`, `src/renderer/preload-dashboard.ts`, `scripts/copy-assets.mjs` — todos modificados nesta sessão além do que já estava modificado antes.

---

## 10. Resumo executivo para quem for planejar o app mobile

O que o mobile precisa fazer, na prática: conectar via Wi-Fi local ao IP do PC na porta 4200, autenticar com um Bearer token de 64 hex chars (hoje só recuperável olhando o `electron-store` no PC — não há UI pra exibir/parear o token ainda, é outro ponto a planejar), mandar texto (`POST /api/command`) ou stream de áudio (`WS /api/stream`) e receber de volta a resposta em texto (o mobile teria que fazer seu próprio TTS local, ou pedir que o desktop fale — hoje só o desktop fala, a resposta pro mobile é sempre texto). Vale considerar aproveitar esse desenho para também **contornar** o bug de TTS do desktop: se o app mobile fizer TTS nativo (ex: TTS do próprio SO mobile), o usuário ganha voz funcional via celular enquanto o bug do desktop não é resolvido.
