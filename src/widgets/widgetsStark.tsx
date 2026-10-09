import React from 'react';
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import type { Palette } from '../theme/palettes';

/**
 * Widgets da fase 16 (07/10): Falar com a Ely, Hoje, Hábitos, Timers, Música e Listas. Mesmo
 * motor dos outros (`widgets.tsx`): árvores de `FlexWidget`/`TextWidget` desenhadas num
 * bitmap, sem estado. No tema Stark ganham o fio da cor do reator na borda e os rótulos em
 * maiúsculas espaçadas, como um painel de HUD.
 */

const c = (s: string) => s as ColorProp;

/** Painel: fundo da família, borda com o fio do acento na Stark. */
export function painel(p: Palette) {
  const stark = p.familia === 'stark';
  const noite = p.familia !== 'lg';
  return {
    backgroundColor: c(noite ? `${p.background.length === 7 ? p.background : '#05080f'}F0` : '#FFFFFFE8'),
    borderColor: c(stark ? `${p.primary}66` : noite ? '#FFFFFF10' : '#FFFFFFB0'),
    borderWidth: 1,
    borderRadius: stark ? 18 : 24,
  } as const;
}

/** Rótulo de seção: maiúsculo e espaçado na Stark. */
function Rotulo({ p, texto }: { p: Palette; texto: string }) {
  const stark = p.familia === 'stark';
  return <TextWidget text={stark ? texto.toUpperCase() : texto} style={{ fontSize: stark ? 10 : 12, fontWeight: 'bold', color: c(stark ? p.primary : p.text), letterSpacing: stark ? 1.5 : 0 }} />;
}

/** Falar com a Ely (1×1): abre o chat já ouvindo um pedido. */
export function WidgetFalar({ p, chave = '' }: { p: Palette; chave?: string }) {
  return (
    <FlexWidget
      style={{ ...painel(p), height: 'match_parent', width: 'match_parent', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', flexGap: 4 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: chave ? `elysium://falar?k=${chave}` : 'elysium://falar' }}
      accessibilityLabel="Falar com a Ely"
    >
      <FlexWidget style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: c(p.primary), backgroundColor: c(p.primarySoft), alignItems: 'center', justifyContent: 'center' }}>
        <TextWidget text="🎙" style={{ fontSize: 20 }} />
      </FlexWidget>
      <TextWidget text="Ely" style={{ fontSize: 11, fontWeight: 'bold', color: c(p.primary), letterSpacing: 1 }} />
    </FlexWidget>
  );
}

export type HojeWidget = {
  online: boolean;
  saudacao?: string;
  frase?: string;
  temp?: string;
  proximo?: string;
  habitos?: { feitos: number; total: number };
  timer?: string;
  quando: string;
};

/** Hoje (4×2): o briefing em quatro linhas. Toque abre a aba Hoje. */
export function WidgetHoje({ p, h }: { p: Palette; h: HojeWidget }) {
  const linha = (icone: string, texto: string) => (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6, width: 'match_parent' }}>
      <TextWidget text={icone} style={{ fontSize: 12 }} />
      <TextWidget text={texto} style={{ fontSize: 12, color: c(p.text) }} maxLines={1} truncate="END" />
    </FlexWidget>
  );
  return (
    <FlexWidget
      style={{ ...painel(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 14, flexGap: 6 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'elysium://hoje' }}
      accessibilityLabel="Briefing de hoje"
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <Rotulo p={p} texto="Hoje" />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={h.online ? (h.temp ?? '') : 'PC fora de alcance'} style={{ fontSize: 11, color: c(p.textMuted) }} />
      </FlexWidget>
      {h.online ? (
        <>
          <TextWidget text={h.saudacao ?? ''} style={{ fontSize: 15, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
          <TextWidget text={h.frase ?? ''} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={2} truncate="END" />
          {h.habitos && h.habitos.total > 0 ? linha('🔥', `Hábitos: ${h.habitos.feitos} de ${h.habitos.total}`) : null}
          {h.proximo ? linha('🔔', h.proximo) : null}
          {h.timer ? linha('⏱', h.timer) : null}
        </>
      ) : (
        <TextWidget text={`visto ${h.quando}`} style={{ fontSize: 11, color: c(p.textMuted) }} />
      )}
    </FlexWidget>
  );
}

export type HabitosWidget = { online: boolean; habitos: { id: string; nome: string; feito: boolean; sequencia: number }[]; aviso?: string };

/** Hábitos (4×2): toque no hábito marca/desmarca hoje, sem abrir o app. */
export function WidgetHabitos({ p, h }: { p: Palette; h: HabitosWidget }) {
  return (
    <FlexWidget style={{ ...painel(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 12, flexGap: 4 }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://hoje' }}>
        <Rotulo p={p} texto="Hábitos" />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={h.online ? `${h.habitos.filter(x => x.feito).length}/${h.habitos.length}` : '—'} style={{ fontSize: 11, color: c(p.textMuted) }} />
      </FlexWidget>
      {!h.online ? <TextWidget text="PC fora de alcance" style={{ fontSize: 11, color: c(p.textMuted) }} /> : null}
      {h.online && !h.habitos.length ? <TextWidget text="Nenhum hábito para hoje — crie na aba Hoje." style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={2} /> : null}
      {h.habitos.length > 4 ? <TextWidget text={`+${h.habitos.length - 4} no app`} style={{ fontSize: 10, color: c(p.textMuted) }} /> : null}
      {h.habitos.slice(0, 4).map(x => (
        <FlexWidget
          key={x.id}
          style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8, width: 'match_parent', paddingVertical: 4 }}
          clickAction="HABITO"
          clickActionData={{ id: x.id, feito: x.feito ? '1' : '' }}
          accessibilityLabel={`${x.nome}${x.feito ? ', feito' : ''}`}
        >
          <FlexWidget style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c(p.primary), backgroundColor: c(x.feito ? p.primary : '#00000000'), alignItems: 'center', justifyContent: 'center' }}>
            <TextWidget text={x.feito ? '✓' : ''} style={{ fontSize: 11, fontWeight: 'bold', color: c(p.background.length === 7 ? p.background : '#000000') }} />
          </FlexWidget>
          <TextWidget text={x.nome} style={{ fontSize: 13, color: c(x.feito ? p.textMuted : p.text) }} maxLines={1} truncate="END" />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget text={`🔥${x.sequencia}`} style={{ fontSize: 11, color: c(p.accent) }} />
        </FlexWidget>
      ))}
      {h.aviso ? <TextWidget text={h.aviso} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
    </FlexWidget>
  );
}

export type TimersWidget = { online: boolean; timers: { nome: string; fimEm: string }[]; aviso?: string };

/** Timers (2×2): os que estão correndo e três atalhos (5/10/25 min). */
export function WidgetTimers({ p, t }: { p: Palette; t: TimersWidget }) {
  return (
    <FlexWidget style={{ ...painel(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 12, flexGap: 6 }}>
      <Rotulo p={p} texto="Timers" />
      {!t.online ? <TextWidget text="PC fora de alcance" style={{ fontSize: 11, color: c(p.textMuted) }} /> : null}
      {t.online && !t.timers.length ? <TextWidget text="Nenhum correndo" style={{ fontSize: 11, color: c(p.textMuted) }} /> : null}
      {t.timers.slice(0, 2).map((x, i) => (
        <TextWidget key={i} text={`${x.nome || 'Timer'} · até ${x.fimEm}`} style={{ fontSize: 12, color: c(p.text) }} maxLines={1} truncate="END" />
      ))}
      {t.timers.length > 2 ? <TextWidget text={`+${t.timers.length - 2} correndo`} style={{ fontSize: 10, color: c(p.textMuted) }} /> : null}
      <FlexWidget style={{ flex: 1 }} />
      <FlexWidget style={{ flexDirection: 'row', flexGap: 6, width: 'match_parent' }}>
        {[5, 10, 25].map(m => (
          <FlexWidget key={m} style={{ flex: 1, height: 32, borderRadius: 10, backgroundColor: c(p.primarySoft), alignItems: 'center', justifyContent: 'center' }}
            clickAction="TIMER" clickActionData={{ minutos: String(m) }} accessibilityLabel={`Timer de ${m} minutos`}>
            <TextWidget text={`${m}′`} style={{ fontSize: 12, fontWeight: 'bold', color: c(p.primary) }} />
          </FlexWidget>
        ))}
      </FlexWidget>
      {t.aviso ? <TextWidget text={t.aviso} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
    </FlexWidget>
  );
}

export type MusicaWidget = { online: boolean; tocando?: boolean; faixa?: string; artista?: string; aviso?: string };

/** Música (4×1): o que toca e os três botões de mídia do PC. */
export function WidgetMusica({ p, m }: { p: Palette; m: MusicaWidget }) {
  const botao = (op: string, txt: string, rot: string) => (
    <FlexWidget style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c(op === 'play' ? p.primary : p.primarySoft), alignItems: 'center', justifyContent: 'center' }}
      clickAction="MIDIA" clickActionData={{ op }} accessibilityLabel={rot}>
      <TextWidget text={txt} style={{ fontSize: 15, color: c(op === 'play' ? p.onPrimary : p.primary) }} />
    </FlexWidget>
  );
  return (
    <FlexWidget style={{ ...painel(p), height: 'match_parent', width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 8 }}>
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://pc' }}>
        <TextWidget text={m.aviso ?? (m.faixa || (m.online ? 'Nada tocando no Spotify' : 'PC fora de alcance'))} style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
        <TextWidget text={m.artista ?? ''} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" />
      </FlexWidget>
      {botao('previous', '⏮', 'Anterior')}
      {botao('play', m.tocando ? '⏸' : '▶', 'Tocar ou pausar')}
      {botao('skip', '⏭', 'Próxima')}
    </FlexWidget>
  );
}

export type ListasWidget = { online: boolean; listaId?: string; nome?: string; itens: { id: string; texto: string }[]; aviso?: string };

/** Listas (4×2): os pendentes da lista mais recente; toque marca como feito. */
export function WidgetListas({ p, l }: { p: Palette; l: ListasWidget }) {
  return (
    <FlexWidget style={{ ...painel(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 12, flexGap: 3 }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://inicio' }}>
        <Rotulo p={p} texto={l.nome ?? 'Listas'} />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={l.online ? `${l.itens.length} pendente${l.itens.length === 1 ? '' : 's'}` : '—'} style={{ fontSize: 11, color: c(p.textMuted) }} />
      </FlexWidget>
      {!l.online ? <TextWidget text="PC fora de alcance" style={{ fontSize: 11, color: c(p.textMuted) }} /> : null}
      {l.online && !l.itens.length ? <TextWidget text="Nada pendente. Diga “põe leite na lista”." style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={2} /> : null}
      {l.itens.slice(0, 5).map(x => (
        <FlexWidget key={x.id} style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8, width: 'match_parent', paddingVertical: 3 }}
          clickAction="ITEM" clickActionData={{ lista: l.listaId ?? '', item: x.id }} accessibilityLabel={`Marcar ${x.texto}`}>
          <FlexWidget style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: c(p.primary) }} />
          <TextWidget text={x.texto} style={{ fontSize: 13, color: c(p.text) }} maxLines={1} truncate="END" />
        </FlexWidget>
      ))}
      {l.aviso ? <TextWidget text={l.aviso} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
    </FlexWidget>
  );
}

// ── Fase 18 (08/10): Tarefas ─────────────────────────────────────────────────

export type TarefasWidget = { online: boolean; tarefas: { id: string; texto: string; quando?: string; atrasada?: boolean }[]; total: number; aviso?: string };

/** Tarefas (4×2): as próximas; tocar no círculo conclui; "+" e o título abrem a tela cheia. */
export function WidgetTarefas({ p, t }: { p: Palette; t: TarefasWidget }) {
  return (
    <FlexWidget style={{ ...painel(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 12, flexGap: 3 }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://tarefas' }}>
          <Rotulo p={p} texto="Tarefas" />
          <TextWidget text={t.online ? `  ${t.total} aberta${t.total === 1 ? '' : 's'}` : ''} style={{ fontSize: 11, color: c(p.textMuted) }} />
        </FlexWidget>
        <FlexWidget style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c(p.primary), alignItems: 'center', justifyContent: 'center' }}
          clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://tarefas' }} accessibilityLabel="Nova tarefa">
          <TextWidget text="+" style={{ fontSize: 18, fontWeight: 'bold', color: c(p.onPrimary) }} />
        </FlexWidget>
      </FlexWidget>
      {!t.online ? <TextWidget text="PC fora de alcance" style={{ fontSize: 11, color: c(p.textMuted) }} /> : null}
      {t.online && !t.tarefas.length ? <TextWidget text="Nada pendente. Diga à Ely “tenho prova sexta”." style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={2} /> : null}
      {t.tarefas.slice(0, 4).map(x => (
        <FlexWidget key={x.id} style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8, width: 'match_parent', paddingVertical: 3 }}>
          <FlexWidget style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c(p.primary) }}
            clickAction="TAREFA" clickActionData={{ id: x.id }} accessibilityLabel={`Concluir ${x.texto}`} />
          <TextWidget text={x.texto} style={{ fontSize: 13, color: c(p.text) }} maxLines={1} truncate="END" />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget text={x.quando ?? ''} style={{ fontSize: 10, color: c(x.atrasada ? p.error : p.textMuted) }} />
        </FlexWidget>
      ))}
      {t.total > 4 ? <TextWidget text={`+${t.total - 4} na lista`} style={{ fontSize: 10, color: c(p.textMuted) }} /> : null}
      {t.aviso ? <TextWidget text={t.aviso} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
    </FlexWidget>
  );
}
