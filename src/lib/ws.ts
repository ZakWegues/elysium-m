import { baseUrl, Pairing } from './pairing';
import { cabecalhoAssinado } from './assinatura';

type AuthedWebSocketCtor = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> }
) => WebSocket;

export function streamUrl(pairing: Pairing): string {
  return `${baseUrl(pairing).replace(/^http/, 'ws')}/api/stream`;
}

export function openAuthedWebSocket(pairing: Pairing): WebSocket {
  const WebSocketCtor = WebSocket as unknown as AuthedWebSocketCtor;
  const url = streamUrl(pairing);
  // 31/10: assinatura no lugar do token (ver assinatura.ts).
  return new WebSocketCtor(url, null, { headers: cabecalhoAssinado(pairing.token, 'GET', url) });
}
