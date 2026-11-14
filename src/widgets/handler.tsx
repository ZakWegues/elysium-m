import React from 'react';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler, requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadPairing, Pairing } from '../lib/pairing';
import { callRpc } from '../lib/rpc';
import { paletaDosWidgets } from './tema';
import { tamanhoDoWidget, type Tamanho } from './medidas';
import {
  ClimaWidget, DadosPc, HojeWidget, ListasWidget, MusicaWidget, RotinasWidget, TempoWidget,
  WidgetClima, WidgetEly, WidgetHoje, WidgetListas, WidgetMusica, WidgetPc, WidgetRotinas, WidgetTempo,
} from './widgets';
import { atrasada, quandoTarefa } from '../lib/tarefasUi';
import { chaveDoWidget } from '../lib/chaveWidget';

/**
 * O handler dos widgets (bloco 73; reformulado em 14/11: 8 widgets que mudam com o tamanho). Roda
 * em segundo plano, sem UI, sempre que o Android pede (adicionar, atualizar a cada 30 min,
 * redimensionar) e a cada clique que não seja `OPEN_URI`. Registrado no `index.ts`.
 *
 * Os nomes ficaram os antigos onde o widget continua (Esfera = Ely, Estado = PC, Foco = Tempo):
 * quem já tinha esses na tela inicial não perde nada.
 */

export const WIDGET_ELY = 'Esfera';
export const WIDGET_PC = 'Estado';
export const WIDGET_HOJE = 'Hoje';
export const WIDGET_CLIMA = 'Clima';
export const WIDGET_MUSICA = 'Musica';
export const WIDGET_TEMPO = 'Foco';
export const WIDGET_LISTAS = 'Listas';
export const WIDGET_ROTINAS = 'Rotinas';

/** O tamanho padrão de cada um (o que o Android usa quando não informa a medida). */
const PADRAO: Record<string, Tamanho> = {
  [WIDGET_ELY]: { colunas: 4, linhas: 1 }, [WIDGET_PC]: { colunas: 2, linhas: 1 }, [WIDGET_HOJE]: { colunas: 4, linhas: 2 },
  [WIDGET_CLIMA]: { colunas: 2, linhas: 1 }, [WIDGET_MUSICA]: { colunas: 4, linhas: 1 }, [WIDGET_TEMPO]: { colunas: 4, linhas: 1 },
  [WIDGET_LISTAS]: { colunas: 4, linhas: 2 }, [WIDGET_ROTINAS]: { colunas: 2, linhas: 1 },
};

/** O aviso curto quando algo falha: o que importa, não a mensagem crua do erro. */
function avisoDeErro(err: unknown): string {
  const m = String((err as Error)?.message ?? err ?? '');
  if (/network|timeout|tempo|abort|failed to fetch|econn/i.test(m)) return 'PC desligado';
  if (/401|token/i.test(m)) return 'Pareie de novo no app';
  if (/404|desconhecido|não existe/i.test(m)) return 'Atualize o ELYSIUM do PC';
  return 'Não deu agora — tente no app';
}

function agora(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tempoLigado(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  if (seg >= 86400) return `${Math.floor(seg / 86400)} d ${h % 24} h`;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function horaCurta(ts: number): string {
  const d = new Date(ts);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return hoje ? hora : `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}

// ── leitores: cada um devolve "desligado" em vez de lançar ─────────────────────────────────
async function lerPc(pairing: Pairing | null, t: Tamanho, aviso?: string): Promise<DadosPc> {
  if (!pairing) return { online: false, quando: agora(), aviso };
  try {
    const tel = await callRpc(pairing, 'system.telemetry', {}, { timeoutMs: 6000 }) as Record<string, unknown>;
    const d: DadosPc = {
      online: true, aviso, quando: agora(),
      cpu: Math.round(Number(tel.cpu_pct ?? 0)), ram: Math.round(Number(tel.ram_pct ?? 0)),
      uptime: typeof tel.uptime_sec === 'number' && tel.uptime_sec > 0 ? tempoLigado(tel.uptime_sec) : undefined,
    };
    // A saúde só cabe no tamanho grande (e custa uma leitura a mais).
    if (t.colunas >= 4 && t.linhas >= 2) {
      try {
        const { itens } = await callRpc(pairing, 'system.saude', {}, { timeoutMs: 12000 });
        const ruins = itens.filter((i) => i.nivel !== 'ok');
        const pior = ruins.find((i) => i.nivel === 'erro') ?? ruins[0];
        d.ruins = ruins.length;
        d.pior = pior ? pior.titulo : undefined;
      } catch { /* sem saúde, o resto vale */ }
    }
    return d;
  } catch {
    return { online: false, quando: agora(), aviso };
  }
}

async function lerClima(pairing: Pairing | null): Promise<ClimaWidget> {
  if (!pairing) return { online: false, quando: agora() };
  try {
    const cl = await callRpc(pairing, 'weather.now', {}, { timeoutMs: 8000 });
    if (!cl || typeof (cl as { temperatura?: unknown }).temperatura !== 'number') return { online: false, quando: agora() };
    return { online: true, cidade: cl.cidade, temperatura: cl.temperatura, descricao: cl.descricao, icone: cl.icone, max: cl.max, min: cl.min, horas: cl.horas, quando: agora() };
  } catch {
    return { online: false, quando: agora() };
  }
}

async function lerMusica(pairing: Pairing | null, aviso?: string): Promise<MusicaWidget> {
  if (!pairing) return { online: false };
  try {
    const { nowPlaying } = await callRpc(pairing, 'spotify.nowPlaying', {}, { timeoutMs: 8000 });
    return { online: true, aviso, tocando: !!nowPlaying?.isPlaying, faixa: nowPlaying?.track, artista: nowPlaying?.artist };
  } catch { return { online: false, aviso }; }
}

async function lerTempo(pairing: Pairing | null, aviso?: string): Promise<TempoWidget> {
  if (!pairing) return { online: false, focoAtivo: false, timers: [], aviso };
  try {
    const [f, t] = await Promise.all([
      callRpc(pairing, 'foco.status', {}, { timeoutMs: 8000 }),
      callRpc(pairing, 'timers.list', {}, { timeoutMs: 8000 }).catch(() => ({ timers: [] as { nome: string; fimEm: number }[] })),
    ]);
    const focoMin = f.ativo && f.ate ? Math.max(0, Math.ceil((f.ate - Date.now()) / 60000)) : undefined;
    return { online: true, aviso, focoAtivo: f.ativo, focoMin, distracoes: f.distracoes, timers: t.timers.map((x) => ({ nome: x.nome, fimEm: horaCurta(x.fimEm) })) };
  } catch { return { online: false, focoAtivo: false, timers: [], aviso }; }
}

async function lerHoje(pairing: Pairing | null, aviso?: string): Promise<HojeWidget> {
  const vazio: HojeWidget = { online: false, quando: agora(), tarefas: [], totalTarefas: 0, habitos: [], aviso };
  if (!pairing) return vazio;
  try {
    const p = await callRpc(pairing, 'hoje.painel', {}, { timeoutMs: 12000 });
    // PC antigo não manda as tarefas no painel: pede à parte.
    const tarefas = p.tarefas ?? (await callRpc(pairing, 'tarefas.list', { filtro: 'abertas' }, { timeoutMs: 10000 }).catch(() => ({ tarefas: [] }))).tarefas;
    const abertas = tarefas.filter((x) => !x.feita);
    const prox = p.lembretes[0] ? `${horaCurta(p.lembretes[0].em)} ${p.lembretes[0].texto}` : p.proximaRotina ? `${horaCurta(p.proximaRotina.em)} rotina ${p.proximaRotina.nome}` : undefined;
    return {
      online: true, aviso, quando: agora(),
      saudacao: p.saudacao, frase: p.frase,
      temp: p.clima ? `${Math.round(p.clima.temperatura)}°` : undefined,
      proximo: prox,
      totalTarefas: abertas.length,
      tarefas: abertas.map((x) => ({ id: x.id, texto: x.texto, atrasada: atrasada(x), quando: x.prazo !== undefined ? quandoTarefa(x.prazo, x.semHora) : undefined })),
      habitos: p.habitos.filter((x) => x.valeHoje).map((x) => ({ id: x.id, nome: x.nome, feito: x.feitoHoje, sequencia: x.sequencia })),
    };
  } catch { return vazio; }
}

async function lerListas(pairing: Pairing | null, aviso?: string): Promise<ListasWidget> {
  if (!pairing) return { online: false, itens: [], aviso };
  try {
    const { listas } = await callRpc(pairing, 'listas.list', {}, { timeoutMs: 8000 });
    // A lista mais recente com algo pendente; sem nenhuma, a mais recente.
    const l = listas.find((x) => x.itens.some((i) => !i.feito)) ?? listas[0];
    return { online: true, aviso, listaId: l?.id, nome: l?.nome, itens: (l?.itens ?? []).filter((i) => !i.feito).map((i) => ({ id: i.id, texto: i.texto })) };
  } catch { return { online: false, itens: [], aviso }; }
}

async function lerRotinas(pairing: Pairing | null): Promise<RotinasWidget> {
  if (!pairing) return { online: false, total: 0, quando: agora() };
  try {
    const { rotinas } = await callRpc(pairing, 'rotinas.list', {}, { timeoutMs: 8000 });
    const ativas = rotinas.filter((r) => r.ativa);
    const porHora = ativas.filter((r) => r.proxima).sort((a, b) => (a.proxima ?? 0) - (b.proxima ?? 0));
    const ultima = [...rotinas].filter((r) => r.ultimaExecucao).sort((a, b) => (b.ultimaExecucao ?? 0) - (a.ultimaExecucao ?? 0))[0];
    return {
      online: true, total: ativas.length, quando: agora(),
      proxima: porHora[0] ? { nome: porHora[0].nome, quando: horaCurta(porHora[0].proxima as number) } : undefined,
      ultima: ultima ? { nome: ultima.nome, resultado: (ultima.ultimoResultado ?? '').slice(0, 200), quando: horaCurta(ultima.ultimaExecucao as number) } : undefined,
    };
  } catch {
    return { online: false, total: 0, quando: agora() };
  }
}

// ── cliques ─────────────────────────────────────────────────────────────────────────────
/** Executa o clique (RPC no PC). Devolve a frase curta que o widget mostra, ou undefined. */
async function executarClique(acao: string, dados: Record<string, unknown> | undefined, pairing: Pairing | null): Promise<string | undefined> {
  if (!pairing) return 'Pareie o celular no app';
  const d = dados ?? {};
  try {
    switch (acao) {
      case 'ACAO': {
        switch (String(d.acao ?? '')) {
          case 'lock': await callRpc(pairing, 'power.control', { operation: 'lock' }, { confirmed: true, timeoutMs: 8000 }); return 'Tela bloqueada';
          case 'print': { const r = await callRpc(pairing, 'screen.screenshot', {}, { timeoutMs: 10000 }); return r.message || 'Print tirado'; }
          case 'play': await callRpc(pairing, 'media.control', { operation: 'play' }, { timeoutMs: 8000 }); return 'Play/pause';
          case 'mute': await callRpc(pairing, 'volume.set', { level: 'mute' }, { timeoutMs: 8000 }); return 'Mudo';
          default: return undefined;
        }
      }
      case 'FOCO':
        if (d.acao === 'parar') { await callRpc(pairing, 'foco.stop', {}, { timeoutMs: 8000 }); return 'Foco encerrado'; }
        await callRpc(pairing, 'foco.start', { minutos: Number(d.acao) || 25 }, { timeoutMs: 8000 }); return 'Foco começou';
      case 'TIMER': {
        const minutos = Number(d.minutos) || 5;
        await callRpc(pairing, 'timers.start', { minutos }, { timeoutMs: 8000 }); return `Timer de ${minutos} min`;
      }
      case 'MIDIA':
        await callRpc(pairing, 'media.control', { operation: String(d.op ?? 'play') }, { timeoutMs: 8000 });
        // O Spotify leva um instante para trocar de faixa: lê depois de um respiro.
        await new Promise((r) => setTimeout(r, 900));
        return undefined;
      case 'HABITO': {
        const r = await callRpc(pairing, 'habitos.marcar', { id: String(d.id ?? ''), feito: !d.feito }, { timeoutMs: 8000 });
        return r.habito.feitoHoje ? `${r.habito.nome}: ${r.habito.sequencia} 🔥` : `${r.habito.nome} desmarcado`;
      }
      case 'TAREFA': await callRpc(pairing, 'tarefas.concluir', { id: String(d.id ?? '') }, { timeoutMs: 8000 }); return 'Concluída ✓';
      case 'ITEM': await callRpc(pairing, 'listas.toggle', { listaId: String(d.lista ?? ''), itemId: String(d.item ?? ''), feito: true }, { timeoutMs: 8000 }); return 'Marcado';
      default: return undefined;
    }
  } catch (err) {
    return avisoDeErro(err);
  }
}

/** O widget pronto para desenhar (nome + tamanho + dados frescos do PC). null = nome desconhecido. */
async function montar(info: Pick<WidgetInfo, 'widgetName' | 'width' | 'height'>, aviso?: string): Promise<React.JSX.Element | null> {
  const nome = info.widgetName;
  if (!PADRAO[nome]) return null;
  const t = tamanhoDoWidget(info.width, info.height, PADRAO[nome]);
  const [p, chave] = await Promise.all([paletaDosWidgets(), chaveDoWidget()]);
  if (nome === WIDGET_ELY) return <WidgetEly p={p} t={t} chave={chave} />;
  const pairing = await loadPairing();
  switch (nome) {
    case WIDGET_PC: return <WidgetPc p={p} t={t} d={await lerPc(pairing, t, aviso)} chave={chave} />;
    case WIDGET_HOJE: return <WidgetHoje p={p} t={t} h={await lerHoje(pairing, aviso)} chave={chave} />;
    case WIDGET_CLIMA: return <WidgetClima p={p} t={t} cl={await lerClima(pairing)} chave={chave} />;
    case WIDGET_MUSICA: return <WidgetMusica p={p} t={t} m={await lerMusica(pairing, aviso)} chave={chave} />;
    case WIDGET_TEMPO: return <WidgetTempo p={p} t={t} d={await lerTempo(pairing, aviso)} chave={chave} />;
    case WIDGET_LISTAS: return <WidgetListas p={p} t={t} l={await lerListas(pairing, aviso)} chave={chave} />;
    case WIDGET_ROTINAS: return <WidgetRotinas p={p} t={t} r={await lerRotinas(pairing)} chave={chave} />;
    default: return null;
  }
}

// Só no Android (a prévia web do app, usada para comparar as telas com o PC, não tem widget).
if (Platform.OS === 'android') registerWidgetTaskHandler(async (props: WidgetTaskHandlerProps) => {
  const { widgetInfo, widgetAction, renderWidget, clickAction, clickActionData } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  let aviso: string | undefined;
  if (widgetAction === 'WIDGET_CLICK' && clickAction && clickAction !== 'OPEN_URI') {
    aviso = await executarClique(clickAction, clickActionData as Record<string, unknown> | undefined, await loadPairing());
  }
  const el = await montar(widgetInfo, aviso);
  if (!el) return;
  renderWidget(el);
  // O aviso some depois de alguns segundos (redesenha sem ele).
  if (aviso) {
    setTimeout(() => {
      requestWidgetUpdate({ widgetName: widgetInfo.widgetName, renderWidget: async (info) => (await montar(info)) ?? <></> }).catch(() => {});
    }, 6000);
  }
});

/** Redesenha um tipo de widget com dados frescos (cada instância no seu tamanho). */
async function atualizar(nome: string): Promise<void> {
  try { await requestWidgetUpdate({ widgetName: nome, renderWidget: async (info) => (await montar(info)) ?? <></> }); }
  catch { /* sem widget na tela, ou lib indisponível (Expo Go) */ }
}

/**
 * Chamado pelo app quando ele tem dados frescos (voltou ao primeiro plano): os widgets não
 * esperam os 30 min do Android.
 */
export async function atualizarWidgetEstado(_pairing?: Pairing | null): Promise<void> {
  for (const nome of [WIDGET_PC, WIDGET_HOJE, WIDGET_CLIMA, WIDGET_MUSICA, WIDGET_TEMPO, WIDGET_LISTAS, WIDGET_ROTINAS]) await atualizar(nome);
}

/** A cor do tema mudou no app: os widgets acompanham (a Ely não lê nada do PC). */
export async function atualizarWidgetsEstaticos(): Promise<void> {
  await atualizar(WIDGET_ELY);
}
