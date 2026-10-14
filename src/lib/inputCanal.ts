import { Pairing } from './pairing';
import { openAuthedWebSocket } from './ws';
import { callRpc } from './rpc';
import { Coalescedor, EventoInput } from './trackpad';

/**
 * O canal do trackpad (fase 22).
 *
 * Abre um WebSocket próprio (mesmo endereço e token do Chat) e, ao abrir, manda um `ping`.
 * Se o PC responder `input.pong` em 1 s, é o PC novo: os eventos de cada quadro saem num frame
 * `type:"input"` — ordem garantida pelo próprio socket. Sem resposta (PC antigo), cai no HTTP de
 * sempre, mas com regra: no máximo UM pedido em voo, o movimento acumulado enquanto espera, e o
 * clique só sai depois do último movimento — o defeito do trackpad antigo era o clique chegar
 * antes do cursor.
 */
export type ModoCanal = 'conectando' | 'ws' | 'http';

export class CanalInput {
  private ws: WebSocket | null = null;
  private fila = new Coalescedor();
  private agendado = false;
  private emVoo = false;
  private restoX = 0;
  private restoY = 0;
  private timerPong: ReturnType<typeof setTimeout> | null = null;
  private vigia: ReturnType<typeof setInterval> | null = null;
  private fechado = false;
  modo: ModoCanal = 'conectando';
  /** Ida e volta do último ping (ms), para mostrar na tela. */
  rtt: number | null = null;

  constructor(private readonly pairing: Pairing, private readonly aoMudarModo?: (m: ModoCanal) => void) {}

  abrir(): void {
    this.fechado = false;
    this.mudarModo('conectando');
    let ws: WebSocket;
    try { ws = openAuthedWebSocket(this.pairing); } catch { this.mudarModo('http'); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.ping();
      this.timerPong = setTimeout(() => { if (this.modo === 'conectando') this.mudarModo('http'); }, 1000);
      // O PC derruba socket parado há 90 s: um ping a cada 20 s mantém vivo e mede a latência.
      this.vigia = setInterval(() => this.ping(), 20_000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg?.type === 'input.pong') {
          if (typeof msg.t === 'number') this.rtt = Date.now() - msg.t;
          if (this.modo !== 'ws') this.mudarModo('ws');
        }
      } catch { /* outro tipo de mensagem: não é nossa */ }
    };
    ws.onerror = () => { /* o onclose decide */ };
    ws.onclose = () => {
      this.ws = null;
      this.limparTimers();
      if (!this.fechado) this.mudarModo('http');
    };
  }

  fechar(): void {
    this.fechado = true;
    this.limparTimers();
    try { this.ws?.close(); } catch { /* já fechado */ }
    this.ws = null;
  }

  /** Enfileira um evento; sai no próximo quadro. */
  enviar(e: EventoInput): void {
    this.fila.add(e);
    if (this.agendado) return;
    this.agendado = true;
    requestAnimationFrame(() => { this.agendado = false; this.esvaziar(); });
  }

  private ping(): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'input', ev: [['ping', Date.now()]] }));
  }

  private mudarModo(m: ModoCanal): void {
    this.modo = m;
    if (m !== 'conectando' && this.timerPong) { clearTimeout(this.timerPong); this.timerPong = null; }
    this.aoMudarModo?.(m);
    if (!this.fila.vazio) this.esvaziar();
  }

  private limparTimers(): void {
    if (this.timerPong) clearTimeout(this.timerPong);
    if (this.vigia) clearInterval(this.vigia);
    this.timerPong = null;
    this.vigia = null;
  }

  private esvaziar(): void {
    if (this.fila.vazio) return;
    if (this.modo === 'ws' && this.ws?.readyState === 1) {
      while (!this.fila.vazio) this.ws.send(JSON.stringify({ type: 'input', ev: this.fila.tirar(64) }));
      return;
    }
    // Conectando: espera o modo se decidir (no máximo 1 s) — o mudarModo esvazia.
    if (this.modo === 'conectando') return;
    void this.porHttp();
  }

  /** PC antigo: um pedido por vez, na ordem; o que chega enquanto isso espera e se junta. */
  private async porHttp(): Promise<void> {
    if (this.emVoo) return;
    this.emVoo = true;
    try {
      while (!this.fila.vazio) {
        for (const e of this.fila.tirar(64)) await this.umPorHttp(e);
      }
    } finally {
      this.emVoo = false;
    }
  }

  private async umPorHttp(e: EventoInput): Promise<void> {
    const p = this.pairing;
    try {
      switch (e[0]) {
        case 'm': {
          this.restoX += e[1]; this.restoY += e[2];
          const dx = Math.trunc(this.restoX), dy = Math.trunc(this.restoY);
          this.restoX -= dx; this.restoY -= dy;
          if (dx || dy) await callRpc(p, 'input.move', { dx, dy });
          break;
        }
        case 'w':
          if (Math.round(e[1])) await callRpc(p, 'input.scroll', { notches: Math.round(e[1]) });
          break;
        case 'd': await callRpc(p, 'input.buttonDown', { button: e[1] }); break;
        case 'u': await callRpc(p, 'input.buttonUp', { button: e[1] }); break;
        case 'c': await callRpc(p, 'input.click', { button: e[1] }); break;
        case 'dc': await callRpc(p, 'input.doubleClick', { button: 'left' }); break;
        case 'k': await callRpc(p, 'input.combo', { keys: e[1] }); break;
        case 't': await callRpc(p, 'input.type', { text: e[1] }); break;
        case 'bs': await callRpc(p, 'input.key', { sequence: `{BACKSPACE ${e[1]}}` }); break;
        case 'ping': break;
      }
    } catch { /* um evento perdido não para os seguintes */ }
  }
}
