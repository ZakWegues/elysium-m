/**
 * Camada HTTP compartilhada.
 *
 * Motivo de existir: nenhum fetch do app tinha timeout. Com o PC desligado ou fora
 * da rede, a promessa ficava pendurada indefinidamente e a tela travava num spinner
 * eterno — sem erro, sem retry, sem saída. Todo acesso à rede passa por aqui.
 */

export class AuthError extends Error {}
export class TimeoutError extends Error {}

/** Requisições normais: rápido o bastante para o usuário perceber que algo caiu. */
export const DEFAULT_TIMEOUT_MS = 8000;
/** Sondagem de descoberta: precisa ser curta, roda contra vários IPs em paralelo. */
export const PROBE_TIMEOUT_MS = 2500;
/** Comando que passa pelo cérebro: Whisper + Llama + executar ação leva segundos. */
export const COMMAND_TIMEOUT_MS = 45000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // AbortError não diz nada ao usuário; vira um erro nosso com mensagem útil.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(`o PC não respondeu em ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Espera exponencial com teto, compartilhada entre o WS de telemetria e a fila offline. */
export function backoffDelay(attempt: number, maxMs = 15000): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), maxMs);
}
