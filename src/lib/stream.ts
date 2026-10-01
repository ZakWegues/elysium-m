import { File as FSFile } from 'expo-file-system';
import { errMessage } from './errors';
import { Pairing } from './pairing';
import { openAuthedWebSocket, streamUrl } from './ws';
import { receberEntrega } from './notificacoes';
import type { Entrega } from './rpc';

import type { Fonte } from './chatHistoryStore';

type StreamResult = { transcript?: string; reply: string; fontes?: Fonte[] };

/**
 * Recebe a resposta ACUMULADA a cada pedaço que o PC manda — o texto inteiro até agora,
 * não só o pedaço. Quem desenha a bolha só substitui o texto; não precisa concatenar.
 */
export type OnChunk = (parcial: string) => void;

type Pending = {
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

export type VoiceConnection = {
  ready: Promise<void>;
  /** Manda o áudio gravado; o PC transcreve (`onTranscript`, antes dos pedaços) e responde. */
  sendAudio(audioUri: string, onChunk?: OnChunk, onTranscript?: (texto: string) => void): Promise<StreamResult>;
  /** Manda texto pelo mesmo WebSocket — é o caminho que recebe a resposta em pedaços. */
  /** `canal: 'texto'` = digitado (resposta de chat); sem ele, o curto da voz (bloco 130). */
  sendText(text: string, onChunk?: OnChunk, opcoes?: { canal?: 'voz' | 'texto'; refazer?: boolean }): Promise<StreamResult>;
  close(): void;
};

export function openVoiceConnection(
  pairing: Pairing,
  onClosed?: () => void,
  /** Sugestões de próxima pergunta (bloco 132): chegam DEPOIS do reply, fora de pedido. */
  onSugestoes?: (sugestoes: string[]) => void,
): VoiceConnection {
  const url = streamUrl(pairing);
  const ws = openAuthedWebSocket(pairing);

  let pending: Pending | null = null;

  function settlePending(fn: (p: Pending) => void) {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timeout);
    fn(p);
  }

  function rearmar(p: Pending) {
    clearTimeout(p.timeout);
    p.timeout = setTimeout(() => {
      console.error('[voice-ws] PC parou de responder');
      settlePending((x) => x.reject(new Error('Falha: o PC parou de responder no meio')));
    }, INATIVIDADE_MS);
  }

  const ready = new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      console.log('[voice-ws] conectado', url);
      resolve();
    };
    ws.addEventListener('error', () => {
      console.error('[voice-ws] falha ao conectar', url);
      reject(new Error('Falha na conexão WebSocket'));
    });
  });

  ws.onmessage = (event) => {
    let data: { type?: string; text?: string; reply?: string; error?: string; fontes?: Fonte[]; sugestoes?: string[] } & Partial<Entrega>;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error('[voice-ws] resposta ilegível do servidor', event.data, err);
      settlePending((p) => p.reject(new Error(`Falha ao interpretar resposta do servidor: ${errMessage(err)}`)));
      return;
    }

    // Telemetria também chega por aqui, a cada 5 s; só os tipos abaixo interessam.
    if (data.type === 'transcript') {
      if (pending) {
        pending.transcript = data.text;
        rearmar(pending);
        if (data.text) pending.onTranscript?.(data.text);
      }
    } else if (data.type === 'chunk') {
      if (pending) {
        pending.parcial += data.text ?? '';
        rearmar(pending);
        pending.onChunk?.(pending.parcial);
      }
    } else if (data.type === 'reply') {
      settlePending((p) => p.resolve({ transcript: p.transcript, reply: data.reply ?? p.parcial, fontes: Array.isArray(data.fontes) ? data.fontes : undefined }));
    } else if (data.type === 'sugestoes') {
      if (Array.isArray(data.sugestoes)) onSugestoes?.(data.sugestoes.filter((s): s is string => typeof s === 'string').slice(0, 3));
    } else if (data.type === 'notify') {
      // Uma entrega na hora (rotina executada, lembrete): vira notificação local e é
      // confirmada ao PC. Bloco 72.
      if (data.id && data.titulo) {
        receberEntrega({ id: data.id, tipo: data.tipo ?? 'aviso', titulo: data.titulo, corpo: data.corpo ?? '', em: data.em ?? Date.now(), ref: data.ref }, pairing).catch(() => {});
      }
    } else if (data.type === 'error') {
      console.error('[voice-ws] servidor retornou erro', data.error);
      settlePending((p) => p.reject(new Error(`Falha do servidor: ${data.error ?? 'erro sem mensagem'}`)));
    }
  };

  ws.onerror = () => {
    console.error('[voice-ws] erro na conexão WebSocket');
    settlePending((p) => p.reject(new Error('Falha na conexão WebSocket')));
  };

  ws.onclose = () => {
    console.error('[voice-ws] conexão fechada', url);
    settlePending((p) => p.reject(new Error('Falha: conexão fechada antes da resposta')));
    onClosed?.();
  };

  function abrirPedido(
    resolve: Pending['resolve'], reject: Pending['reject'],
    onChunk?: OnChunk, onTranscript?: (texto: string) => void,
  ): Pending | null {
    if (pending) {
      reject(new Error('Falha: já existe um envio em andamento nesta conexão'));
      return null;
    }
    const p: Pending = { resolve, reject, parcial: '', onChunk, onTranscript, timeout: setTimeout(() => {}, 0) };
    pending = p;
    rearmar(p);
    return p;
  }

  function sendAudio(audioUri: string, onChunk?: OnChunk, onTranscript?: (texto: string) => void): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
      if (!abrirPedido(resolve, reject, onChunk, onTranscript)) return;

      (async () => {
        let bytes: Uint8Array;
        try {
          // A API v2 do expo-file-system devolve Uint8Array diretamente, sem
          // o roundtrip base64 que a legacy exigia. O URI do expo-audio recorder
          // é um file:// padrão, compatível com o construtor de File.
          bytes = await new FSFile(audioUri).bytes();
        } catch (err) {
          console.error('[voice-ws] falha lendo o áudio gravado', err);
          settlePending((p) => p.reject(new Error(`Falha ao ler o áudio gravado: ${errMessage(err)}`)));
          return;
        }

        try {
          ws.send(bytes);
          console.log('[voice-ws] áudio enviado', bytes.byteLength, 'bytes');
        } catch (err) {
          console.error('[voice-ws] falha enviando áudio pro servidor', err);
          settlePending((p) => p.reject(new Error(`Falha ao enviar pro servidor: ${errMessage(err)}`)));
        }
      })();
    });
  }

  function sendText(text: string, onChunk?: OnChunk, opcoes: { canal?: 'voz' | 'texto'; refazer?: boolean } = {}): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
      if (!abrirPedido(resolve, reject, onChunk)) return;
      try {
        // PC antigo ignora os campos novos: o comando roda igual, só que no curto de sempre.
        ws.send(JSON.stringify({ type: 'command', text, ...opcoes }));
      } catch (err) {
        settlePending((p) => p.reject(new Error(`Falha ao enviar pro servidor: ${errMessage(err)}`)));
      }
    });
  }

  function close() {
    settlePending((p) => p.reject(new Error('Falha: conexão encerrada antes da resposta')));
    ws.close();
  }

  return { ready, sendAudio, sendText, close };
}
