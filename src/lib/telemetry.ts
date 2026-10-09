import { Pairing } from './pairing';
import { openAuthedWebSocket, streamUrl } from './ws';
import { backoffDelay } from './http';
import { receberFrameEstado } from './estadoPc';
import { receberFrameModo } from './modo';
import { receberFramePomodoro } from './pomodoro';

export type TelemetryFrame = Record<string, unknown> & { type: 'telemetry' };
export type TelemetryStatus = 'connecting' | 'open' | 'closed';

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
      } else if (data.type === 'pc.estado') {
        receberFrameEstado(data);
      } else if (data.type === 'modo') {
        // Fase 20: o chip do modo acompanha a troca feita no PC ou pela voz.
        receberFrameModo(data);
      } else if (data.type === 'pomodoro') {
        receberFramePomodoro(data);
      }
    };

    socket.onerror = () => {
      // Erro de conexão transitório (PC desligado/fora da rede) - reconexão automática
      // abaixo já trata isso, não é um erro acionável pelo usuário.
      console.warn('[telemetry-ws] erro na conexão', url);
    };

    socket.onclose = () => {
      console.warn('[telemetry-ws] conexão fechada', url);
      onStatusChange?.('closed');
      if (stopped) return;
      attempt += 1;
      const delay = backoffDelay(attempt);
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
