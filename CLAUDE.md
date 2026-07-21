# PLANO_NEUROAXIS_PORTAL.md

> Plano de arquitetura e roadmap para o **NeuroAxis Portal**, o app mobile companion do NeuroAxis (desktop). Este documento assume que o NeuroAxis PC já está commitado no git e com os itens de limpeza da seção "pendências do desktop" resolvidos.

## 0. O que já existe no lado servidor (não precisa construir de novo)

O NeuroAxis já expõe, na porta 4200, tudo que o Portal precisa consumir:

- `GET /api/health` — healthcheck
- `POST /api/command` `{text}` → `{reply}` — mesmo pipeline de decisão do desktop, mas sem STT
- `WS /api/stream` — manda áudio binário (arquivo completo por mensagem) ou `{"type":"command","text":"..."}`; recebe `{type:"transcript"}`, `{type:"reply"}`, `{type:"error"}`
- Broadcast de telemetria a cada 5s via WS: `{type:"telemetry", ...}`
- Auth: `Authorization: Bearer <token de 64 hex chars>`
- Bind em `0.0.0.0` — acessível na rede local, sem discovery automático (sem mDNS)

`processCommand()` (`src/services/command.ts`) é puro e já é a mesma lógica usada pelo chat desktop.

**Limitação herdada:** sem relay em nuvem, o celular só funciona conectado à mesma rede Wi-Fi do PC.

## 1. Fase 0 — Pareamento (pré-requisito, ainda no lado desktop do NeuroaxIS, repositório separado)

Nova aba/botão na gaveta direita (`#drawer-right`) → "Parear celular". Backend: `os.networkInterfaces()` pra pegar IPv4 local + token via `getOrCreateServerToken()`. Renderizar QR code (lib `qrcode`) contendo JSON `{"ip":"...","port":4200,"token":"..."}`. Isso NÃO faz parte deste repositório do Portal — é trabalho no repositório do NeuroAxis PC.

## 2. Stack recomendada para o Portal

**React Native + Expo**, não PWA — por causa de gravação de áudio em background, TTS nativo de qualidade, câmera pra QR, e notificações nativas.

Bibliotecas: `expo-av`/`expo-audio` (gravação), `expo-speech` (TTS local em PT-BR), `expo-camera` + `expo-barcode-scanner` (QR), `expo-secure-store` (guardar IP+token pareados).

## 3. TTS sempre local no Portal

O servidor mobile só devolve texto, nunca áudio. Decisão fechada: TTS roda local no celular via `expo-speech` assim que a resposta de texto chega. Não depender do TTS do desktop.

## 4. Roadmap de desenvolvimento

- **Fase 1 — Scaffold + conexão:** tela de pareamento (scanner QR → salva no `expo-secure-store`), teste `GET /api/health`, tela única de chat.
- **Fase 2 — Chat de texto:** `POST /api/command`, mostra resposta, `expo-speech` fala.
- **Fase 3 — Voz:** botão de gravação (push-to-talk), envia via WS `/api/stream`, mostra transcript + reply, fala a reply.
- **Fase 4 — Telemetria espelhada:** consumir broadcast de telemetria do WS, tela simples de CPU/RAM/bateria/disco.
- **Fase 5 — Presets:** listar e rodar presets via `/api/command`.
- **Fase 6 (futuro, fora do MVP):** discovery via mDNS, relay fora da rede local.

## 5. Segurança

CORS `*` e bind `0.0.0.0` com auth só por token — aceitável pra uso doméstico, não expor a porta 4200 na internet sem repensar autenticação. Regenerar o token desloga o Portal antigo.

## 6. Ordem de execução

1. Commit do NeuroAxis PC atual (repositório separado)
2. Fase 0 (QR de pareamento) no NeuroAxis PC
3. Este repositório (Portal) — Fases 1→5 na ordem, testando cada uma contra o PC real
4. Fase 6 só depois do MVP estável
