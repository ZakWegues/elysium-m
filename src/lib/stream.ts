import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray } from 'base64-js';
import { errMessage } from './errors';
import { Pairing } from './pairing';

type StreamResult = { transcript?: string; reply: string };

type Pending = {
  resolve: (result: StreamResult) => void;
  reject: (err: Error) => void;
  transcript?: string;
  timeout: ReturnType<typeof setTimeout>;
};

export type VoiceConnection = {
  ready: Promise<void>;
  sendAudio(audioUri: string): Promise<StreamResult>;
  close(): void;
};

export function openVoiceConnection(pairing: Pairing, onClosed?: () => void): VoiceConnection {
  const url = `ws://${pairing.ip}:${pairing.port}/api/stream`;
  const WebSocketCtor = WebSocket as unknown as new (
    url: string,
    protocols: null,
    options: { headers: Record<string, string> }
  ) => WebSocket;
  const ws = new WebSocketCtor(url, null, { headers: { Authorization: `Bearer ${pairing.token}` } });

  let pending: Pending | null = null;

  function settlePending(fn: (p: Pending) => void) {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timeout);
    fn(p);
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
    let data: { type?: string; text?: string; reply?: string; error?: string };
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error('[voice-ws] resposta ilegível do servidor', event.data, err);
      settlePending((p) => p.reject(new Error(`Falha ao interpretar resposta do servidor: ${errMessage(err)}`)));
      return;
    }

    console.log('[voice-ws] frame recebido', data.type);

    if (data.type === 'transcript') {
      if (pending) pending.transcript = data.text;
    } else if (data.type === 'reply') {
      settlePending((p) => p.resolve({ transcript: p.transcript, reply: data.reply ?? '' }));
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

  function sendAudio(audioUri: string): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
      if (pending) {
        reject(new Error('Falha: já existe um envio de áudio em andamento nesta conexão'));
        return;
      }

      const timeout = setTimeout(() => {
        console.error('[voice-ws] timeout esperando reply/error');
        settlePending((p) => p.reject(new Error('Falha: tempo esgotado esperando resposta')));
      }, 20000);

      pending = { resolve, reject, timeout };

      (async () => {
        let bytes: Uint8Array;
        try {
          const base64 = await FileSystem.readAsStringAsync(audioUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          bytes = toByteArray(base64);
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

  function close() {
    settlePending((p) => p.reject(new Error('Falha: conexão encerrada antes da resposta')));
    ws.close();
  }

  return { ready, sendAudio, close };
}
