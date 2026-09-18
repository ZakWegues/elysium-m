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
