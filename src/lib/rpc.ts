/**
 * Cliente da superfície RPC do desktop (ver neuroaxis/src/services/rpc.ts).
 *
 * Diferença pro /api/command: aqui nada passa pelo LLM. "Matar o processo 4821" é
 * uma chamada com um inteiro, não uma frase que o modelo precisa interpretar certo.
 * Todo botão do app usa RPC; a voz e o campo de texto continuam no /api/command.
 */

import { baseUrl, Pairing } from './pairing';
import { AuthError, fetchWithTimeout, DEFAULT_TIMEOUT_MS } from './http';

/** O desktop recusa (403) métodos destrutivos sem este header. */
export class ConfirmationRequiredError extends Error {}

export type RpcMethod =
  | 'system.telemetry'
  | 'system.processes'
  | 'system.disks'
  | 'system.killProcess'
  | 'apps.list'
  | 'apps.open'
  | 'apps.close'
  | 'clipboard.get'
  | 'clipboard.set'
  | 'power.control'
  | 'media.control'
  | 'volume.set';

export type PowerOperation = 'shutdown' | 'restart' | 'sleep' | 'lock' | 'cancel';
export type MediaOperation = 'play' | 'pause' | 'skip' | 'previous' | 'volume_up' | 'volume_down';

export type ProcessEntry = {
  name: string;
  pid: number;
  cpu: number;
  ramMB: number;
  isSystem: boolean;
};

export type DiskEntry = {
  name: string;
  freeGB: number;
  totalGB: number;
  usedPct: number;
};

export type AppEntry = { key: string; command: string };

export type RpcResults = {
  'system.telemetry': Record<string, unknown>;
  'system.processes': { processes: ProcessEntry[] };
  'system.disks': { disks: DiskEntry[] };
  'system.killProcess': { ok: true };
  'apps.list': { apps: AppEntry[] };
  'apps.open': { ok: true; message: string };
  'apps.close': { ok: true; message: string };
  'clipboard.get': { text: string };
  'clipboard.set': { ok: true; length: number };
  'power.control': { ok: true; message: string };
  'media.control': { ok: true; message: string };
  'volume.set': { ok: true; message: string };
};

/** Espelha a marcação `destructive` do desktop — ver neuroaxis/src/services/rpc.ts. */
export const DESTRUCTIVE_METHODS: ReadonlySet<RpcMethod> = new Set<RpcMethod>([
  'system.killProcess',
  'apps.close',
  'power.control',
]);

export type RpcOptions = {
  /**
   * Marca a chamada como já confirmada pelo dono (biometria validada na tela).
   * Sem isso, métodos destrutivos voltam 403.
   */
  confirmed?: boolean;
  timeoutMs?: number;
};

export async function callRpc<M extends RpcMethod>(
  pairing: Pairing,
  method: M,
  params: Record<string, unknown> = {},
  options: RpcOptions = {}
): Promise<RpcResults[M]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${pairing.token}`,
  };
  if (options.confirmed) headers['X-Neuroaxis-Confirm'] = '1';

  const res = await fetchWithTimeout(
    `${baseUrl(pairing)}/api/rpc`,
    { method: 'POST', headers, body: JSON.stringify({ method, params }) },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (res.status === 401) throw new AuthError('token inválido ou expirado');

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.error === 'string' ? body.error : '';
    } catch {
      // corpo vazio ou não-JSON; segue com a mensagem genérica
    }
    if (res.status === 403) {
      throw new ConfirmationRequiredError(detail || 'esta ação precisa de confirmação');
    }
    console.error(`[rpc] ${method} -> ${res.status}`, detail || '(sem corpo)');
    throw new Error(detail || `servidor respondeu ${res.status}`);
  }

  const body = (await res.json()) as { result: RpcResults[M] };
  return body.result;
}

/** Métodos que o desktop conectado expõe — útil quando as versões divergem. */
export async function listRemoteMethods(
  pairing: Pairing
): Promise<{ method: string; destructive: boolean }[]> {
  const res = await fetchWithTimeout(
    `${baseUrl(pairing)}/api/rpc`,
    { headers: { Authorization: `Bearer ${pairing.token}` } },
    DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { methods?: { method: string; destructive: boolean }[] };
  return body.methods ?? [];
}
