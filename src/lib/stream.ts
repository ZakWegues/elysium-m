import { lerRapidas, type Rapidas } from './respostasRapidas';
import { lerUi, type FrameUi } from './telas';
import { diagTela } from './telaDiag';
import { File as FSFile } from 'expo-file-system';
import { errMessage } from './errors';
import { Pairing } from './pairing';
import { openAuthedWebSocket, streamUrl } from './ws';
import { receberEntrega } from './notificacoes';
import type { Entrega } from './rpc';
import { receberFrameEstado } from './estadoPc';
import { receberFrameModo } from './modo';
import { receberFramePomodoro } from './pomodoro';
import { receberMailboxNovo } from './mailboxAviso';
import { AuthError } from './http';

import type { Fonte } from './chatHistoryStore';

/** `id`: o do pedido de texto — a tela inteligente (frame `ui`) chega depois com ele. */
type StreamResult = { transcript?: string; reply: string; fontes?: Fonte[]; local?: boolean; rapidas?: Rapidas; id?: string };

/**
 * Recebe a resposta ACUMULADA a cada pedaço que o PC manda — o texto inteiro até agora,
 * não só o pedaço. Quem desenha a bolha só substitui o texto; não precisa concatenar.
 */
export type OnChunk = (parcial: string) => void;

/** O estado da conexão, para a tela mostrar "Reconectando…" em vez de erro (21/10). */
export type EstadoConexao = 'conectado' | 'reconectando' | 'caiu';

/** O WebSocket nem abriu: aí, e só aí, vale cair no HTTP (o comando não chegou ao PC). */
export class ConexaoNaoAbriu extends Error {}

type Pending = {
  /** Pedido de texto com id (PC 2.14+ guarda a resposta e deixa retomar). Áudio não tem. */
  id?: string;
  texto?: string;
  canal?: 'voz' | 'texto';
  refazer?: boolean;
  /** O comando já saiu para o PC? Se não, sai quando a conexão (re)abrir. */
  enviado: boolean;
  /** A conexão caiu no meio e o pedido espera a retomada. */
  aguardandoRetomada: boolean;
  caiuEm: number;
  resolve: (result: StreamResult) => void;
  reject: (err: Error) => void;
  transcript?: string;
  parcial: string;
  onChunk?: OnChunk;
  onTranscript?: (texto: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

/**
 * 🔴 Timeout de INATIVIDADE, não total. O `llama3.1:8b` recarrega em ~18 s a frio e
 * depois escreve por vários segundos; um teto fixo de 20 s matava respostas boas no meio.
 * Cada pedaço que chega rearma o relógio — só um PC que parou de responder estoura.
 */
const INATIVIDADE_MS = 45000;
/** 21/10: batimento. Sem nenhum sinal do PC por 35 s (com o PC que responde `pong`), a conexão é refeita. */
const BATIDA_MS = 15000;
const SILENCIO_MAXIMO_MS = 35000;
/** Quanto tempo um pedido espera a conexão voltar antes de desistir. */
const ESPERA_RETOMADA_MS = 90000;

/** Id do pedido: o PC aceita `[A-Za-z0-9-]{8,64}`. */
export function novoIdDePedido(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Recuo da reconexão: 1, 2, 4, 8 e no máximo 15 s. Pura. */
export function recuo(tentativa: number): number {
  return Math.min(15000, 1000 * 2 ** Math.max(0, tentativa));
}

export type VoiceConnection = {
  ready: Promise<void>;
  /** Manda o áudio gravado; o PC transcreve (`onTranscript`, antes dos pedaços) e responde. */
  sendAudio(audioUri: string, onChunk?: OnChunk, onTranscript?: (texto: string) => void): Promise<StreamResult>;
  /** Manda texto pelo mesmo WebSocket — é o caminho que recebe a resposta em pedaços. */
  /** `canal: 'texto'` = digitado (resposta de chat); sem ele, o curto da voz (bloco 130). */
  sendText(text: string, onChunk?: OnChunk, opcoes?: { canal?: 'voz' | 'texto'; refazer?: boolean }): Promise<StreamResult>;
  /** O "Parar" e a saída da tela: avisa o PC (que descarta a resposta) e encerra de vez. */
  close(): void;
  /** A conexão está aberta e o PC deu sinal de vida há pouco? */
  viva(): boolean;
  /** Refaz a conexão agora (app voltou para a frente, o endereço do PC mudou). */
  reconectar(): void;
  /**
   * 23/10: "Ver como tela" / "Tentar de novo" — o PC gera a tela desta resposta e manda os frames
   * `ui` com `id`. false = sem conexão agora.
   */
  pedirTela(id: string, pergunta: string, resposta: string): boolean;
  /** 23/10: o "Cancelar" do esqueleto. */
  cancelarTela(id: string): void;
  /**
   * 24/10: o app reabriu com uma tela "gerando" na conversa (foi fechado no meio): pede ao PC a
   * tela daquele pedido (ele guarda 10 min) — agora, ou assim que a conexão abrir.
   */
  retomarTela(id: string): void;
};

/**
 * A conexão do chat com o PC (21/10, reescrita). Antes um socket morto ficava guardado e o
 * erro só aparecia 45 s depois ("a conexão parou no meio"). Agora:
 *  - batimento a cada 15 s (`ping`/`pong`); sem sinal, refaz a conexão;
 *  - caiu: reconecta sozinha (1 s, 2 s, 4 s… até 15 s), sempre no endereço ATUAL do PC;
 *  - pedido de texto com id: ao voltar, pede `retomar` e a resposta continua de onde parou;
 *  - nunca reenvia um comando que já saiu (o PC rodaria duas vezes).
 * PC antigo (sem `pong`/retomada): o batimento não derruba nada, e uma queda vira erro como antes.
 */
export function openVoiceConnection(
  origem: Pairing | (() => Pairing),
  onClosed?: () => void,
  /** Sugestões de próxima pergunta (bloco 132): chegam DEPOIS do reply, fora de pedido. */
  onSugestoes?: (sugestoes: string[]) => void,
  onEstado?: (e: EstadoConexao) => void,
  /** 22/10: a tela inteligente de um pedido (gerando, pronta ou falhou) — chega depois do reply. */
  onUi?: (f: FrameUi) => void,
): VoiceConnection {
  const pegarPairing = typeof origem === 'function' ? origem : () => origem;

  let ws: WebSocket | null = null;
  let pending: Pending | null = null;
  let encerrada = false;
  let abriuUmaVez = false;
  let suportaPong = false;
  let ultimoSinal = Date.now();
  let tentativas = 0;
  let timerReconexao: ReturnType<typeof setTimeout> | null = null;
  let timerRetomada: ReturnType<typeof setTimeout> | null = null;
  /** O pedido cuja tela ainda está sendo gerada: se a conexão cair, pede `retomar` ao voltar. */
  let telaEsperada: string | null = null;

  let resolverReady: () => void = () => {};
  let rejeitarReady: ((e: Error) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => { resolverReady = resolve; rejeitarReady = reject; });
  ready.catch(() => { /* quem espera trata */ });

  function settlePending(fn: (p: Pending) => void) {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timeout);
    if (timerRetomada) { clearTimeout(timerRetomada); timerRetomada = null; }
    fn(p);
  }

  function rearmar(p: Pending) {
    clearTimeout(p.timeout);
    p.timeout = setTimeout(() => {
      // Com a conexão caída, quem decide é a espera da retomada, não a inatividade.
      if (p.aguardandoRetomada) return;
      console.error('[voice-ws] PC parou de responder');
      settlePending((x) => x.reject(new Error('O PC parou de responder no meio. Toque em Refazer.')));
    }, INATIVIDADE_MS);
  }

  function enviarComando(p: Pending) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !p.texto) return;
    try {
      // PC antigo ignora os campos novos: o comando roda igual, só que no curto de sempre.
      // `telas`: este app desenha telas inteligentes (Fase 4) — PC antigo ignora.
      ws.send(JSON.stringify({ type: 'command', text: p.texto, id: p.id, canal: p.canal, refazer: p.refazer, telas: p.canal === 'texto' }));
      p.enviado = true;
      diagTela(`ws: comando ${p.canal ?? 'voz'} id …${(p.id ?? '').slice(-6)}`);
    } catch (err) {
      console.warn('[voice-ws] envio falhou, tenta ao reconectar', errMessage(err));
    }
  }

  function pedirRetomada(p: Pending) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !p.id) return;
    try { ws.send(JSON.stringify({ type: 'retomar', id: p.id })); } catch { return; }
    // PC antigo não conhece "retomar": sem resposta em 10 s, a resposta se perdeu.
    if (timerRetomada) clearTimeout(timerRetomada);
    timerRetomada = setTimeout(() => {
      if (pending === p && p.aguardandoRetomada) {
        settlePending((x) => x.reject(new Error('A conexão caiu e a resposta se perdeu. Toque em Refazer.')));
      }
    }, 10000);
  }

  function aoAbrir() {
    tentativas = 0;
    ultimoSinal = Date.now();
    if (!abriuUmaVez) { abriuUmaVez = true; resolverReady(); }
    console.log('[voice-ws] conectado', ws ? streamUrl(pegarPairing()) : '');
    diagTela(`ws: conectado${abriuUmaVez ? '' : ' (1ª)'}`);
    onEstado?.('conectado');
    try { ws?.send(JSON.stringify({ type: 'ping' })); } catch { /* */ }
    const p = pending;
    if (!p) {
      // Caiu enquanto a tela era gerada: o PC guarda e manda de novo (reply + ui).
      if (telaEsperada) { try { ws?.send(JSON.stringify({ type: 'retomar', id: telaEsperada })); } catch { /* */ } }
      return;
    }
    if (!p.enviado) enviarComando(p);
    else if (p.aguardandoRetomada) pedirRetomada(p);
  }

  function aoCair() {
    if (encerrada) return;
    diagTela(`ws: caiu${pending ? ' com pedido pendente' : ''}${telaEsperada ? ' esperando tela' : ''}`);
    if (!abriuUmaVez) {
      // Nem abriu: quem chamou cai no HTTP (o comando não chegou ao PC).
      rejeitarReady?.(new ConexaoNaoAbriu('Não consegui abrir a conexão com o PC'));
    }
    const p = pending;
    if (p && p.id && (p.enviado ? true : !!p.texto)) {
      // Pedido de texto: espera a conexão voltar e retoma (ou envia, se nem tinha saído).
      if (p.enviado) { p.aguardandoRetomada = true; if (!p.caiuEm) p.caiuEm = Date.now(); }
      onEstado?.('reconectando');
    } else if (p) {
      settlePending((x) => x.reject(new Error('A conexão com o PC caiu antes da resposta.')));
      onEstado?.('caiu');
    } else {
      onEstado?.(abriuUmaVez ? 'reconectando' : 'caiu');
    }
    if (p && p.caiuEm && Date.now() - p.caiuEm > ESPERA_RETOMADA_MS) {
      settlePending((x) => x.reject(new Error('Sem conexão com o PC agora. A resposta fica no PC por 10 minutos — toque em Refazer quando voltar.')));
    }
    agendarReconexao();
  }

  function agendarReconexao() {
    if (encerrada || timerReconexao) return;
    timerReconexao = setTimeout(() => { timerReconexao = null; conectar(); }, recuo(tentativas++));
  }

  function tratarMensagem(event: MessageEvent) {
    let data: { rapidas?: unknown; type?: string; text?: string; reply?: string; error?: string; fontes?: Fonte[]; sugestoes?: string[]; local?: boolean; id?: string; direction?: string } & Partial<Entrega>;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error('[voice-ws] resposta ilegível do servidor', event.data, err);
      return;
    }
    // Frame de outro pedido (um antigo que terminou depois): não é desta bolha.
    const doPedido = (id?: string) => !id || !pending?.id || id === pending.id;

    // 24/10: diagnóstico das telas — que frames chegam (sem conteúdo).
    if (data.type && !['pong', 'pc.estado', 'chunk', 'telemetry', 'modo', 'pomodoro'].includes(data.type)) {
      diagTela(`ws: frame ${data.type} id …${String(data.id ?? '').slice(-6)} pendente …${(pending?.id ?? '-').slice(-6)}`);
    }
    if (data.type === 'pong') {
      suportaPong = true;
    } else if (data.type === 'transcript') {
      if (pending) {
        pending.transcript = data.text;
        rearmar(pending);
        if (data.text) pending.onTranscript?.(data.text);
      }
    } else if (data.type === 'retomada') {
      if (pending && pending.id === data.id) {
        if (timerRetomada) { clearTimeout(timerRetomada); timerRetomada = null; }
        pending.aguardandoRetomada = false;
        pending.caiuEm = 0;
        pending.parcial = data.text ?? pending.parcial;
        rearmar(pending);
        if (pending.parcial) pending.onChunk?.(pending.parcial);
      }
    } else if (data.type === 'retomada_falhou') {
      if (telaEsperada && data.id === telaEsperada && !(pending && pending.id === data.id)) {
        onUi?.({ id: telaEsperada, falhou: true });
        telaEsperada = null;
      } else if (pending && (!data.id || pending.id === data.id)) {
        settlePending((p) => p.reject(new Error('A conexão caiu e a resposta se perdeu. Toque em Refazer.')));
      }
    } else if (data.type === 'chunk') {
      if (pending && doPedido(data.id)) {
        pending.parcial += data.text ?? '';
        rearmar(pending);
        pending.onChunk?.(pending.parcial);
      }
    } else if (data.type === 'reply') {
      if (doPedido(data.id)) settlePending((p) => p.resolve({ transcript: p.transcript, reply: data.reply ?? p.parcial, fontes: Array.isArray(data.fontes) ? data.fontes : undefined, local: data.local === true, rapidas: lerRapidas(data.rapidas), id: p.id }));
    } else if (data.type === 'ui') {
      const f = lerUi(data);
      if (f) {
        if (f.gerando) telaEsperada = f.id;
        else if (telaEsperada === f.id) telaEsperada = null;
        onUi?.(f);
      }
    } else if (data.type === 'sugestoes') {
      if (Array.isArray(data.sugestoes)) onSugestoes?.(data.sugestoes.filter((s): s is string => typeof s === 'string').slice(0, 3));
    } else if (data.type === 'notify') {
      // Uma entrega na hora (rotina executada, lembrete): vira notificação local e é
      // confirmada ao PC. Bloco 72.
      if (data.id && data.titulo) {
        receberEntrega({ id: data.id, tipo: data.tipo ?? 'aviso', titulo: data.titulo, corpo: data.corpo ?? '', em: data.em ?? Date.now(), ref: data.ref }, pegarPairing()).catch(() => {});
      }
    } else if (data.type === 'mailbox_new') {
      // 21/10: recado/arquivo novo do PC — a Caixa recarrega na hora, sem esperar o polling.
      if (data.direction === 'toMobile' && data.id) receberMailboxNovo(data.id);
    } else if (data.type === 'pc.estado') {
      receberFrameEstado(data as Record<string, unknown>);
    } else if (data.type === 'modo') {
      receberFrameModo(data as Record<string, unknown>);
    } else if (data.type === 'pomodoro') {
      receberFramePomodoro(data as Record<string, unknown>);
    } else if (data.type === 'error') {
      if (doPedido(data.id)) {
        console.error('[voice-ws] servidor retornou erro', data.error);
        settlePending((p) => p.reject(new Error(`O PC respondeu com erro: ${data.error ?? 'sem mensagem'}`)));
      }
    }
  }

  function conectar() {
    if (encerrada) return;
    let sock: WebSocket;
    try { sock = openAuthedWebSocket(pegarPairing()); }
    catch { aoCair(); return; }
    ws = sock;
    sock.onopen = () => { if (ws === sock) aoAbrir(); };
    sock.onmessage = (e) => { if (ws !== sock) return; ultimoSinal = Date.now(); tratarMensagem(e); };
    sock.onerror = (e) => {
      // Token recusado (401): tentar de novo não resolve e o PC bloquearia o IP. Encerra.
      if (/\b401\b/.test(String((e as { message?: string })?.message ?? ''))) {
        settlePending((x) => x.reject(new AuthError('token inválido ou expirado')));
        rejeitarReady?.(new AuthError('token inválido ou expirado'));
        encerrada = true;
        clearInterval(batida);
      }
    };
    sock.onclose = () => { if (ws !== sock) return; ws = null; aoCair(); };
  }

  // Batimento: só derruba a conexão se o PC já mostrou que responde `pong` (PC 2.14+).
  const batida = setInterval(() => {
    if (encerrada || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (suportaPong && Date.now() - ultimoSinal > SILENCIO_MAXIMO_MS) {
      console.warn('[voice-ws] sem sinal do PC; refazendo a conexão');
      const velho = ws;
      ws = null;
      try { velho.close(); } catch { /* */ }
      aoCair();
      return;
    }
    try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* o onclose cuida */ }
  }, BATIDA_MS);

  conectar();

  function abrirPedido(
    resolve: Pending['resolve'], reject: Pending['reject'],
    onChunk?: OnChunk, onTranscript?: (texto: string) => void,
  ): Pending | null {
    if (pending) {
      reject(new Error('Ainda estou esperando a resposta anterior.'));
      return null;
    }
    const p: Pending = { resolve, reject, parcial: '', onChunk, onTranscript, enviado: false, aguardandoRetomada: false, caiuEm: 0, timeout: setTimeout(() => {}, 0) };
    pending = p;
    rearmar(p);
    return p;
  }

  function sendAudio(audioUri: string, onChunk?: OnChunk, onTranscript?: (texto: string) => void): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
      const p = abrirPedido(resolve, reject, onChunk, onTranscript);
      if (!p) return;
      p.enviado = true;

      (async () => {
        let bytes: Uint8Array;
        try {
          // A API v2 do expo-file-system devolve Uint8Array diretamente, sem
          // o roundtrip base64 que a legacy exigia. O URI do expo-audio recorder
          // é um file:// padrão, compatível com o construtor de File.
          bytes = await new FSFile(audioUri).bytes();
        } catch (err) {
          console.error('[voice-ws] falha lendo o áudio gravado', err);
          settlePending((x) => x.reject(new Error(`Não consegui ler o áudio gravado: ${errMessage(err)}`)));
          return;
        }

        try {
          if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('sem conexão');
          ws.send(bytes);
          console.log('[voice-ws] áudio enviado', bytes.byteLength, 'bytes');
        } catch (err) {
          console.error('[voice-ws] falha enviando áudio pro servidor', err);
          settlePending((x) => x.reject(new Error('Sem conexão com o PC para mandar o áudio.')));
        }
      })();
    });
  }

  function sendText(text: string, onChunk?: OnChunk, opcoes: { canal?: 'voz' | 'texto'; refazer?: boolean } = {}): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
      const p = abrirPedido(resolve, reject, onChunk);
      if (!p) return;
      p.id = novoIdDePedido();
      p.texto = text;
      p.canal = opcoes.canal;
      p.refazer = opcoes.refazer;
      // Aberta: sai agora. Reconectando: sai assim que abrir (aoAbrir).
      enviarComando(p);
    });
  }

  function close() {
    if (encerrada) return;
    encerrada = true;
    clearInterval(batida);
    if (timerReconexao) { clearTimeout(timerReconexao); timerReconexao = null; }
    // O "Parar": o PC descarta a resposta e tira o turno do histórico.
    if (pending?.id && pending.enviado && ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'parar', id: pending.id })); } catch { /* */ }
    }
    settlePending((p) => p.reject(new Error('Conexão encerrada antes da resposta.')));
    rejeitarReady?.(new ConexaoNaoAbriu('Conexão encerrada antes de abrir'));
    const velho = ws;
    ws = null;
    try { velho?.close(); } catch { /* */ }
    onClosed?.();
  }

  function viva(): boolean {
    return !encerrada && !!ws && ws.readyState === WebSocket.OPEN && (!suportaPong || Date.now() - ultimoSinal < SILENCIO_MAXIMO_MS);
  }

  function reconectar() {
    if (encerrada) return;
    if (timerReconexao) { clearTimeout(timerReconexao); timerReconexao = null; }
    tentativas = 0;
    const velho = ws;
    ws = null;
    try { velho?.close(); } catch { /* */ }
    if (pending?.enviado && pending.id) { pending.aguardandoRetomada = true; if (!pending.caiuEm) pending.caiuEm = Date.now(); onEstado?.('reconectando'); }
    conectar();
  }

  function pedirTela(id: string, pergunta: string, resposta: string): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify({ type: 'ui.ver', id, pergunta: pergunta.slice(0, 2000), resposta: resposta.slice(0, 6000) })); } catch { return false; }
    telaEsperada = id;
    return true;
  }

  function retomarTela(id: string) {
    telaEsperada = id;
    if (ws && ws.readyState === WebSocket.OPEN && !pending) {
      try { ws.send(JSON.stringify({ type: 'retomar', id })); } catch { /* aoAbrir tenta de novo */ }
    }
  }

  function cancelarTela(id: string) {
    if (telaEsperada === id) telaEsperada = null;
    try { ws?.send(JSON.stringify({ type: 'ui.cancelar', id })); } catch { /* */ }
  }

  return { ready, sendAudio, sendText, close, viva, reconectar, pedirTela, cancelarTela, retomarTela };
}
