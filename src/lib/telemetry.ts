import { Pairing } from './pairing';
import { openAuthedWebSocket, streamUrl } from './ws';
import { backoffDelay } from './http';
import { receberFrameEstado } from './estadoPc';
import { receberFrameModo } from './modo';
import { receberFramePomodoro } from './pomodoro';
import { canaisParados, marcarRecusa, marcarVivo, recusaDoErro } from './conexao/sinais';

/** 26/10: ping do cliente e silêncio máximo — o mesmo batimento do canal de voz (stream.ts). */
const BATIDA_MS = 15_000;
const SILENCIO_MAXIMO_MS = 35_000;

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
  let ultimoSinal = Date.now();
  let batida: ReturnType<typeof setInterval> | null = null;

  function connect() {
    if (stopped) return;
    onStatusChange?.('connecting');

    const socket = openAuthedWebSocket(pairing);
    ws = socket;

    socket.onopen = () => {
      console.log('[telemetry-ws] conectado', url);
      attempt = 0;
      ultimoSinal = Date.now();
      onStatusChange?.('open');
      // Socket morto pela suspensão do Android fica "aberto" até o TCP desistir: o ping
      // descobre antes, e o silêncio longo derruba e reabre.
      if (batida) clearInterval(batida);
      batida = setInterval(() => {
        if (ws !== socket || socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - ultimoSinal > SILENCIO_MAXIMO_MS) { try { socket.close(); } catch { /* */ } return; }
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch { /* o onclose cuida */ }
      }, BATIDA_MS);
    };

    socket.onmessage = (event) => {
      ultimoSinal = Date.now();
      marcarVivo();
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

    socket.onerror = (e) => {
      // Erro de conexão transitório (PC desligado/fora da rede) - reconexão automática
      // abaixo já trata isso, não é um erro acionável pelo usuário.
      console.warn('[telemetry-ws] erro na conexão', url);
      // 21/10: token recusado (401) não melhora tentando de novo — e cada tentativa conta como
      // recusa no PC, que bloqueia o IP depois de 20. Para o laço até o app reabrir a tela.
      // 26/10: e o 429 (o PC já pausou este IP) também — o estado da conexão mostra o cartão.
      const recusa = recusaDoErro(String((e as { message?: string })?.message ?? ''));
      if (recusa) { stopped = true; marcarRecusa(recusa); }
    };

    socket.onclose = () => {
      console.warn('[telemetry-ws] conexão fechada', url);
      onStatusChange?.('closed');
      if (batida) { clearInterval(batida); batida = null; }
      if (stopped) return;
      // Outro canal recebeu 401/429: espera o estado liberar em vez de somar recusas.
      if (canaisParados()) { retryTimer = setTimeout(connect, 15_000); return; }
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
    if (batida) clearInterval(batida);
    ws?.close();
  };
}
