import { Pairing } from './pairing';
import { openAuthedWebSocket, streamUrl } from './ws';

export type TelemetryFrame = Record<string, unknown> & { type: 'telemetry' };
export type TelemetryStatus = 'connecting' | 'open' | 'closed';

const MAX_RETRY_DELAY_MS = 15000;

export function openTelemetryStream(
  pairing: Pairing,
  onSnapshot: (data: TelemetryFrame) => void,
  onStatusChange?: (status: TelemetryStatus) => void
): () => void {
  const url = streamUrl(pairing);

  let stopped = false;
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function connect() {
    if (stopped) return;
    onStatusChange?.('connecting');

    const socket = openAuthedWebSocket(pairing);
    ws = socket;

    socket.onopen = () => {
      console.log('[telemetry-ws] conectado', url);
      attempt = 0;
      onStatusChange?.('open');
    };

    socket.onmessage = (event) => {
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

    socket.onerror = () => {
      console.error('[telemetry-ws] erro na conexão', url);
    };

    socket.onclose = () => {
      console.error('[telemetry-ws] conexão fechada', url);
      onStatusChange?.('closed');
      if (stopped) return;
      attempt += 1;
      const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      console.log(`[telemetry-ws] tentando reconectar em ${delay}ms (tentativa ${attempt})`);
      retryTimer = setTimeout(connect, delay);
    };
  }

  connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}
