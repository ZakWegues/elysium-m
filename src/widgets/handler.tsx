import React from 'react';
import { registerWidgetTaskHandler, requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadPairing, Pairing } from '../lib/pairing';
import { callRpc } from '../lib/rpc';
import { paletaDosWidgets } from './tema';
import { ClimaWidget, EstadoPc, FocoWidget, RotinasWidget, SaudeWidget, WidgetAcoes, WidgetBusca, WidgetClima, WidgetEstado, WidgetFoco, WidgetRotinas, WidgetSaude } from './widgets';
import { HabitosWidget, HojeWidget, ListasWidget, MusicaWidget, TimersWidget, WidgetFalar, WidgetHabitos, WidgetHoje, WidgetListas, WidgetMusica, WidgetTimers } from './widgetsStark';

/**
 * O handler dos widgets (bloco 73). Roda em segundo plano, sem UI, sempre que o Android
 * pede (adicionar, atualizar a cada 30 min, redimensionar) e a cada clique que não seja
 * `OPEN_URI`. Está registrado no `index.ts`, como a tarefa de segundo plano.
 *
 * O widget Estado lê `system.telemetry` do PC — na mesma rede ou pelo túnel. Fora disso
 * mostra "fora de alcance" e a hora da última leitura, que fica em memória só durante o
 * processo; o próximo ciclo tenta de novo.
 */

export const WIDGET_BUSCA = 'Busca';
export const WIDGET_ACOES = 'Acoes';
export const WIDGET_ESTADO = 'Estado';
export const WIDGET_CLIMA = 'Clima';
export const WIDGET_ROTINAS = 'Rotinas';
export const WIDGET_FOCO = 'Foco';
export const WIDGET_SAUDE = 'Saude';
// Fase 16.
export const WIDGET_FALAR = 'Falar';
export const WIDGET_HOJE = 'Hoje';
export const WIDGET_HABITOS = 'Habitos';
export const WIDGET_TIMERS = 'Timers';
export const WIDGET_MUSICA = 'Musica';
export const WIDGET_LISTAS = 'Listas';

function agora(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tempoLigado(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  if (seg >= 86400) return `${Math.floor(seg / 86400)} d ${h % 24} h`;
  return h ? `${h} h ${m} min` : `${m} min`;
}

async function lerEstado(pairing: Pairing | null): Promise<EstadoPc> {
  if (!pairing) return { online: false, quando: agora() };
  try {
    const t = await callRpc(pairing, 'system.telemetry', {}, { timeoutMs: 6000 }) as Record<string, unknown>;
    return {
      online: true,
      cpu: Math.round(Number(t.cpu_pct ?? 0)),
      ram: Math.round(Number(t.ram_pct ?? 0)),
      uptime: typeof t.uptime_sec === 'number' && t.uptime_sec > 0 ? tempoLigado(t.uptime_sec) : undefined,
      quando: agora(),
    };
  } catch {
    return { online: false, quando: agora() };
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

function horaCurta(ts: number): string {
  const d = new Date(ts);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return hoje ? hora : `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}

async function lerRotinas(pairing: Pairing | null): Promise<RotinasWidget> {
  if (!pairing) return { online: false, total: 0, quando: agora() };
  try {
    const { rotinas } = await callRpc(pairing, 'rotinas.list', {}, { timeoutMs: 8000 });
    const ativas = rotinas.filter(r => r.ativa);
    const porHora = ativas.filter(r => r.proxima).sort((a, b) => (a.proxima ?? 0) - (b.proxima ?? 0));
    const ultima = [...rotinas].filter(r => r.ultimaExecucao).sort((a, b) => (b.ultimaExecucao ?? 0) - (a.ultimaExecucao ?? 0))[0];
    return {
      online: true,
      total: ativas.length,
      proxima: porHora[0] ? { nome: porHora[0].nome, quando: horaCurta(porHora[0].proxima as number) } : undefined,
      ultima: ultima ? { nome: ultima.nome, resultado: (ultima.ultimoResultado ?? '').slice(0, 140), quando: horaCurta(ultima.ultimaExecucao as number) } : undefined,
      quando: agora(),
    };
  } catch {
    return { online: false, total: 0, quando: agora() };
  }
}

async function lerFoco(pairing: Pairing | null, aviso?: string): Promise<FocoWidget> {
  if (!pairing) return { online: false, ativo: false };
  try {
    const f = await callRpc(pairing, 'foco.status', {}, { timeoutMs: 8000 });
    const minutos = f.ativo && f.ate ? Math.max(0, Math.ceil((f.ate - Date.now()) / 60000)) : undefined;
    return { online: true, ativo: f.ativo, minutos, distracoes: f.distracoes, aviso };
  } catch { return { online: false, ativo: false }; }
}

async function lerSaude(pairing: Pairing | null): Promise<SaudeWidget> {
  if (!pairing) return { online: false, ruins: 0 };
  try {
    const { itens } = await callRpc(pairing, 'system.saude', {}, { timeoutMs: 15000 });
    const ruins = itens.filter(i => i.nivel !== 'ok');
    const pior = ruins.find(i => i.nivel === 'erro') ?? ruins[0];
    return { online: true, ruins: ruins.length, pior: pior ? { titulo: pior.titulo, detalhe: pior.detalhe.split(' — ')[0], nivel: pior.nivel } : undefined };
  } catch { return { online: false, ruins: 0 }; }
}

// ── Fase 16: leitores dos widgets novos. Cada um devolve "fora de alcance" em vez de lançar. ──

async function lerHoje(pairing: Pairing | null): Promise<HojeWidget> {
  if (!pairing) return { online: false, quando: agora() };
  try {
    const p = await callRpc(pairing, 'hoje.painel', {}, { timeoutMs: 12000 });
    const prox = p.lembretes[0] ? `${horaCurta(p.lembretes[0].em)} ${p.lembretes[0].texto}` : p.proximaRotina ? `${horaCurta(p.proximaRotina.em)} rotina ${p.proximaRotina.nome}` : undefined;
    const t = p.timers[0];
    return {
      online: true,
      saudacao: p.saudacao,
      frase: p.frase,
      temp: p.clima ? `${Math.round(p.clima.temperatura)}° ${p.clima.descricao}` : undefined,
      proximo: prox,
      habitos: { feitos: p.habitos.filter(x => x.feitoHoje).length, total: p.habitos.length },
      timer: t ? `${t.nome || 'Timer'} até ${horaCurta(t.fimEm)}` : undefined,
      quando: agora(),
    };
  } catch { return { online: false, quando: agora() }; }
}

async function lerHabitos(pairing: Pairing | null, aviso?: string): Promise<HabitosWidget> {
  if (!pairing) return { online: false, habitos: [] };
  try {
    const { habitos } = await callRpc(pairing, 'habitos.list', {}, { timeoutMs: 10000 });
    return { online: true, aviso, habitos: habitos.filter(x => x.valeHoje).map(x => ({ id: x.id, nome: x.nome, feito: x.feitoHoje, sequencia: x.sequencia })) };
  } catch { return { online: false, habitos: [] }; }
}

async function lerTimers(pairing: Pairing | null, aviso?: string): Promise<TimersWidget> {
  if (!pairing) return { online: false, timers: [] };
  try {
    const { timers } = await callRpc(pairing, 'timers.list', {}, { timeoutMs: 8000 });
    return { online: true, aviso, timers: timers.map(t => ({ nome: t.nome, fimEm: horaCurta(t.fimEm) })) };
  } catch { return { online: false, timers: [] }; }
}

async function lerMusica(pairing: Pairing | null, aviso?: string): Promise<MusicaWidget> {
  if (!pairing) return { online: false };
  try {
    const { nowPlaying } = await callRpc(pairing, 'spotify.nowPlaying', {}, { timeoutMs: 8000 });
    return { online: true, aviso, tocando: !!nowPlaying?.isPlaying, faixa: nowPlaying?.track, artista: nowPlaying?.artist };
  } catch { return { online: false, aviso }; }
}

async function lerListas(pairing: Pairing | null, aviso?: string): Promise<ListasWidget> {
  if (!pairing) return { online: false, itens: [] };
  try {
    const { listas } = await callRpc(pairing, 'listas.list', {}, { timeoutMs: 8000 });
    // A lista mais recente com algo pendente; sem nenhuma, a mais recente.
    const l = listas.find(x => x.itens.some(i => !i.feito)) ?? listas[0];
    return { online: true, aviso, listaId: l?.id, nome: l?.nome, itens: (l?.itens ?? []).filter(i => !i.feito).map(i => ({ id: i.id, texto: i.texto })) };
  } catch { return { online: false, itens: [] }; }
}

/** As ações do widget Ações → RPC. Devolve a frase curta que o widget mostra embaixo. */
async function executarAcao(acao: string, pairing: Pairing | null): Promise<string> {
  if (!pairing) return 'Pareie o celular no app';
  try {
    switch (acao) {
      case 'lock': await callRpc(pairing, 'power.control', { operation: 'lock' }, { confirmed: true, timeoutMs: 8000 }); return 'Tela bloqueada';
      case 'print': { const r = await callRpc(pairing, 'screen.screenshot', {}, { timeoutMs: 10000 }); return r.message || 'Print tirado'; }
      case 'play': await callRpc(pairing, 'media.control', { operation: 'play' }, { timeoutMs: 8000 }); return 'Play/pause';
      case 'mute': await callRpc(pairing, 'volume.set', { level: 'mute' }, { timeoutMs: 8000 }); return 'Mudo';
      default: return 'Ação desconhecida';
    }
  } catch (err) {
    return `Não deu: ${(err as Error).message}`.slice(0, 60);
  }
}

registerWidgetTaskHandler(async (props: WidgetTaskHandlerProps) => {
  const { widgetInfo, widgetAction, renderWidget, clickAction, clickActionData } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  const p = await paletaDosWidgets();

  switch (widgetInfo.widgetName) {
    case WIDGET_BUSCA:
      renderWidget(<WidgetBusca p={p} />);
      return;

    case WIDGET_ACOES: {
      if (widgetAction === 'WIDGET_CLICK' && clickAction === 'ACAO') {
        const pairing = await loadPairing();
        const aviso = await executarAcao(String(clickActionData?.acao ?? ''), pairing);
        renderWidget(<WidgetAcoes p={p} aviso={aviso} />);
        // Limpa o aviso depois de alguns segundos, sem depender de outro evento do Android.
        setTimeout(() => {
          requestWidgetUpdate({ widgetName: WIDGET_ACOES, renderWidget: () => <WidgetAcoes p={p} /> }).catch(() => {});
        }, 6000);
        return;
      }
      renderWidget(<WidgetAcoes p={p} />);
      return;
    }

    case WIDGET_ESTADO: {
      const pairing = await loadPairing();
      renderWidget(<WidgetEstado p={p} e={await lerEstado(pairing)} />);
      return;
    }

    case WIDGET_CLIMA: {
      const pairing = await loadPairing();
      renderWidget(<WidgetClima p={p} c={await lerClima(pairing)} />);
      return;
    }

    case WIDGET_ROTINAS: {
      const pairing = await loadPairing();
      renderWidget(<WidgetRotinas p={p} r={await lerRotinas(pairing)} />);
      return;
    }

    // Bloco 123: começar/parar o foco direto da tela inicial.
    case WIDGET_FOCO: {
      const pairing = await loadPairing();
      let aviso: string | undefined;
      if (widgetAction === 'WIDGET_CLICK' && clickAction === 'FOCO' && pairing) {
        const acao = String(clickActionData?.acao ?? '');
        try {
          if (acao === 'parar') { await callRpc(pairing, 'foco.stop', {}, { timeoutMs: 8000 }); aviso = 'Foco encerrado'; }
          else { await callRpc(pairing, 'foco.start', { minutos: Number(acao) || 25 }, { timeoutMs: 8000 }); aviso = 'Foco começou'; }
        } catch (err) { aviso = `Não deu: ${(err as Error).message}`.slice(0, 50); }
      }
      renderWidget(<WidgetFoco p={p} f={await lerFoco(pairing, aviso)} />);
      return;
    }

    case WIDGET_SAUDE: {
      const pairing = await loadPairing();
      renderWidget(<WidgetSaude p={p} s={await lerSaude(pairing)} />);
      return;
    }

    // ── Fase 16 ──
    case WIDGET_FALAR:
      renderWidget(<WidgetFalar p={p} />);
      return;

    case WIDGET_HOJE: {
      const pairing = await loadPairing();
      renderWidget(<WidgetHoje p={p} h={await lerHoje(pairing)} />);
      return;
    }

    case WIDGET_HABITOS: {
      const pairing = await loadPairing();
      let aviso: string | undefined;
      if (widgetAction === 'WIDGET_CLICK' && clickAction === 'HABITO' && pairing) {
        try {
          const r = await callRpc(pairing, 'habitos.marcar', { id: String(clickActionData?.id ?? ''), feito: !clickActionData?.feito }, { timeoutMs: 8000 });
          aviso = r.habito.feitoHoje ? `${r.habito.nome}: ${r.habito.sequencia} 🔥` : `${r.habito.nome} desmarcado`;
        } catch (err) { aviso = `Não deu: ${(err as Error).message}`.slice(0, 50); }
      }
      renderWidget(<WidgetHabitos p={p} h={await lerHabitos(pairing, aviso)} />);
      return;
    }

    case WIDGET_TIMERS: {
      const pairing = await loadPairing();
      let aviso: string | undefined;
      if (widgetAction === 'WIDGET_CLICK' && clickAction === 'TIMER' && pairing) {
        const minutos = Number(clickActionData?.minutos) || 5;
        try { await callRpc(pairing, 'timers.start', { minutos }, { timeoutMs: 8000 }); aviso = `Timer de ${minutos} min`; }
        catch (err) { aviso = `Não deu: ${(err as Error).message}`.slice(0, 50); }
      }
      renderWidget(<WidgetTimers p={p} t={await lerTimers(pairing, aviso)} />);
      return;
    }

    case WIDGET_MUSICA: {
      const pairing = await loadPairing();
      let aviso: string | undefined;
      if (widgetAction === 'WIDGET_CLICK' && clickAction === 'MIDIA' && pairing) {
        const op = String(clickActionData?.op ?? 'play');
        try { await callRpc(pairing, 'media.control', { operation: op }, { timeoutMs: 8000 }); }
        catch (err) { aviso = `Não deu: ${(err as Error).message}`.slice(0, 50); }
        // O Spotify leva um instante para trocar de faixa: lê depois de um respiro.
        await new Promise(r => setTimeout(r, 900));
      }
      renderWidget(<WidgetMusica p={p} m={await lerMusica(pairing, aviso)} />);
      return;
    }

    case WIDGET_LISTAS: {
      const pairing = await loadPairing();
      let aviso: string | undefined;
      if (widgetAction === 'WIDGET_CLICK' && clickAction === 'ITEM' && pairing) {
        try { await callRpc(pairing, 'listas.toggle', { listaId: String(clickActionData?.lista ?? ''), itemId: String(clickActionData?.item ?? ''), feito: true }, { timeoutMs: 8000 }); aviso = 'Marcado'; }
        catch (err) { aviso = `Não deu: ${(err as Error).message}`.slice(0, 50); }
      }
      renderWidget(<WidgetListas p={p} l={await lerListas(pairing, aviso)} />);
      return;
    }
  }
});

/**
 * Chamado pelo app quando ele tem dados frescos (sincronização de primeiro plano): o
 * widget Estado não precisa esperar os 30 min do Android.
 */
export async function atualizarWidgetEstado(pairing: Pairing | null): Promise<void> {
  try {
    const p = await paletaDosWidgets();
    const e = await lerEstado(pairing);
    await requestWidgetUpdate({ widgetName: WIDGET_ESTADO, renderWidget: () => <WidgetEstado p={p} e={e} /> });
  } catch { /* sem widget na tela, ou lib indisponível (Expo Go) */ }
  // Clima e Rotinas vão junto (bloco 90): o mesmo "voltei ao app" que atualiza o Estado.
  try {
    const p = await paletaDosWidgets();
    const cl = await lerClima(pairing);
    await requestWidgetUpdate({ widgetName: WIDGET_CLIMA, renderWidget: () => <WidgetClima p={p} c={cl} /> });
  } catch { /* idem */ }
  try {
    const p = await paletaDosWidgets();
    const r = await lerRotinas(pairing);
    await requestWidgetUpdate({ widgetName: WIDGET_ROTINAS, renderWidget: () => <WidgetRotinas p={p} r={r} /> });
  } catch { /* idem */ }
  // Foco e Saúde (bloco 123).
  try {
    const p = await paletaDosWidgets();
    const f = await lerFoco(pairing);
    await requestWidgetUpdate({ widgetName: WIDGET_FOCO, renderWidget: () => <WidgetFoco p={p} f={f} /> });
  } catch { /* idem */ }
  try {
    const p = await paletaDosWidgets();
    const s = await lerSaude(pairing);
    await requestWidgetUpdate({ widgetName: WIDGET_SAUDE, renderWidget: () => <WidgetSaude p={p} s={s} /> });
  } catch { /* idem */ }
  // Fase 16: os novos acompanham o mesmo "voltei ao app".
  const novos: [string, () => Promise<React.JSX.Element>][] = [
    [WIDGET_HOJE, async () => <WidgetHoje p={await paletaDosWidgets()} h={await lerHoje(pairing)} />],
    [WIDGET_HABITOS, async () => <WidgetHabitos p={await paletaDosWidgets()} h={await lerHabitos(pairing)} />],
    [WIDGET_TIMERS, async () => <WidgetTimers p={await paletaDosWidgets()} t={await lerTimers(pairing)} />],
    [WIDGET_MUSICA, async () => <WidgetMusica p={await paletaDosWidgets()} m={await lerMusica(pairing)} />],
    [WIDGET_LISTAS, async () => <WidgetListas p={await paletaDosWidgets()} l={await lerListas(pairing)} />],
  ];
  for (const [nome, montar] of novos) {
    try { const el = await montar(); await requestWidgetUpdate({ widgetName: nome, renderWidget: () => el }); } catch { /* idem */ }
  }
}

/** Idem para os outros dois: cor do tema mudou no app → widgets acompanham. */
export async function atualizarWidgetsEstaticos(): Promise<void> {
  try {
    const p = await paletaDosWidgets();
    await requestWidgetUpdate({ widgetName: WIDGET_BUSCA, renderWidget: () => <WidgetBusca p={p} /> });
    await requestWidgetUpdate({ widgetName: WIDGET_ACOES, renderWidget: () => <WidgetAcoes p={p} /> });
    await requestWidgetUpdate({ widgetName: WIDGET_FALAR, renderWidget: () => <WidgetFalar p={p} /> });
  } catch { /* idem */ }
}
