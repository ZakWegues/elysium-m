# ELYSIUM-M

> **Leia o `ULTRA_HANDOFF.md`** — está na raiz da pasta-mãe `ELYSIUM` e no repositório do
> desktop (`neuroaxis/ULTRA_HANDOFF.md`). É a fonte de verdade dos dois lados do projeto.

Este arquivo continha o plano de arquitetura escrito **antes de o app existir**, e ficou
perigosamente desatualizado: afirmava, entre outras coisas, que "sem relay em nuvem, o celular
só funciona conectado à mesma rede Wi-Fi do PC" — falso desde que o pareamento passou a
carregar todos os endereços da máquina, incluindo o do túnel. Como o `CLAUDE.md` é carregado
automaticamente em toda sessão, manter isso aqui era plantar uma premissa errada no começo de
cada conversa. O conteúdo histórico está no git.

## O essencial, em cinco linhas

- App companion do ELYSIUM desktop. Expo SDK 57 + React Native 0.86 + TypeScript, Android.
- Parea por QR code e fala com o PC na porta 4200, por HTTP e WebSocket.
- **Os dois repositórios são editados na mesma sessão** — mudança de servidor exige mudar o
  cliente no mesmo trabalho.
- Build do APK: `npm run build:local` (aqui, ~3 min). Correção só de JS: `npm run update "msg"`.
- Antes de escrever código, veja o `AGENTS.md`: leia a doc versionada do Expo v57.
