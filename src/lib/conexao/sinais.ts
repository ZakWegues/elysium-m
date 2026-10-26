/**
 * Sinais que os canais com o PC (WebSockets de voz, telemetria e trackpad; RPC) dão ao estado da
 * conexão (26/10). Um frame ou uma RPC que deu certo prova que o PC está lá — sem sonda extra.
 * E o contrário: com token recusado (401) ou o PC pausando este IP (429), nenhum canal deve
 * insistir, senão cada tentativa conta como recusa e o PC bloqueia o celular por 10 min.
 */

type Ouvinte = (sinal: 'vivo' | 'token' | 'bloqueado') => void;
const ouvintes = new Set<Ouvinte>();
let parado: 'token' | 'bloqueado' | null = null;
let ultimoVivo = 0;

export function aoSinal(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** O PC respondeu alguma coisa. Barato: no máximo um aviso por segundo. */
export function marcarVivo(): void {
  const agora = Date.now();
  if (agora - ultimoVivo < 1000) return;
  ultimoVivo = agora;
  for (const fn of ouvintes) fn('vivo');
}

export function marcarRecusa(tipo: 'token' | 'bloqueado'): void {
  parado = tipo;
  for (const fn of ouvintes) fn(tipo);
}

/** Pareamento novo ou a pausa acabou: os canais podem voltar a tentar. */
export function liberarCanais(): void {
  parado = null;
}

/** Os canais consultam antes de reconectar. */
export function canaisParados(): boolean {
  return parado !== null;
}

/** Erro de WebSocket/HTTP com cara de 401 ou 429 (no RN a mensagem varia por versão). Pura. */
export function recusaDoErro(msg: string): 'token' | 'bloqueado' | null {
  if (/\b401\b|unauthori[sz]ed/i.test(msg)) return 'token';
  if (/\b429\b|too many/i.test(msg)) return 'bloqueado';
  return null;
}
