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
  | 'volume.set'
  | 'screen.list'
  | 'screen.capture'
  | 'input.ping'
  | 'input.move'
  | 'input.click'
  | 'input.doubleClick'
  | 'input.buttonDown'
  | 'input.buttonUp'
  | 'input.scroll'
  | 'input.type'
  | 'input.key'
  | 'memory.list'
  | 'memory.add'
  | 'memory.remove'
  | 'reminders.list'
  | 'reminders.create'
  | 'reminders.cancel'
  | 'push.register'
  | 'push.unregister'
  | 'push.getPrefs'
  | 'push.setPrefs'
  | 'vision.ask'
  | 'vision.screen'
  | 'web.search'
  | 'spotify.status'
  | 'spotify.login'
  | 'spotify.logout'
  | 'spotify.nowPlaying'
  | 'spotify.command'
  | 'spotify.volume'
  | 'spotify.seek'
  | 'spotify.playSearch'
  | 'spotify.shuffle'
  | 'spotify.repeat'
  | 'chat.list'
  | 'chat.get'
  | 'chat.save'
  | 'chat.favorite'
  | 'chat.delete'
  | 'pairing.endpoints';

export type RepeatState = 'off' | 'track' | 'context';

export type NowPlaying = {
  isPlaying: boolean;
  track: string;
  artist: string;
  album: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  device: string | null;
  /** Volume do dispositivo, 0-100. Null quando o dispositivo não expõe controle. */
  volumePercent: number | null;
  shuffle: boolean;
  repeat: RepeatState;
};

export type MemoryFact = { id: string; text: string; createdAt: number };

export type Reminder = {
  id: string;
  text: string;
  dueAt: number;
  kind: 'once' | 'weekly';
  weekday?: number;
  createdAt: number;
  firedAt?: number;
};

export type PushCategory = 'reminder' | 'anomaly' | 'mailbox';

export type PushPrefs = {
  muted: PushCategory[];
  quietFrom: number;
  quietTo: number;
  deviceCount: number;
};

export type MouseButton = 'left' | 'right' | 'middle';

export type ScreenInfo = {
  id: string;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
};

export type CapturedFrame = {
  /** JPEG em base64, sem o prefixo data:. */
  base64: string;
  width: number;
  height: number;
  capturedAt: number;
  sourceId: string;
  sourceName: string;
};

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
  'screen.list': { screens: ScreenInfo[] };
  'screen.capture': CapturedFrame;
  'input.ping': { ok: true };
  'input.move': { ok: true };
  'input.click': { ok: true };
  'input.doubleClick': { ok: true };
  'input.buttonDown': { ok: true };
  'input.buttonUp': { ok: true };
  'input.scroll': { ok: true };
  'input.type': { ok: true };
  'input.key': { ok: true };
  'memory.list': { facts: MemoryFact[] };
  'memory.add': { fact: MemoryFact; created: boolean };
  'memory.remove': { removed: boolean };
  'reminders.list': { reminders: Reminder[] };
  'reminders.create': { reminder: Reminder };
  'reminders.cancel': { cancelled: boolean };
  'push.register': { added: boolean };
  'push.unregister': { removed: boolean };
  'push.getPrefs': PushPrefs;
  'push.setPrefs': PushPrefs;
  'vision.ask': { answer: string };
  'vision.screen': { answer: string };
  'web.search': { answer: string };
  'spotify.status': { connected: boolean };
  'spotify.login': { ok: true; message: string };
  'spotify.logout': { ok: true };
  'spotify.nowPlaying': { nowPlaying: NowPlaying | null };
  'spotify.command': { ok: true };
  'spotify.volume': { ok: true };
  'spotify.seek': { ok: true };
  'spotify.playSearch': { playing: { track: string; artist: string } };
  'spotify.shuffle': { ok: true };
  'spotify.repeat': { ok: true };
  'chat.list': { sessions: SyncedChatSession[] };
  'chat.get': { session: SyncedChatSession | null };
  'chat.save': { session: SyncedChatSession };
  'chat.favorite': { favorite: boolean | null };
  'chat.delete': { deleted: boolean };
  'pairing.endpoints': {
    endpoints: string[];
    /** Existe caminho de fora da rede de casa (Tailscale/ZeroTier no PC). */
    hasTunnel: boolean;
    hostname: string;
    port: number;
  };
};

/** Mesmo formato do `ChatSession` local — ver `chatHistoryStore.ts`. */
export type SyncedChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  messages: { id: string; from: 'me' | 'reply' | 'error'; text: string; ts: number }[];
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
