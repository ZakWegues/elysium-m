import React from 'react';
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import type { Palette } from '../theme/palettes';

/**
 * Os três widgets do Android (bloco 73). São árvores de `FlexWidget`/`TextWidget` que a
 * lib desenha num bitmap — não é React Native de verdade: nada de estado, nada de hooks,
 * só o que couber num `RemoteViews`. Cada clique vira um `WIDGET_CLICK` no handler
 * (`handler.tsx`) ou abre o app por deep link (`OPEN_URI`).
 *
 * As cores vêm da paleta do tema escolhido no app (`tema.ts`): o widget tem a mesma cara
 * do app na tela inicial.
 */

/**
 * A lib tipa cor como `#hex` ou `rgba(r, g, b, a)`; a paleta guarda string. Os valores
 * são os mesmos (hex e rgba com espaço depois da vírgula), só o tipo precisa da ponte.
 */
const c = (s: string) => s as ColorProp;

export type EstadoPc = {
  online: boolean;
  cpu?: number;
  ram?: number;
  uptime?: string;
  quando: string;
};

/** Um retângulo de vidro (tinta do tema, borda fina, cantos redondos). */
function fundo(p: Palette) {
  const noite = p.familia === 'ely';
  return {
    backgroundColor: noite ? '#111624F0' : '#FFFFFFE8',
    borderColor: noite ? '#FFFFFF2A' : '#FFFFFFB0',
    borderWidth: 1,
    borderRadius: 24,
  } as const;
}

/** Busca (4×1): uma pílula que abre a lupa da Início, e um botão que abre o chat. */
export function WidgetBusca({ p }: { p: Palette }) {
  return (
    <FlexWidget
      style={{ ...fundo(p), height: 'match_parent', width: 'match_parent', flexDirection: 'row', alignItems: 'center', padding: 6, flexGap: 6 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'elysium://busca' }}
      accessibilityLabel="Buscar ou comandar no ELYSIUM"
    >
      <FlexWidget
        style={{ flex: 1, height: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, flexGap: 8 }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'elysium://busca' }}
      >
        <TextWidget text="⌕" style={{ fontSize: 18, color: c(p.primary) }} />
        <TextWidget text="Buscar ou comandar…" style={{ fontSize: 14, color: c(p.textMuted) }} />
      </FlexWidget>
      <FlexWidget
        style={{ height: 'match_parent', width: 88, borderRadius: 20, backgroundColor: c(p.primary), alignItems: 'center', justifyContent: 'center' }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'elysium://chat' }}
        accessibilityLabel="Abrir o chat"
      >
        <TextWidget text="Chat" style={{ fontSize: 14, fontWeight: 'bold', color: c(p.onPrimary) }} />
      </FlexWidget>
    </FlexWidget>
  );
}

const ACOES: { id: string; rotulo: string; icone: string }[] = [
  { id: 'lock', rotulo: 'Bloquear', icone: '🔒' },
  { id: 'print', rotulo: 'Print', icone: '📷' },
  { id: 'play', rotulo: 'Play', icone: '⏯' },
  { id: 'mute', rotulo: 'Mudo', icone: '🔇' },
];

/**
 * Ações (4×1): quatro botões que mandam RPC direto, sem abrir o app. `aviso` é o
 * resultado do último clique, desenhado embaixo por alguns segundos (o handler
 * redesenha sem aviso depois).
 */
export function WidgetAcoes({ p, aviso }: { p: Palette; aviso?: string }) {
  return (
    <FlexWidget style={{ ...fundo(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 6 }}>
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
        {ACOES.map(a => (
          <FlexWidget
            key={a.id}
            style={{ flex: 1, height: 'match_parent', borderRadius: 18, backgroundColor: c(p.primarySoft), alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}
            clickAction="ACAO"
            clickActionData={{ acao: a.id }}
            accessibilityLabel={a.rotulo}
          >
            <TextWidget text={a.icone} style={{ fontSize: 18 }} />
            <TextWidget text={a.rotulo} style={{ fontSize: 10, color: c(p.primary), fontWeight: '600' }} />
          </FlexWidget>
        ))}
      </FlexWidget>
      {aviso ? (
        <TextWidget text={aviso} style={{ fontSize: 10, color: c(p.textMuted), marginTop: 4, textAlign: 'center' }} maxLines={1} truncate="END" />
      ) : null}
    </FlexWidget>
  );
}

/** Estado (2×2): PC online?, CPU, RAM e há quanto tempo está ligado. Toque abre a aba PC. */
export function WidgetEstado({ p, e }: { p: Palette; e: EstadoPc }) {
  const cor = c(e.online ? p.success : p.textMuted);
  return (
    <FlexWidget
      style={{ ...fundo(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 14, justifyContent: 'space-between' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'elysium://pc' }}
      accessibilityLabel="Estado do PC"
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
        <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cor }} />
        <TextWidget text={e.online ? 'PC ligado' : 'PC fora de alcance'} style={{ fontSize: 12, color: c(p.text), fontWeight: '600' }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', flexGap: 12 }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={e.online && typeof e.cpu === 'number' ? `${e.cpu}%` : '—'} style={{ fontSize: 22, fontWeight: 'bold', color: c(p.primary) }} />
          <TextWidget text="CPU" style={{ fontSize: 10, color: c(p.textMuted) }} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={e.online && typeof e.ram === 'number' ? `${e.ram}%` : '—'} style={{ fontSize: 22, fontWeight: 'bold', color: c(p.primary) }} />
          <TextWidget text="RAM" style={{ fontSize: 10, color: c(p.textMuted) }} />
        </FlexWidget>
      </FlexWidget>
      <TextWidget
        text={e.online && e.uptime ? `ligado há ${e.uptime} · ${e.quando}` : `visto ${e.quando}`}
        style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END"
      />
    </FlexWidget>
  );
}


// ── Bloco 90: Clima e Rotinas ─────────────────────────────────────────────────

/** Ícone do clima (os nomes do Feather que o PC manda) → emoji: o widget não tem fonte de ícones. */
export function emojiDoClima(icone: string): string {
  return ({ sun: '☀️', cloud: '☁️', droplet: '🌧️', zap: '⛈️', moon: '🌙' } as Record<string, string>)[icone] ?? '🌤️';
}

export type ClimaWidget = {
  online: boolean;
  cidade?: string;
  temperatura?: number;
  descricao?: string;
  icone?: string;
  max?: number;
  min?: number;
  horas?: { hora: number; temp: number; icone: string }[];
  quando: string;
};

/** Clima (4×1 a 4×2): agora grande à esquerda, as próximas 3 horas à direita. Toque abre a Início. */
export function WidgetClima({ p, c: cl }: { p: Palette; c: ClimaWidget }) {
  return (
    <FlexWidget
      style={{ ...fundo(p), height: 'match_parent', width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, flexGap: 12 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'elysium://inicio' }}
      accessibilityLabel="Clima"
    >
      <TextWidget text={cl.online ? emojiDoClima(cl.icone ?? '') : '🌤️'} style={{ fontSize: 30 }} />
      <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
        <TextWidget
          text={cl.online && typeof cl.temperatura === 'number' ? `${Math.round(cl.temperatura)}°` : '—'}
          style={{ fontSize: 26, fontWeight: 'bold', color: c(p.text) }}
        />
        <TextWidget
          text={cl.online ? `${cl.descricao ?? ''} · ${Math.round(cl.max ?? 0)}°/${Math.round(cl.min ?? 0)}°` : 'Sem leitura do PC'}
          style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END"
        />
        <TextWidget text={cl.online ? (cl.cidade ?? '') : `visto ${cl.quando}`} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" />
      </FlexWidget>
      {cl.online && (cl.horas?.length ?? 0) > 0 ? (
        <FlexWidget style={{ flexDirection: 'row', flexGap: 10 }}>
          {(cl.horas ?? []).slice(0, 3).map(h => (
            <FlexWidget key={String(h.hora)} style={{ flexDirection: 'column', alignItems: 'center' }}>
              <TextWidget text={`${h.hora}h`} style={{ fontSize: 10, color: c(p.textMuted) }} />
              <TextWidget text={emojiDoClima(h.icone)} style={{ fontSize: 15 }} />
              <TextWidget text={`${Math.round(h.temp)}°`} style={{ fontSize: 12, fontWeight: '600', color: c(p.primary) }} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

export type RotinasWidget = {
  online: boolean;
  /** A próxima rotina por hora, já com o "quando" pronto para ler. */
  proxima?: { nome: string; quando: string };
  /** A última que rodou (por hora ou evento), com o começo do resultado. */
  ultima?: { nome: string; resultado: string; quando: string };
  total: number;
  quando: string;
};

/** Rotinas (4×2): a próxima e o resultado da última. Toque abre a aba Rotinas. */
export function WidgetRotinas({ p, r }: { p: Palette; r: RotinasWidget }) {
  return (
    <FlexWidget
      style={{ ...fundo(p), height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 14, flexGap: 8 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'elysium://rotinas' }}
      accessibilityLabel="Rotinas"
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6, width: 'match_parent' }}>
        <TextWidget text="⏱" style={{ fontSize: 14 }} />
        <TextWidget text="Rotinas" style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={r.online ? `${r.total} ativa${r.total === 1 ? '' : 's'}` : 'PC fora de alcance'} style={{ fontSize: 10, color: c(p.textMuted) }} />
      </FlexWidget>
      {r.proxima ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text="PRÓXIMA" style={{ fontSize: 9, color: c(p.textMuted), letterSpacing: 0.5 }} />
          <TextWidget text={`${r.proxima.nome} · ${r.proxima.quando}`} style={{ fontSize: 13, color: c(p.primary), fontWeight: '600' }} maxLines={1} truncate="END" />
        </FlexWidget>
      ) : (
        <TextWidget text={r.online ? 'Nenhuma rotina por hora ativa.' : `visto ${r.quando}`} style={{ fontSize: 12, color: c(p.textMuted) }} />
      )}
      {r.ultima ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={`ÚLTIMA · ${r.ultima.nome} · ${r.ultima.quando}`} style={{ fontSize: 9, color: c(p.textMuted), letterSpacing: 0.5 }} maxLines={1} truncate="END" />
          <TextWidget text={r.ultima.resultado} style={{ fontSize: 11, color: c(p.text) }} maxLines={2} truncate="END" />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
