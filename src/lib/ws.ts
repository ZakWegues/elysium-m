import { baseUrl, Pairing } from './pairing';

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
  return new WebSocketCtor(streamUrl(pairing), null, {
    headers: { Authorization: `Bearer ${pairing.token}` },
  });
}
