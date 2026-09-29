/**
 * Cliente da superfície RPC do desktop (ver elysium/src/services/rpc.ts).
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
  | 'system.diagnostico'
  | 'update.status'
  | 'update.install'
  | 'storage.info'
  | 'system.saude'
  | 'system.saude.consertar'
  | 'storage.clean'
  | 'storage.open'
  | 'system.processes'
  | 'system.disks'
  | 'system.killProcess'
  | 'apps.list'
  | 'apps.running'
  | 'apps.open'
  | 'apps.close'
  | 'clipboard.get'
  | 'clipboard.set'
  | 'power.control'
  | 'media.control'
  | 'volume.set'
  | 'volume.get'
  | 'window.list'
  | 'window.control'
  | 'screen.list'
  | 'screen.capture'
  | 'screen.screenshot'
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
  // 🔴 LÁPIDE NO SENTIDO PC → CELULAR. O `chat.list` passou a devolver também os ids que
  // o PC apagou; o `ackDeleted` é o celular confirmando que apagou a cópia dele, e é só
  // depois dele que o PC solta o registro. Sem esse par, apagar no PC não se propagava:
  // o passo de `chat.save` reempurrava a conversa e ela voltava viva.
  | 'chat.ackDeleted'
  | 'chat.rename'
  // Conversas do lado PC (a Caixa). Entraram junto com as sessoes do mailbox: ate aqui
  // a Caixa era UMA thread infinita, e o §16 registrava a falta do DELETE como C15.
  | 'mailbox.sessions.list'
  | 'mailbox.sessions.create'
  | 'mailbox.sessions.rename'
  | 'mailbox.sessions.favorite'
  | 'mailbox.sessions.open'
  | 'mailbox.sessions.save'
  | 'mailbox.sessions.delete'
  | 'mailbox.sessions.ackDeleted'
  | 'mailbox.messages.delete'
  | 'pairing.endpoints'
  // Entraram na fase 3. Os quatro de preset existem porque o `presetsStore` do desktop
  // nunca tinha sido exposto: até aqui a tela de presets montava "executa o preset X" e
  // mandava para o LLM, que é lento e pode errar num comando já conhecido.
  | 'presets.list'
  | 'presets.run'
  | 'presets.save'
  | 'presets.delete'
  | 'suggestions.list'
  | 'weather.now'
  | 'rotinas.list'
  | 'rotinas.save'
  | 'rotinas.delete'
  | 'rotinas.toggle'
  | 'rotinas.run'
  | 'notify.pending'
  | 'notify.history'
  | 'notify.ack'
  | 'chat.starters';

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

/** Uma rotina do PC (elysium/src/services/rotinas.ts, bloco 68). */
/** Uma janela aberta no PC (`window.list`, bloco 87). */
export type Janela = {
  hwnd: string;
  pid: number;
  processo: string;
  titulo: string;
  minimizada: boolean;
  maximizada: boolean;
  emFoco: boolean;
};

export type Rotina = {
  id: string;
  nome: string;
  texto: string;
  /** "HH:MM" local do PC. */
  hora: string;
  /** 0 = domingo … 6 = sábado; vazio = todos os dias. */
  dias: number[];
  entregar: ('pc' | 'celular')[];
  falar: boolean;
  ativa: boolean;
  criadaEm: number;
  ultimaExecucao?: number;
  ultimoResultado?: string;
  /** Próximo disparo em epoch ms, calculado pelo PC. `null` em rotina por evento. */
  proxima: number | null;
  /** Gatilho por evento (bloco 79). Ausente = por hora. */
  gatilho?: { tipo: 'hora' } | { tipo: 'evento'; evento: string; app?: string; minutos?: number; limite?: number; cada?: number };
  /** Condição em português avaliada pelo cérebro antes de rodar. */
  condicao?: string;
  /** "às 07:30" ou "quando o Chrome abrir" — pronto para a tela. */
  quando?: string;
};

/** Uma entrega da fila do PC para este celular (rotina executada, lembrete disparado). */
export type Entrega = {
  id: string;
  tipo: 'rotina' | 'lembrete' | 'aviso';
  titulo: string;
  corpo: string;
  em: number;
  entregueEm?: number;
  ref?: string;
};

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
/** Processo com janela principal — o que "aberto" significa para quem olha a tela. */
export type RunningApp = { name: string; pid: number; title: string };

export type PresetEntry = {
  name: string;
  description: string;
  icon?: string;
  /** Quantidade de ações, não as ações em si — a lista não precisa delas. */
  actions: number;
};

/** Uma bolha da tela Início. O desktop sorteia; os dois lados recebem as mesmas. */
export type Sugestao = {
  texto: string;
  /** Nome de ícone do Feather. */
  icone: string;
  detalhe?: string;
  peso: number;
  acao?: {
    metodo?: string;
    params?: Record<string, unknown>;
    aviso?: string;
    /** Em vez de executar, leva para uma tela. */
    aba?: string;
  };
};

export type Clima = {
  cidade: string;
  temperatura: number;
  max: number;
  min: number;
  descricao: string;
  icone: string;
  chuvaHoje: boolean;
  /** Desde o bloco 67 do desktop; opcionais para um PC antigo. */
  sensacao?: number;
  horas?: { hora: number; temp: number; icone: string; chuva: boolean }[];
  amanha?: { max: number; min: number; icone: string };
};

/** Uma versão publicada como release no GitHub e guardada pelo PC (bloco 95). */
export type PacoteAtualizacao = {
  versao: string;
  notas: string;
  publicadaEm: string;
  tamanho: number;
  pronto: boolean;
  progresso: number;
};

/** O que ocupa o disco do PC (fase 12). */
export type Armazenamento = {
  discos: DiskEntry[];
  downloads: number;
  temp: number;
  lixeira: number;
  grandes: { nome: string; bytes: number; em: number }[];
  medidoEm: number;
};

/** Um item do card "Saúde do ELYSIUM" (fase 12). */
export type ItemSaude = {
  id: string;
  titulo: string;
  nivel: 'ok' | 'aviso' | 'erro';
  detalhe: string;
  conserto?: { rotulo: string; tipo: 'consertar' | 'painel' | 'rpc'; valor: string };
};

export type RpcResults = {
  'system.telemetry': Record<string, unknown>;
  /** Bloco 97: o mesmo "copiar diagnóstico" dos Ajustes do PC, sem chave nem token. */
  'system.diagnostico': { texto: string };
  'update.install': { ok: boolean; mensagem: string };
  'storage.info': Armazenamento;
  'system.saude': { itens: ItemSaude[] };
  'system.saude.consertar': { message: string };
  'storage.clean': { liberado: number; message: string };
  'storage.open': { ok: boolean; message: string };
  'update.status': {
    pc: string;
    verificadoEm: number | null;
    erro: string | null;
    desktop: PacoteAtualizacao | null;
    celular: PacoteAtualizacao | null;
  };
  'system.processes': { processes: ProcessEntry[] };
  'system.disks': { disks: DiskEntry[] };
  'system.killProcess': { ok: true };
  'apps.list': { apps: AppEntry[] };
  'apps.running': { apps: RunningApp[] };
  'apps.open': { ok: true; message: string };
  'apps.close': { ok: true; message: string };
  'clipboard.get': { text: string };
  'clipboard.set': { ok: true; length: number };
  'power.control': { ok: true; message: string };
  'media.control': { ok: true; message: string };
  'volume.set': { ok: true; message: string };
  /** Bloco 87: janela por janela, com o hwnd que as ações usam. */
  'window.list': { janelas: Janela[] };
  'window.control': { ok: true; message: string };
  /** Bloco 86: o volume de verdade do PC (Core Audio), 0–100. */
  'volume.get': { nivel: number; mudo: boolean };
  'screen.list': { screens: ScreenInfo[] };
  'screen.capture': CapturedFrame;
  'screen.screenshot': { ok: true; message: string };
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
  /** `deleted`: ids apagados NO PC que este aparelho ainda precisa aplicar. */
  'chat.list': { sessions: SyncedChatSession[]; deleted?: string[] };
  'chat.get': { session: SyncedChatSession | null };
  'chat.save': { session: SyncedChatSession };
  'chat.favorite': { favorite: boolean | null };
  'chat.delete': { deleted: boolean };
  'chat.ackDeleted': { cleared: number };
  'chat.rename': { session: SyncedChatSession | null };
  'mailbox.sessions.list': { sessions: SyncedMailboxSession[]; deleted?: string[] };
  'mailbox.sessions.create': { session: SyncedMailboxSession };
  'mailbox.sessions.rename': { session: SyncedMailboxSession | null };
  'mailbox.sessions.favorite': { favorite: boolean | null };
  'mailbox.sessions.open': { ok: boolean };
  'mailbox.sessions.save': { session: SyncedMailboxSession };
  'mailbox.sessions.delete': { deleted: boolean };
  'mailbox.sessions.ackDeleted': { cleared: number };
  'mailbox.messages.delete': { deleted: boolean };
  'presets.list': { presets: PresetEntry[] };
  'presets.run': { ran: string | null; reply: string };
  'presets.save': { saved: string };
  'presets.delete': { deleted: string };
  'suggestions.list': { suggestions: Sugestao[] };
  /** Perguntas de partida do chat, sorteadas no desktop — ver `perguntas.ts`. */
  'chat.starters': { starters: string[] };
  /** `null` quando não há cidade configurada ou a consulta falhou — ver `clima.ts`. */
  'weather.now': Clima | null;
  'rotinas.list': { rotinas: Rotina[]; eventos?: { id: string; rotulo: string }[] };
  'rotinas.save': { rotina: Rotina };
  'rotinas.delete': { deleted: boolean };
  'rotinas.toggle': { rotina: Rotina };
  'rotinas.run': { resultado: string };
  'notify.pending': { entregas: Entrega[] };
  'notify.history': { entregas: Entrega[] };
  'notify.ack': { acked: number };
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
  /** Nome dado à mão. Viaja no contrato: sem ele o outro lado recalcularia o título. */
  titleCustom?: boolean;
  messages: { id: string; from: 'me' | 'reply' | 'error'; text: string; ts: number }[];
};

/**
 * Uma conversa da Caixa. Mesmo formato do `SyncedChatSession`, sem as mensagens: elas
 * ja moram no PC e chegam pelo /api/mailbox/messages, nao pelo RPC.
 */
export type SyncedMailboxSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  /** Quantos recados a conversa tem. So a lista devolve. */
  count?: number;
};

/** Espelha a marcação `destructive` do desktop — ver elysium/src/services/rpc.ts. */
export const DESTRUCTIVE_METHODS: ReadonlySet<RpcMethod> = new Set<RpcMethod>([
  'system.killProcess',
  'apps.close',
  'power.control',
  // Apagar conversa da Caixa leva os recados e os anexos do disco do PC junto, e nao
  // tem desfazer. Mesma trava dos outros destrutivos.
  'mailbox.sessions.delete',
  'mailbox.messages.delete',
  // Esvaziar a Lixeira e limpar temporários não têm desfazer; instalar fecha o app do PC.
  'storage.clean',
  'update.install',
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
  if (options.confirmed) headers['X-Elysium-Confirm'] = '1';

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
