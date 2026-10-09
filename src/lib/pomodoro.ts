import { useSyncExternalStore } from 'react';
import { callRpc, type EstadoPomodoro } from './rpc';
import type { Pairing } from './pairing';

/**
 * O pomodoro do PC visto do celular (fase 20). Mesmo desenho do `modo.ts`: o RPC ao abrir o
 * Hoje, o frame `pomodoro` do WebSocket na troca de fase, e a resposta dos botões.
 *
 * O relógio do card conta pelo `fimEm` do PC corrigido pela diferença entre os relógios
 * (`agora` do PC − `Date.now()` daqui, medida quando o estado chegou).
 */

type Guardado = { estado: EstadoPomodoro | null; diferenca: number };
let atual: Guardado = { estado: null, diferenca: 0 };
const ouvintes = new Set<() => void>();

function mudar(e: EstadoPomodoro | null): void {
  atual = { estado: e, diferenca: e?.ativo && typeof e.agora === 'number' ? e.agora - Date.now() : 0 };
  for (const fn of ouvintes) fn();
}

/** Só o formato esperado. Pura. */
export function pomodoroValido(x: unknown): EstadoPomodoro | null {
  const o = x as Partial<Extract<EstadoPomodoro, { ativo: true }>> | null;
  if (!o || typeof o !== 'object') return null;
  if (o.ativo !== true) return { ativo: false };
  if (typeof o.fimEm !== 'number' || (o.fase !== 'foco' && o.fase !== 'pausa' && o.fase !== 'longa')) return null;
  return { ativo: true, fase: o.fase, faseMin: Number(o.faseMin) || 0, fimEm: o.fimEm, restaMs: Number(o.restaMs) || 0, ciclo: Number(o.ciclo) || 1, de: Number(o.de) || 1, agora: typeof o.agora === 'number' ? o.agora : Date.now() };
}

/** Quanto falta, em ms, no relógio do PC. Pura. */
export function restaDoPomodoro(e: EstadoPomodoro | null, diferenca: number, agoraLocal = Date.now()): number {
  return e?.ativo ? Math.max(0, e.fimEm - (agoraLocal + diferenca)) : 0;
}

export function receberFramePomodoro(data: Record<string, unknown>): void {
  mudar(pomodoroValido(data.pomodoro));
}

export function usePomodoro(): Guardado {
  return useSyncExternalStore(
    (fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
    () => atual,
  );
}

export async function sincronizarPomodoro(pairing: Pairing): Promise<void> {
  try { mudar(pomodoroValido(await callRpc(pairing, 'pomodoro.get', {}, { timeoutMs: 6000 }))); }
  catch { /* PC antigo ou fora do ar */ }
}

export async function acaoPomodoro(pairing: Pairing, op: 'start' | 'stop' | 'skip', params: Record<string, unknown> = {}): Promise<void> {
  mudar(pomodoroValido(await callRpc(pairing, `pomodoro.${op}`, params)));
}
