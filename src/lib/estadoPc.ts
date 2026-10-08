import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { chavePorPc } from './pcAtivo';

/**
 * Em que pé está o ELYSIUM do PC, visto do celular (08/10): janela na tela, minimizada ou só
 * na bandeja; tela bloqueada; e, quando o PC some, POR QUE sumiu — app fechado, PC desligando,
 * em suspensão, ou sem resposta sem aviso nenhum.
 *
 * Fontes, da mais rápida à mais lenta: o WebSocket aberto (frame `pc.estado`, na hora), a
 * sonda da conexão a cada 30 s (RPC `pc.estado`) e o push que o PC manda ao fechar ou desligar
 * (chega com o app do celular fechado). Fica gravado por PC: abrir o app depois de horas já
 * mostra "fechado às 18:40" sem esperar nada.
 */

export type Janela = 'foco' | 'aberta' | 'minimizada' | 'bandeja';
export type MotivoEncerramento = 'fechado' | 'atualizando' | 'desligando' | 'suspenso' | 'interrompido';

export type EstadoAppPc = {
  janela: Janela;
  janelaDesde: number;
  bloqueado: boolean;
  bloqueadoDesde: number | null;
  ociosoMin: number;
  iniciadoEm: number;
  pcLigadoDesde: number;
  versao: string;
  anterior: { motivo: MotivoEncerramento; em: number } | null;
  /** PC 2.5+: para onde vai o som do PC (a voz da Ely). */
  som?: { nome: string; volume: number; mudo: boolean; virtual: boolean } | null;
};

export type EstadoPc = {
  /** O último estado que o PC mandou. */
  app: EstadoAppPc | null;
  /** Quando o PC respondeu pela última vez. */
  vistoEm: number | null;
  /** O PC avisou que ia parar (e ainda não voltou). */
  encerrando: { motivo: MotivoEncerramento; em: number } | null;
  /** A sonda mais recente respondeu? `null` = ainda não sabemos. */
  online: boolean | null;
};

const VAZIO: EstadoPc = { app: null, vistoEm: null, encerrando: null, online: null };
let atual: EstadoPc = VAZIO;
const ouvintes = new Set<() => void>();
const CHAVE = 'elysium:estadoPc';
let carregado = false;

function mudar(novo: EstadoPc): void {
  atual = novo;
  for (const fn of ouvintes) fn();
  AsyncStorage.setItem(chavePorPc(CHAVE), JSON.stringify({ ...novo, online: null })).catch(() => {});
}

/** Lê o que ficou gravado (uma vez por abertura, e de novo ao trocar de PC). */
export async function carregarEstadoPc(forcar = false): Promise<void> {
  if (carregado && !forcar) return;
  carregado = true;
  try {
    const g = JSON.parse((await AsyncStorage.getItem(chavePorPc(CHAVE))) ?? 'null') as EstadoPc | null;
    if (g && typeof g === 'object') { atual = { ...VAZIO, ...g, online: atual.online }; for (const fn of ouvintes) fn(); }
  } catch { /* gravado ilegível: começa do zero */ }
}

/** O PC respondeu com o estado do app. */
export function registrarEstadoApp(app: EstadoAppPc): void {
  // Respondeu: está de pé, então qualquer aviso de encerramento anterior já passou (voltou da
  // suspensão, reabriu, ou o desligamento foi cancelado). Só um aviso dos últimos segundos
  // fica — a resposta pode ter saído antes do "fechando" que chegou junto.
  const encerrando = atual.encerrando && Date.now() - atual.encerrando.em < 5000 ? atual.encerrando : null;
  mudar({ app, vistoEm: Date.now(), encerrando, online: encerrando ? atual.online : true });
}

/** O PC avisou que vai parar — pelo WebSocket ou por push. */
export function registrarEncerramentoPc(motivo: MotivoEncerramento, em: number): void {
  if (atual.encerrando && atual.encerrando.em >= em) return;
  // Aviso velho (o push de ontem ainda na gaveta): o PC já respondeu depois dele.
  if (atual.vistoEm && atual.vistoEm > em + 5000) return;
  // Avisou que vai parar: para o app ele já está fora, sem esperar a sonda descobrir.
  mudar({ ...atual, encerrando: { motivo, em }, online: false });
}

export function registrarConexao(online: boolean): void {
  if (atual.online === online) return;
  mudar({ ...atual, online, vistoEm: online ? Date.now() : atual.vistoEm });
}

/** Frame `pc.estado` do WebSocket: ou o estado novo, ou o aviso de encerramento. */
export function receberFrameEstado(data: Record<string, unknown>): void {
  const enc = data.encerrando as { motivo?: MotivoEncerramento; em?: number } | undefined;
  if (enc?.motivo) { registrarEncerramentoPc(enc.motivo, enc.em ?? Date.now()); return; }
  if (typeof data.janela === 'string' && typeof data.iniciadoEm === 'number') registrarEstadoApp(data as unknown as EstadoAppPc);
}

export function useEstadoPc(): EstadoPc {
  return useSyncExternalStore(
    (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    () => atual,
  );
}

// ── texto ────────────────────────────────────────────────────────────────────

export type Tom = 'ok' | 'calmo' | 'aviso' | 'erro' | 'neutro';
export type Descricao = { tom: Tom; titulo: string; detalhe: string; icone: 'monitor' | 'minus-square' | 'inbox' | 'lock' | 'power' | 'moon' | 'refresh-cw' | 'wifi-off' | 'help-circle' | 'x-circle' };

const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "há 5 min", "há 2 h", "desde ontem 18:40". */
export function haQuanto(ms: number, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - ms) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 && new Date(ms).getDate() === new Date(agora).getDate()) return `há ${h} h${min % 60 >= 5 && h < 5 ? ` ${min % 60} min` : ''}`;
  const ontem = new Date(agora); ontem.setDate(ontem.getDate() - 1);
  if (new Date(ms).toDateString() === ontem.toDateString()) return `desde ontem ${hora(ms)}`;
  return `desde ${new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} ${hora(ms)}`;
}

const ENCERRAMENTO: Record<MotivoEncerramento, Pick<Descricao, 'tom' | 'titulo' | 'icone'>> = {
  fechado: { tom: 'erro', titulo: 'ELYSIUM fechado no PC', icone: 'x-circle' },
  atualizando: { tom: 'aviso', titulo: 'ELYSIUM atualizando', icone: 'refresh-cw' },
  desligando: { tom: 'neutro', titulo: 'PC desligado', icone: 'power' },
  suspenso: { tom: 'neutro', titulo: 'PC em suspensão', icone: 'moon' },
  interrompido: { tom: 'erro', titulo: 'ELYSIUM parou', icone: 'help-circle' },
};

/** O som do PC está indo para onde ninguém ouve? Frase curta, ou null. Pura. */
export function avisoDeSomPc(s: EstadoPc): string | null {
  const som = s.online !== false ? s.app?.som : null;
  if (!som) return null;
  if (som.virtual) return `Som do PC em "${som.nome}" (virtual) — a voz da Ely não sai`;
  if (som.mudo) return 'Som do PC no mudo — a voz da Ely não sai';
  if (som.volume <= 3) return `Volume do PC em ${som.volume}%`;
  return null;
}

/** A frase principal do estado do PC. Pura (testada). */
export function descreverEstadoPc(s: EstadoPc, agora = Date.now()): Descricao {
  if (s.online === false || (s.online === null && s.encerrando)) {
    if (s.encerrando) {
      const e = ENCERRAMENTO[s.encerrando.motivo];
      const quando = s.encerrando.motivo === 'atualizando' ? `desde ${hora(s.encerrando.em)} — volta sozinho` : `${haQuanto(s.encerrando.em, agora)} (${hora(s.encerrando.em)})`;
      return { ...e, detalhe: quando };
    }
    const antes = s.app ? ` · estava ${rotuloJanela(s.app.janela).toLowerCase()}` : '';
    return { tom: 'erro', titulo: 'PC sem resposta', icone: 'wifi-off', detalhe: s.vistoEm ? `visto ${haQuanto(s.vistoEm, agora)}${antes}` : 'ainda não respondeu' };
  }
  if (!s.app) return { tom: 'ok', titulo: s.online ? 'PC online' : 'Procurando o PC…', icone: 'monitor', detalhe: '' };
  if (s.app.bloqueado) return { tom: 'calmo', titulo: 'Tela do PC bloqueada', icone: 'lock', detalhe: `${haQuanto(s.app.bloqueadoDesde ?? s.app.janelaDesde, agora)} · o ELYSIUM segue ouvindo` };
  const j = s.app.janela;
  const ocioso = s.app.ociosoMin >= 5 ? ` · PC parado há ${s.app.ociosoMin >= 60 ? `${Math.floor(s.app.ociosoMin / 60)} h` : `${s.app.ociosoMin} min`}` : '';
  if (j === 'bandeja') return { tom: 'calmo', titulo: 'ELYSIUM na bandeja', icone: 'inbox', detalhe: `rodando em segundo plano${ocioso}` };
  if (j === 'minimizada') return { tom: 'calmo', titulo: 'ELYSIUM minimizado', icone: 'minus-square', detalhe: `${haQuanto(s.app.janelaDesde, agora)}${ocioso}` };
  return { tom: 'ok', titulo: j === 'foco' ? 'ELYSIUM aberto e em uso' : 'ELYSIUM aberto na tela', icone: 'monitor', detalhe: j === 'foco' ? 'é a janela da frente' : `atrás de outra janela${ocioso}` };
}

export function rotuloJanela(j: Janela): string {
  return j === 'foco' ? 'Em uso' : j === 'aberta' ? 'Aberto' : j === 'minimizada' ? 'Minimizado' : 'Na bandeja';
}

/** Linhas do detalhe (o card expandido). Pura. */
export function detalhesEstadoPc(s: EstadoPc, agora = Date.now()): { rotulo: string; valor: string }[] {
  const l: { rotulo: string; valor: string }[] = [];
  if (s.app) {
    if (s.online !== false) l.push({ rotulo: 'Janela', valor: `${rotuloJanela(s.app.janela)} · ${haQuanto(s.app.janelaDesde, agora)}` });
    l.push({ rotulo: 'ELYSIUM no ar', valor: `${haQuanto(s.app.iniciadoEm, agora)} (${hora(s.app.iniciadoEm)}) · v${s.app.versao}` });
    l.push({ rotulo: 'PC ligado', valor: haQuanto(s.app.pcLigadoDesde, agora) });
    if (s.app.anterior) {
      const a = s.app.anterior;
      const nome = a.motivo === 'fechado' ? 'fechado' : a.motivo === 'atualizando' ? 'atualizou' : a.motivo === 'desligando' ? 'PC desligou' : a.motivo === 'suspenso' ? 'PC dormiu' : 'parou sem avisar';
      l.push({ rotulo: 'Antes disso', valor: `${nome} às ${hora(a.em)}${new Date(a.em).toDateString() !== new Date(agora).toDateString() ? ` de ${new Date(a.em).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}` : ''}` });
    }
  }
  if (s.app?.som) {
    const som = s.app.som;
    l.push({ rotulo: 'Som do PC', valor: `${som.nome} · ${som.mudo ? 'no mudo' : `${som.volume}%`}${som.virtual ? ' · virtual, ninguém ouve' : ''}` });
  }
  if (s.vistoEm) l.push({ rotulo: 'Última resposta', valor: s.online === false ? `${hora(s.vistoEm)} (${haQuanto(s.vistoEm, agora)})` : 'agora' });
  return l;
}
