import { useSyncExternalStore } from 'react';
import { callRpc } from './rpc';
import type { Pairing } from './pairing';

/**
 * O modo da Ely, visto do celular (fase 20): "∑ Matemática", "EN Inglês"…
 *
 * A fonte da verdade é o PC (`modos.ts`). O chip daqui se atualiza por três caminhos: o RPC
 * `modos.get` ao abrir o chat, o frame `modo` do WebSocket (troca feita pela voz ou no PC,
 * na hora) e a resposta do `modos.set` quando a troca é feita aqui.
 */

export type ModoCliente = { id: string; nome: string; icone: string; resumo: string; meu: boolean };

let atual: ModoCliente | null = null;
const ouvintes = new Set<() => void>();

function mudar(m: ModoCliente | null): void {
  if (m?.id === atual?.id && m?.nome === atual?.nome) return;
  atual = m;
  for (const fn of ouvintes) fn();
}

/** Aceita só o formato esperado; qualquer outra coisa é "sem modo". Pura. */
export function modoValido(x: unknown): ModoCliente | null {
  const o = x as Partial<ModoCliente> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.nome !== 'string') return null;
  return {
    id: o.id,
    nome: o.nome.slice(0, 40),
    icone: typeof o.icone === 'string' ? o.icone.slice(0, 3) : '✦',
    resumo: typeof o.resumo === 'string' ? o.resumo : '',
    meu: o.meu === true,
  };
}

/** Frame `{ type: 'modo', modo }` do WebSocket. */
export function receberFrameModo(data: Record<string, unknown>): void {
  mudar(modoValido(data.modo));
}

export function modoAtual(): ModoCliente | null { return atual; }

export function useModo(): ModoCliente | null {
  return useSyncExternalStore(
    (fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
    () => atual,
  );
}

/** Pergunta ao PC (PC antigo sem modos: fica sem chip, sem erro). */
export async function sincronizarModo(pairing: Pairing): Promise<void> {
  try { mudar(modoValido((await callRpc(pairing, 'modos.get', {}, { timeoutMs: 6000 })).ativo)); }
  catch { /* PC antigo ou fora do ar */ }
}

/** Liga (id) ou sai (null). Lança se o PC recusar — quem chama mostra o erro. */
export async function trocarModo(pairing: Pairing, id: string | null): Promise<ModoCliente | null> {
  const r = await callRpc(pairing, 'modos.set', { id });
  const m = modoValido(r.ativo);
  mudar(m);
  return m;
}
