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
  | 'foco.status'
  | 'diag.registrar'
  | 'memory.sugestoes'
  | 'resumo.dia'
  | 'perfil.get'
  | 'listas.list'
  | 'comandos.list'
  | 'comandos.run'
  | 'link.resumir'
  | 'listas.add'
  | 'listas.toggle'
  | 'listas.remove'
  | 'timers.list'
  | 'timers.start'
  | 'timers.cancel'
  | 'perfil.set'
  | 'hoje.painel'
  | 'habitos.list'
  | 'habitos.save'
  | 'habitos.marcar'
  | 'habitos.delete'
  | 'habitos.pausar'
  | 'metas.save'
  | 'metas.progresso'
  | 'metas.delete'
  | 'tarefas.list'
  | 'tarefas.criar'
  | 'tarefas.concluir'
  | 'tarefas.reabrir'
  | 'tarefas.delete'
  | 'tarefas.editar'
  | 'tarefas.adiar'
  | 'tarefas.reagendarAtrasadas'
  | 'tarefas.interpretar'
  | 'hoje.ideia'
  | 'hoje.ocultar'
  | 'hoje.revisao'
  | 'hoje.testar'
  | 'corpo.painel'
  | 'corpo.dica'
  | 'corpo.perfil'
  | 'corpo.peso'
  | 'treinos.save'
  | 'treinos.importar'
  | 'treinos.delete'
  | 'treinos.marcar'
  | 'corrida.marcar'
  | 'corrida.delete'
  | 'memory.aceitar'
  | 'memory.recusar'
  | 'foco.start'
  | 'foco.stop'
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
  | 'memory.edit'
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
  /** PC novo manda o versionCode do APK (07/10); o antigo só nas notas. */
  versionCode?: number;
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

/** Modo foco do PC (fase 12). */
/** Listas que o PC e o celular dividem (bloco 135). */
export type Lista = { id: string; nome: string; atualizadaEm: number; itens: { id: string; texto: string; feito: boolean; em: number }[] };
/** Timer com nome que roda no PC (bloco 136). */
export type TimerPc = { id: string; nome: string; criadoEm: number; fimEm: number; duracaoMs: number };

/** Jeito de responder (bloco 134), guardado na config do PC. */
export type Perfil = { estiloResposta: 'direto' | 'equilibrado' | 'detalhado'; instrucoesPessoais: string; /** Fase 16: como a Ely chama o dono ("chefe"). PC antigo não manda. */ tratamento?: string };

/** Hábito com as contas do PC (fase 16). `mapa`: 30 dias, true feito, false não, null não vale. */
export type Habito = {
  id: string; nome: string; icone: string; dias: number[]; horaLembrete?: string; marcados: string[];
  feitoHoje: boolean; valeHoje: boolean; sequencia: number; recorde: number; taxa: number; mapa: (boolean | null)[];
  /** Fase 18 (PC 2.3+): força 0–100, folgas por semana e se hoje está congelado. */
  forca?: number; folgasPorSemana?: number; pausadoHoje?: boolean;
};
export type Meta = { id: string; titulo: string; alvo: number; unidade: string; progresso: number; prazo?: string; criadaEm: number; concluidaEm?: number };

/** Tarefa da lista (fase 17): os lembretes viram afazeres, com ressalva ao concluir. */
export type Tarefa = {
  id: string; texto: string; prazo?: number; lembreteIds?: string[]; feita: boolean; feitaEm?: number; ressalva?: string; criadaEm: number; origem: 'manual' | 'lembrete';
  /** Fase 18 (PC 2.3+): compromisso sem hora ("dia todo"), estrela e repetição. */
  semHora?: boolean; prioridade?: 'alta'; repete?: 'diaria' | 'semanal';
};

/** O briefing do dia (`hoje.painel`, fase 16). */
export type PainelHoje = {
  saudacao: string; frase: string; data: string;
  clima: { cidade: string; temperatura: number; max: number; min: number; descricao: string; icone: string; chuvaHoje: boolean } | null;
  lembretes: { id: string; texto: string; em: number }[];
  /** Fase 17. PC antigo não manda. */
  tarefas?: Tarefa[];
  timers: { id: string; nome: string; fimEm: number }[];
  listas: { id: string; nome: string; pendentes: number; itens: string[] }[];
  habitos: Habito[]; metas: Meta[];
  proximaRotina: { nome: string; em: number } | null;
  alertas: { titulo: string; detalhe: string; nivel: string }[];
  geradoEm: number;
  // Fase 18 (PC 2.2+). PC antigo não manda — tudo opcional.
  rotinasHoje?: { id: string; nome: string; em: number }[];
  rotinasRodaram?: { id: string; nome: string; em: number; ok: boolean; resultado: string }[];
  corpo?: PainelCorpo | null;
  dica?: { texto: string; em: number } | null;
  elysium?: { versao: string; novidades: string[]; paraTestar: { item: string; feito: boolean }[]; atualizacaoPronta: string | null };
  ideia?: string | null;
  /** Fase 18: "Meu amanhã" (depois das 18h) e as seções escondidas pelo dono. */
  amanha?: { tarefas: Tarefa[]; clima: { max: number; min: number; icone: string } | null } | null;
  ocultos?: string[];
};

export type Revisao = {
  texto: string; concluidas: string[]; atrasadas: string[];
  habitos: { nome: string; feitos: number; dias: number; forca: number }[];
  metas: { titulo: string; progresso: number; alvo: number }[];
  treinos: number; corridas: number;
};

/** Treino, nutrição e corrida (fase 18). Dados pessoais: moram no PC. */
export type Exercicio = { nome: string; tipo: 'composto' | 'isolador'; aquecimento: number; series: number; reps: string; carga?: string; obs?: string };
export type Treino = { id: string; nome: string; exercicios: Exercicio[]; ordem: number };
export type PerfilCorpo = {
  sexo?: 'masculino' | 'feminino'; idade?: number; alturaCm?: number; pesoKg?: number;
  atividade: 'sedentario' | 'leve' | 'moderado' | 'ativo' | 'muito';
  objetivo: 'ganhar' | 'manter' | 'perder'; foco?: string; ajusteKcal: number;
};
export type Corrida = { id: string; data: string; minutos: number; km?: number; doPlano: boolean };
export type PainelCorpo = {
  treinoHoje: { treino: Treino; feitoHoje: boolean; proximo: string | null } | null;
  treinos: Treino[];
  treinosNoMes: number;
  perfil: PerfilCorpo;
  faltaPerfil: string[];
  meta: { kcal: number; gasto: number; corrida: number; proteinaG: number; gorduraG: number; carboG: number } | null;
  corrida: { semana: number; sessao: number; texto: string; minutos: number; concluido: boolean; feitaHoje: boolean; ultimas: Corrida[] };
  pesos: { data: string; kg: number }[];
  sugestao: string | null;
};

export type EstadoFoco = {
  ativo: boolean;
  ate?: number;
  minutos?: number;
  apps: string[];
  fechar: boolean;
  distracoes: number;
  listaPadrao?: string[];
};

export type RpcResults = {
  'system.telemetry': Record<string, unknown>;
  /** Bloco 97: o mesmo "copiar diagnóstico" dos Ajustes do PC, sem chave nem token. */
  'system.diagnostico': { texto: string };
  'update.install': { ok: boolean; mensagem: string };
  'storage.info': Armazenamento;
  'system.saude': { itens: ItemSaude[] };
  'foco.status': EstadoFoco;
  'diag.registrar': { registradas: number };
  'resumo.dia': { texto: string };
  'perfil.get': Perfil;
  'listas.list': { listas: Lista[] };
  'comandos.list': { comandos: { id: string; nome: string; instrucao: string; fabrica?: boolean }[] };
  'comandos.run': { comando: { id: string; nome: string }; resultado: string };
  'link.resumir': { resumo: string };
  'listas.add': { lista: Lista; adicionados: string[]; repetidos: string[] };
  'listas.toggle': { lista: Lista };
  'listas.remove': { lista: Lista };
  'timers.list': { timers: TimerPc[]; agora: number };
  'timers.start': { timer: TimerPc };
  'timers.cancel': { timer: TimerPc };
  'perfil.set': Perfil;
  'hoje.painel': PainelHoje;
  'habitos.list': { habitos: Habito[]; metas: Meta[] };
  'habitos.save': { habito: Habito };
  'habitos.marcar': { habito: Habito };
  'habitos.delete': { ok: boolean };
  'habitos.pausar': { habito: Habito };
  'metas.save': { meta: Meta };
  'metas.progresso': { meta: Meta };
  'metas.delete': { ok: boolean };
  'tarefas.list': { tarefas: Tarefa[] };
  'tarefas.criar': { tarefas: Tarefa[]; mensagem: string; tarefa?: Tarefa };
  'tarefas.concluir': { tarefa: Tarefa; tarefas: Tarefa[]; proxima?: Tarefa };
  'tarefas.reabrir': { tarefa: Tarefa; tarefas: Tarefa[] };
  'tarefas.delete': { ok: boolean; tarefas: Tarefa[] };
  'tarefas.editar': { tarefa: Tarefa; tarefas: Tarefa[] };
  'tarefas.adiar': { tarefa: Tarefa; tarefas: Tarefa[]; mensagem: string };
  'tarefas.reagendarAtrasadas': { reagendadas: number; tarefas: Tarefa[] };
  'tarefas.interpretar': { texto: string; quando: string | null; semHora?: boolean; passou?: boolean; vespera?: boolean; rotulo?: string | null };
  'hoje.ideia': { ideia: string };
  'hoje.ocultar': { ocultos: string[] };
  'hoje.revisao': Revisao;
  'hoje.testar': { feitos: string[] };
  'corpo.painel': PainelCorpo;
  'corpo.dica': { dica: { texto: string; em: number } };
  'corpo.perfil': { perfil: PerfilCorpo };
  'corpo.peso': { perfil: PerfilCorpo };
  'treinos.save': { treino: Treino };
  'treinos.importar': { treinos: Treino[] };
  'treinos.delete': { ok: boolean };
  'treinos.marcar': { treino: Treino; painel: PainelCorpo };
  'corrida.marcar': { corrida: Corrida; painel: PainelCorpo };
  'corrida.delete': { ok: boolean; painel: PainelCorpo };
  'memory.sugestoes': { sugestoes: { id: string; text: string; createdAt: number }[] };
  'memory.aceitar': { fact: MemoryFact };
  'memory.recusar': { recusada: boolean };
  'foco.start': EstadoFoco;
  'foco.stop': EstadoFoco;
  'system.saude.consertar': { message: string };
  'storage.clean': { liberado: number; message: string };
  'storage.open': { ok: boolean; message: string };
  'update.status': {
    pc: string;
    verificadoEm: number | null;
    erro: string | null;
    /** PC sem token do GitHub: não consegue nem perguntar (07/10). PC antigo não manda. */
    semToken?: boolean;
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
  'memory.edit': { fact: MemoryFact };
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
    /** Como o dono quer ser chamado (config do PC, fase 13); vazio em PC antigo. */
    nome?: string;
    /** Fase 16: "chefe" etc. PC antigo não manda. */
    tratamento?: string;
    /** Bloco 128: o dono quer acompanhar o acesso de fora? Ausente em PC antigo. */
    acessoRemoto?: boolean;
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
  // Fase 16: apagar hábito leva o histórico de dias junto; meta, o progresso.
  'habitos.delete',
  'metas.delete',
  // Fase 18: apagar um treino leva os exercícios e as cargas; importar troca a lista toda.
  'treinos.delete',
  'treinos.importar',
  // 08/10 (PC 2.2.1+): apagar conversa, memória, tarefa, preset e rotina também
  // passam pela trava. Quem chama já perguntou na tela e manda `confirmed: true`.
  'chat.delete',
  'memory.remove',
  'tarefas.delete',
  'presets.delete',
  'rotinas.delete',
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
