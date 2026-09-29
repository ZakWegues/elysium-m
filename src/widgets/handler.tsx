import React from 'react';
import { registerWidgetTaskHandler, requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadPairing, Pairing } from '../lib/pairing';
import { callRpc } from '../lib/rpc';
import { paletaDosWidgets } from './tema';
import { ClimaWidget, EstadoPc, RotinasWidget, WidgetAcoes, WidgetBusca, WidgetClima, WidgetEstado, WidgetRotinas } from './widgets';

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
}

/** Idem para os outros dois: cor do tema mudou no app → widgets acompanham. */
export async function atualizarWidgetsEstaticos(): Promise<void> {
  try {
    const p = await paletaDosWidgets();
    await requestWidgetUpdate({ widgetName: WIDGET_BUSCA, renderWidget: () => <WidgetBusca p={p} /> });
    await requestWidgetUpdate({ widgetName: WIDGET_ACOES, renderWidget: () => <WidgetAcoes p={p} /> });
  } catch { /* idem */ }
}
