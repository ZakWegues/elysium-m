import { Pairing } from './pairing';

export type TelemetryFrame = Record<string, unknown> & { type: 'telemetry' };
export type TelemetryStatus = 'connecting' | 'open' | 'closed';

export function openTelemetryStream(
  pairing: Pairing,
  onSnapshot: (data: TelemetryFrame) => void,
  onStatusChange?: (status: TelemetryStatus) => void
): () => void {
  const url = `ws://${pairing.ip}:${pairing.port}/api/stream`;
  const WebSocketCtor = WebSocket as unknown as new (
    url: string,
    protocols: null,
    options: { headers: Record<string, string> }
  ) => WebSocket;
  const ws = new WebSocketCtor(url, null, { headers: { Authorization: `Bearer ${pairing.token}` } });

  onStatusChange?.('connecting');

  ws.onopen = () => {
    console.log('[telemetry-ws] conectado', url);
    onStatusChange?.('open');
  };

  ws.onmessage = (event) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error('[telemetry-ws] frame ilegível', event.data, err);
      return;
    }
    if (data.type === 'telemetry') {
      onSnapshot(data as TelemetryFrame);
    }
  };

  ws.onerror = () => {
    console.error('[telemetry-ws] erro na conexão', url);
  };

  ws.onclose = () => {
    console.error('[telemetry-ws] conexão fechada', url);
    onStatusChange?.('closed');
  };

  return () => ws.close();
}
