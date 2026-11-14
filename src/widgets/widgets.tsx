import React from 'react';
import { FlexWidget, SvgWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import { svgDaEsfera } from '../lib/esferaLogica';
import type { Palette } from '../theme/palettes';
import { corComAlfa, pct, type Tamanho } from './medidas';

/**
 * Os widgets do Android, reformulados (14/11): de 15 para 8, cada um mudando o que mostra com o
 * tamanho que ele tem na tela inicial (2×1, 4×1, 2×2, 4×2…). São árvores de `FlexWidget` /
 * `TextWidget` que a lib desenha num bitmap — sem estado, sem hooks. Cada clique vira um
 * `WIDGET_CLICK` no handler (`handler.tsx`) ou abre o app por deep link (`OPEN_URI`).
 *
 * Visual: vidro escuro na cor do tema (degradê da superfície para o fundo), borda fina (o fio do
 * reator na Stark), e em todos o botão da Ely (a esfera pequena) que abre o app já ouvindo.
 */

const c = (s: string) => s as ColorProp;
const stark = (p: Palette) => p.familia === 'stark';

// ── peças ────────────────────────────────────────────────────────────────────────────────
/** O cartão: degradê da superfície do tema para o fundo, borda fina. */
function cartao(p: Palette) {
  return {
    height: 'match_parent' as const, width: 'match_parent' as const,
    backgroundGradient: { from: c(corComAlfa(p.surface, 0.96)), to: c(corComAlfa(p.background, 0.96)), orientation: 'TL_BR' as const },
    borderColor: c(stark(p) ? corComAlfa(p.primary, 0.45) : '#FFFFFF1A'),
    borderWidth: 1,
    borderRadius: stark(p) ? 18 : 26,
  };
}

/** Título da seção: maiúsculo e espaçado na Stark. */
function Titulo({ p, texto }: { p: Palette; texto: string }) {
  return <TextWidget text={stark(p) ? texto.toUpperCase() : texto} style={{ fontSize: stark(p) ? 10 : 12, fontWeight: 'bold', color: c(stark(p) ? p.primary : p.textMuted), letterSpacing: stark(p) ? 1.5 : 0.3 }} />;
}

const uriFalar = (chave: string) => (chave ? `elysium://falar?k=${chave}` : 'elysium://falar');

/** A esfera da Ely, pequena: abre o app ouvindo. */
function BotaoEly({ p, chave, tam = 26 }: { p: Palette; chave: string; tam?: number }) {
  return (
    <FlexWidget style={{ width: tam, height: tam, alignItems: 'center', justifyContent: 'center' }} clickAction="OPEN_URI" clickActionData={{ uri: uriFalar(chave) }} accessibilityLabel="Falar com a Ely">
      <SvgWidget svg={svgDaEsfera(p.primary, 64)} style={{ width: tam, height: tam }} />
    </FlexWidget>
  );
}

/** Linha de cima: título, um texto à direita e o botão da Ely. */
function Topo({ p, titulo, direita, chave, uri }: { p: Palette; titulo: string; direita?: string; chave: string; uri?: string }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', flexGap: 6 }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexGap: 6 }} {...(uri ? { clickAction: 'OPEN_URI', clickActionData: { uri } } : {})}>
        <Titulo p={p} texto={titulo} />
        {direita ? <TextWidget text={direita} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
      </FlexWidget>
      <BotaoEly p={p} chave={chave} />
    </FlexWidget>
  );
}

/** Barra de progresso fina (0–100). */
function Barra({ p, valor }: { p: Palette; valor: number }) {
  const v = pct(valor);
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 4, borderRadius: 2, backgroundColor: c(p.primarySoft) }}>
      {v > 0 ? <FlexWidget style={{ flex: v, height: 4, borderRadius: 2, backgroundColor: c(v >= 85 ? p.error : p.primary) }} /> : null}
      {v < 100 ? <FlexWidget style={{ flex: 100 - v, height: 4 }} /> : null}
    </FlexWidget>
  );
}

/** Botão em pílula (ação no handler). `forte` = cor cheia; `perigo` = vermelho. */
function Pilula({ p, texto, acao, dados, forte = false, perigo = false, rotulo }: { p: Palette; texto: string; acao: string; dados: Record<string, string>; forte?: boolean; perigo?: boolean; rotulo?: string }) {
  const fundo = perigo ? p.errorSoft : forte ? p.primary : p.primarySoft;
  const cor = perigo ? p.error : forte ? p.onPrimary : p.primary;
  return (
    <FlexWidget style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: c(fundo), alignItems: 'center', justifyContent: 'center' }} clickAction={acao} clickActionData={dados} accessibilityLabel={rotulo ?? texto}>
      <TextWidget text={texto} style={{ fontSize: 13, fontWeight: '600', color: c(cor) }} />
    </FlexWidget>
  );
}

/** "PC desligado · visto 14:32": a bolinha apagada e quando foi a última leitura. */
function ForaDoAr({ p, quando, curto = false }: { p: Palette; quando?: string; curto?: boolean }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
      <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c(p.textFaint) }} />
      <TextWidget text={curto || !quando ? 'PC desligado' : `PC desligado · visto ${quando}`} style={{ fontSize: 12, color: c(p.textMuted) }} maxLines={1} truncate="END" />
    </FlexWidget>
  );
}

function Aviso({ p, texto }: { p: Palette; texto?: string }) {
  return texto ? <TextWidget text={texto} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null;
}

const pad = (t: Tamanho) => (t.linhas === 1 ? 10 : 14);

// ── 1. Ely (ex-Esfera; juntou Falar e Busca) ─────────────────────────────────────────────
export function WidgetEly({ p, t, chave }: { p: Palette; t: Tamanho; chave: string }) {
  const falar = { clickAction: 'OPEN_URI', clickActionData: { uri: uriFalar(chave) } };
  const busca = (
    <FlexWidget style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: c('#FFFFFF0F'), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, flexGap: 8 }}
      clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://busca' }} accessibilityLabel="Buscar ou comandar">
      <TextWidget text="⌕" style={{ fontSize: 16, color: c(p.primary) }} />
      <TextWidget text="Buscar ou comandar…" style={{ fontSize: 13, color: c(p.textMuted) }} maxLines={1} truncate="END" />
    </FlexWidget>
  );
  const chat = (
    <FlexWidget style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c(p.primary), alignItems: 'center', justifyContent: 'center' }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://chat' }} accessibilityLabel="Abrir o chat">
      <TextWidget text="Chat" style={{ fontSize: 13, fontWeight: 'bold', color: c(p.onPrimary) }} />
    </FlexWidget>
  );
  // 1×1 / 2×2: só a esfera (toque = falar).
  if (t.colunas === 1 || (t.colunas <= 3 && t.linhas >= 2)) {
    const lado = t.colunas === 1 ? 48 : 104;
    return (
      <FlexWidget style={{ ...cartao(p), alignItems: 'center', justifyContent: 'center', flexDirection: 'column', flexGap: 2 }} {...falar} accessibilityLabel="Falar com a Ely">
        <SvgWidget svg={svgDaEsfera(p.primary, 200)} style={{ width: lado, height: lado }} />
        {t.linhas >= 2 ? <TextWidget text="Ely" style={{ fontSize: 12, fontWeight: 'bold', color: c(p.primary), letterSpacing: 2 }} /> : null}
      </FlexWidget>
    );
  }
  // 2×1 / 3×1: esfera + "Falar com a Ely".
  if (t.colunas <= 3) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 10 }} {...falar} accessibilityLabel="Falar com a Ely">
        <SvgWidget svg={svgDaEsfera(p.primary, 96)} style={{ width: 34, height: 34 }} />
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          <TextWidget text="Falar com a Ely" style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
          <TextWidget text="toque e fale" style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} />
        </FlexWidget>
      </FlexWidget>
    );
  }
  // 4×1: esfera (falar) + busca + chat.
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, flexGap: 8 }}>
        <BotaoEly p={p} chave={chave} tam={40} />
        {busca}
        {chat}
      </FlexWidget>
    );
  }
  // 4×2+: esfera grande à esquerda; busca e falar/chat à direita.
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', padding: 14, flexGap: 14 }}>
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'center' }} {...falar} accessibilityLabel="Falar com a Ely">
        <SvgWidget svg={svgDaEsfera(p.primary, 200)} style={{ width: 92, height: 92 }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 10 }}>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>{busca}</FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: 8 }}>
          <FlexWidget style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: c(p.primarySoft), alignItems: 'center', justifyContent: 'center' }} {...falar} accessibilityLabel="Falar com a Ely">
            <TextWidget text="🎙  Falar" style={{ fontSize: 13, fontWeight: 'bold', color: c(p.primary) }} />
          </FlexWidget>
          {chat}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

// ── 2. PC (ex-Estado; juntou Ações e Saúde) ──────────────────────────────────────────────
export type DadosPc = { online: boolean; cpu?: number; ram?: number; uptime?: string; quando: string; ruins?: number; pior?: string; aviso?: string };

const ACOES_PC: { id: string; icone: string; rotulo: string }[] = [
  { id: 'lock', icone: '🔒', rotulo: 'Bloquear' },
  { id: 'print', icone: '📷', rotulo: 'Print' },
  { id: 'play', icone: '⏯', rotulo: 'Play/pause' },
  { id: 'mute', icone: '🔇', rotulo: 'Mudo' },
];

export function WidgetPc({ p, t, d, chave }: { p: Palette; t: Tamanho; d: DadosPc; chave: string }) {
  const cor = c(d.online ? p.success : p.textFaint);
  const status = (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://pc' }}>
      <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cor }} />
      <TextWidget text={d.online ? 'PC ligado' : 'PC desligado'} style={{ fontSize: 12, fontWeight: '600', color: c(p.text) }} />
    </FlexWidget>
  );
  const numeros = (grande: boolean) => (
    <FlexWidget style={{ flexDirection: 'row', flexGap: 14, width: 'match_parent' }}>
      {([['CPU', d.cpu], ['RAM', d.ram]] as const).map(([n, v]) => (
        <FlexWidget key={n} style={{ flex: 1, flexDirection: 'column', flexGap: 3 }}>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', flexGap: 4 }}>
            <TextWidget text={typeof v === 'number' ? `${v}%` : '—'} style={{ fontSize: grande ? 22 : 15, fontWeight: 'bold', color: c(p.text) }} />
            <TextWidget text={n} style={{ fontSize: 10, color: c(p.textMuted) }} />
          </FlexWidget>
          <Barra p={p} valor={typeof v === 'number' ? v : 0} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
  const acoes = (
    <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
      {ACOES_PC.map((a) => (
        <FlexWidget key={a.id} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c(p.primarySoft), alignItems: 'center', justifyContent: 'center' }} clickAction="ACAO" clickActionData={{ acao: a.id }} accessibilityLabel={a.rotulo}>
          <TextWidget text={a.icone} style={{ fontSize: 15 }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
  // 2×1: status e os números em uma linha.
  if (t.colunas <= 3 && t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'column', justifyContent: 'center', paddingHorizontal: 12, flexGap: 2 }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://pc' }} accessibilityLabel="Estado do PC">
        {d.online ? status : <ForaDoAr p={p} curto />}
        <TextWidget text={d.online ? `CPU ${d.cpu ?? '—'}% · RAM ${d.ram ?? '—'}%` : `visto ${d.quando}`} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} />
      </FlexWidget>
    );
  }
  // 4×1: status + números à esquerda, ações à direita.
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 10 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 2 }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://pc' }}>
          {d.online ? status : <ForaDoAr p={p} curto />}
          <TextWidget text={d.aviso ?? (d.online ? `CPU ${d.cpu ?? '—'}% · RAM ${d.ram ?? '—'}%` : `visto ${d.quando}`)} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" />
        </FlexWidget>
        {d.online ? acoes : null}
      </FlexWidget>
    );
  }
  // 2×2 e maiores: topo, números com barra, ligado há, saúde; ações se couber.
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 8 }}>
      <Topo p={p} titulo="PC" chave={chave} uri="elysium://pc" direita={d.online && d.uptime && t.colunas >= 4 ? `ligado há ${d.uptime}` : undefined} />
      {d.online ? (
        <>
          {numeros(true)}
          {t.colunas >= 4 ? acoes : <TextWidget text={d.uptime ? `ligado há ${d.uptime}` : ''} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} />}
          {t.colunas >= 4 && d.ruins !== undefined ? (
            <TextWidget text={!d.ruins ? 'ELYSIUM: tudo certo' : `${d.ruins} ponto${d.ruins === 1 ? '' : 's'} de atenção${d.pior ? ` · ${d.pior}` : ''}`} style={{ fontSize: 11, color: c(d.ruins ? '#E0A84A' : p.textMuted) }} maxLines={1} truncate="END" />
          ) : null}
        </>
      ) : <ForaDoAr p={p} quando={d.quando} />}
      <Aviso p={p} texto={d.aviso} />
    </FlexWidget>
  );
}

// ── 3. Clima ─────────────────────────────────────────────────────────────────────────────
/** Ícone do clima (os nomes do Feather que o PC manda) → emoji: o widget não tem fonte de ícones. */
export function emojiDoClima(icone: string): string {
  return ({ sun: '☀️', cloud: '☁️', droplet: '🌧️', zap: '⛈️', moon: '🌙' } as Record<string, string>)[icone] ?? '🌤️';
}

export type ClimaWidget = { online: boolean; cidade?: string; temperatura?: number; descricao?: string; icone?: string; max?: number; min?: number; horas?: { hora: number; temp: number; icone: string }[]; quando: string };

export function WidgetClima({ p, t, cl, chave }: { p: Palette; t: Tamanho; cl: ClimaWidget; chave: string }) {
  const abrir = { clickAction: 'OPEN_URI', clickActionData: { uri: 'elysium://inicio' } };
  const temp = cl.online && typeof cl.temperatura === 'number' ? `${Math.round(cl.temperatura)}°` : '—';
  const horas = (n: number) => (cl.online && (cl.horas?.length ?? 0) > 0 ? (
    <FlexWidget style={{ flexDirection: 'row', flexGap: 12 }}>
      {(cl.horas ?? []).slice(0, n).map((h) => (
        <FlexWidget key={String(h.hora)} style={{ flexDirection: 'column', alignItems: 'center' }}>
          <TextWidget text={`${h.hora}h`} style={{ fontSize: 10, color: c(p.textMuted) }} />
          <TextWidget text={emojiDoClima(h.icone)} style={{ fontSize: 15 }} />
          <TextWidget text={`${Math.round(h.temp)}°`} style={{ fontSize: 12, fontWeight: '600', color: c(p.primary) }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  ) : null);
  // 2×1: ícone, temperatura e cidade.
  if (t.colunas <= 3 && t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 10 }} {...abrir} accessibilityLabel="Clima">
        <TextWidget text={cl.online ? emojiDoClima(cl.icone ?? '') : '🌤️'} style={{ fontSize: 24 }} />
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          <TextWidget text={temp} style={{ fontSize: 20, fontWeight: 'bold', color: c(p.text) }} />
          <TextWidget text={cl.online ? (cl.cidade ?? cl.descricao ?? '') : 'PC desligado'} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" />
        </FlexWidget>
      </FlexWidget>
    );
  }
  const agora = (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 10, flex: 1 }} {...abrir}>
      <TextWidget text={cl.online ? emojiDoClima(cl.icone ?? '') : '🌤️'} style={{ fontSize: t.linhas === 1 ? 28 : 34 }} />
      <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
        <TextWidget text={temp} style={{ fontSize: t.linhas === 1 ? 24 : 30, fontWeight: 'bold', color: c(p.text) }} />
        <TextWidget text={cl.online ? `${cl.descricao ?? ''} · ${Math.round(cl.max ?? 0)}°/${Math.round(cl.min ?? 0)}°` : `PC desligado · visto ${cl.quando}`} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" />
      </FlexWidget>
    </FlexWidget>
  );
  // 4×1: agora à esquerda, 3 horas à direita.
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, flexGap: 10 }} accessibilityLabel="Clima">
        {agora}
        {horas(3)}
      </FlexWidget>
    );
  }
  // 2×2 / 4×2: topo com a cidade, agora, horas embaixo.
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 8 }} accessibilityLabel="Clima">
      <Topo p={p} titulo={cl.online && cl.cidade ? cl.cidade : 'Clima'} chave={chave} uri="elysium://inicio" />
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>{agora}</FlexWidget>
      {horas(t.colunas >= 4 ? 5 : 3)}
    </FlexWidget>
  );
}

// ── 4. Música ────────────────────────────────────────────────────────────────────────────
export type MusicaWidget = { online: boolean; tocando?: boolean; faixa?: string; artista?: string; aviso?: string };

export function WidgetMusica({ p, t, m, chave }: { p: Palette; t: Tamanho; m: MusicaWidget; chave: string }) {
  const botao = (op: string, txt: string, rot: string, principal = false) => (
    <FlexWidget key={op} style={{ width: principal ? 44 : 36, height: principal ? 44 : 36, borderRadius: principal ? 22 : 18, backgroundColor: c(principal ? p.primary : p.primarySoft), alignItems: 'center', justifyContent: 'center' }}
      clickAction="MIDIA" clickActionData={{ op }} accessibilityLabel={rot}>
      <TextWidget text={txt} style={{ fontSize: principal ? 17 : 14, color: c(principal ? p.onPrimary : p.primary) }} />
    </FlexWidget>
  );
  const faixa = m.aviso ?? (m.faixa || (m.online ? 'Nada tocando' : 'PC desligado'));
  const texto = (
    <FlexWidget style={{ flex: 1, flexDirection: 'column' }} clickAction="OPEN_URI" clickActionData={{ uri: 'elysium://pc' }}>
      <TextWidget text={faixa} style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
      {m.artista ? <TextWidget text={m.artista} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
    </FlexWidget>
  );
  const play = botao('play', m.tocando ? '⏸' : '▶', 'Tocar ou pausar', true);
  // 2×1: faixa + play.
  if (t.colunas <= 3 && t.linhas === 1) {
    return <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 8 }}>{texto}{m.online ? play : null}</FlexWidget>;
  }
  const controles = m.online ? <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>{botao('previous', '⏮', 'Anterior')}{play}{botao('skip', '⏭', 'Próxima')}</FlexWidget> : null;
  if (t.linhas === 1) {
    return <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 8 }}>{texto}{controles}</FlexWidget>;
  }
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 10 }}>
      <Topo p={p} titulo="Tocando" chave={chave} />
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>{texto}</FlexWidget>
      {controles}
    </FlexWidget>
  );
}

// ── 5. Tempo (ex-Foco; juntou Timers) ────────────────────────────────────────────────────
export type TempoWidget = { online: boolean; focoAtivo: boolean; focoMin?: number; distracoes?: number; timers: { nome: string; fimEm: string }[]; aviso?: string };

export function WidgetTempo({ p, t, d, chave }: { p: Palette; t: Tamanho; d: TempoWidget; chave: string }) {
  const linha = !d.online ? 'PC desligado'
    : d.focoAtivo ? `Foco · faltam ${d.focoMin ?? 0} min`
    : d.timers[0] ? `${d.timers[0].nome || 'Timer'} até ${d.timers[0].fimEm}` : 'Foco e timers';
  const sub = d.aviso ?? (!d.online ? '' : d.focoAtivo ? (d.distracoes ? `${d.distracoes} distração(ões)` : 'sem distrações') : d.timers.length > 1 ? `+${d.timers.length - 1} timer${d.timers.length > 2 ? 's' : ''}` : 'toque para começar');
  const parar = <Pilula p={p} texto="Parar" acao="FOCO" dados={{ acao: 'parar' }} perigo rotulo="Parar o foco" />;
  const foco = (m: number, forte = false) => <Pilula key={`f${m}`} p={p} texto={`Foco ${m}`} acao="FOCO" dados={{ acao: String(m) }} forte={forte} rotulo={`Foco de ${m} minutos`} />;
  const timer = (m: number) => <Pilula key={`t${m}`} p={p} texto={`${m}′`} acao="TIMER" dados={{ minutos: String(m) }} rotulo={`Timer de ${m} minutos`} />;
  const texto = (
    <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
      <TextWidget text={linha} style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
      {sub ? <TextWidget text={sub} style={{ fontSize: 10, color: c(p.textMuted) }} maxLines={1} truncate="END" /> : null}
    </FlexWidget>
  );
  // 2×1: o estado e um botão.
  if (t.colunas <= 3 && t.linhas === 1) {
    return <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, flexGap: 6 }}>{texto}{d.online ? (d.focoAtivo ? parar : foco(25, true)) : null}</FlexWidget>;
  }
  // 4×1: estado + botões de foco e timer.
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 6 }}>
        {texto}
        {d.online ? (d.focoAtivo ? parar : [foco(25, true), timer(5), timer(10)]) : null}
      </FlexWidget>
    );
  }
  // 4×2: topo, estado, timers correndo, botões de foco e de timer.
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 8 }}>
      <Topo p={p} titulo="Tempo" chave={chave} />
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>{texto}</FlexWidget>
      {d.timers.slice(0, t.linhas >= 3 ? 3 : 1).map((x, i) => (
        <TextWidget key={i} text={`⏱ ${x.nome || 'Timer'} até ${x.fimEm}`} style={{ fontSize: 12, color: c(p.text) }} maxLines={1} truncate="END" />
      ))}
      <FlexWidget style={{ flex: 1 }} />
      {d.online ? (
        <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
          {d.focoAtivo ? parar : [foco(25, true), foco(50)]}
          {t.colunas >= 4 ? [timer(5), timer(10)] : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

// ── 6. Hoje (juntou Tarefas e Hábitos) ───────────────────────────────────────────────────
export type HojeWidget = {
  online: boolean; quando: string;
  saudacao?: string; frase?: string; temp?: string; proximo?: string;
  tarefas: { id: string; texto: string; quando?: string; atrasada?: boolean }[]; totalTarefas: number;
  habitos: { id: string; nome: string; feito: boolean; sequencia: number }[];
  aviso?: string;
};

export function WidgetHoje({ p, t, h, chave }: { p: Palette; t: Tamanho; h: HojeWidget; chave: string }) {
  const feitos = h.habitos.filter((x) => x.feito).length;
  const resumo = [h.totalTarefas ? `${h.totalTarefas} tarefa${h.totalTarefas === 1 ? '' : 's'}` : 'sem tarefas', h.habitos.length ? `hábitos ${feitos}/${h.habitos.length}` : ''].filter(Boolean).join(' · ');
  const abrir = { clickAction: 'OPEN_URI', clickActionData: { uri: 'elysium://hoje' } };
  if (!h.online) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'column', justifyContent: 'center', padding: pad(t), flexGap: 4 }} {...abrir}>
        {t.linhas >= 2 ? <Topo p={p} titulo="Hoje" chave={chave} /> : null}
        <ForaDoAr p={p} quando={h.quando} curto={t.colunas <= 3} />
      </FlexWidget>
    );
  }
  // 2×1 / 4×1: saudação e o resumo (tarefas, hábitos) ou o próximo compromisso.
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexGap: 8 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }} {...abrir}>
          <TextWidget text={h.saudacao ?? 'Hoje'} style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
          <TextWidget text={t.colunas >= 4 ? (h.proximo ? `${resumo} · ${h.proximo}` : resumo) : resumo} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" />
        </FlexWidget>
        {t.colunas >= 4 ? <BotaoEly p={p} chave={chave} tam={30} /> : null}
      </FlexWidget>
    );
  }
  const maxTarefas = t.linhas >= 3 ? 4 : 2;
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 5 }}>
      <Topo p={p} titulo="Hoje" direita={h.temp} chave={chave} uri="elysium://hoje" />
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }} {...abrir}>
        <TextWidget text={h.saudacao ?? ''} style={{ fontSize: 15, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
        {t.linhas >= 3 && h.frase ? <TextWidget text={h.frase} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={2} truncate="END" /> : null}
      </FlexWidget>
      {h.tarefas.slice(0, maxTarefas).map((x) => (
        <FlexWidget key={x.id} style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8, width: 'match_parent', paddingVertical: 2 }}>
          <FlexWidget style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: c(p.primary) }} clickAction="TAREFA" clickActionData={{ id: x.id }} accessibilityLabel={`Concluir ${x.texto}`} />
          <TextWidget text={x.texto} style={{ fontSize: 12, color: c(p.text) }} maxLines={1} truncate="END" />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget text={x.quando ?? ''} style={{ fontSize: 10, color: c(x.atrasada ? p.error : p.textMuted) }} />
        </FlexWidget>
      ))}
      {!h.tarefas.length && h.proximo ? <TextWidget text={`🔔 ${h.proximo}`} style={{ fontSize: 12, color: c(p.text) }} maxLines={1} truncate="END" /> : null}
      {h.habitos.length && t.colunas >= 3 ? (
        <FlexWidget style={{ flexDirection: 'row', flexGap: 6, width: 'match_parent' }}>
          {h.habitos.slice(0, t.colunas >= 4 ? 4 : 2).map((x) => (
            <FlexWidget key={x.id} style={{ flex: 1, height: 28, borderRadius: 14, backgroundColor: c(x.feito ? p.primary : p.primarySoft), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}
              clickAction="HABITO" clickActionData={{ id: x.id, feito: x.feito ? '1' : '' }} accessibilityLabel={`${x.nome}${x.feito ? ', feito' : ''}`}>
              <TextWidget text={x.feito ? `✓ ${x.nome}` : x.nome} style={{ fontSize: 11, fontWeight: '600', color: c(x.feito ? p.onPrimary : p.primary) }} maxLines={1} truncate="END" />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}
      <Aviso p={p} texto={h.aviso} />
    </FlexWidget>
  );
}

// ── 7. Listas ────────────────────────────────────────────────────────────────────────────
export type ListasWidget = { online: boolean; listaId?: string; nome?: string; itens: { id: string; texto: string }[]; aviso?: string };

export function WidgetListas({ p, t, l, chave }: { p: Palette; t: Tamanho; l: ListasWidget; chave: string }) {
  const abrir = { clickAction: 'OPEN_URI', clickActionData: { uri: 'elysium://inicio' } };
  const pend = l.online ? `${l.itens.length} pendente${l.itens.length === 1 ? '' : 's'}` : 'PC desligado';
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'column', justifyContent: 'center', paddingHorizontal: 12 }} {...abrir}>
        <TextWidget text={l.nome ?? 'Listas'} style={{ fontSize: 13, fontWeight: 'bold', color: c(p.text) }} maxLines={1} truncate="END" />
        <TextWidget text={t.colunas >= 4 && l.itens.length ? l.itens.slice(0, 3).map((x) => x.texto).join(' · ') : pend} style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={1} truncate="END" />
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 3 }}>
      <Topo p={p} titulo={l.nome ?? 'Listas'} direita={pend} chave={chave} uri="elysium://inicio" />
      {l.online && !l.itens.length ? <TextWidget text="Nada pendente. Diga “põe leite na lista”." style={{ fontSize: 11, color: c(p.textMuted) }} maxLines={2} /> : null}
      {l.itens.slice(0, t.linhas >= 3 ? 6 : 3).map((x) => (
        <FlexWidget key={x.id} style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8, width: 'match_parent', paddingVertical: 3 }}
          clickAction="ITEM" clickActionData={{ lista: l.listaId ?? '', item: x.id }} accessibilityLabel={`Marcar ${x.texto}`}>
          <FlexWidget style={{ width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: c(p.primary) }} />
          <TextWidget text={x.texto} style={{ fontSize: 13, color: c(p.text) }} maxLines={1} truncate="END" />
        </FlexWidget>
      ))}
      <Aviso p={p} texto={l.aviso} />
    </FlexWidget>
  );
}

// ── 8. Rotinas ───────────────────────────────────────────────────────────────────────────
export type RotinasWidget = { online: boolean; proxima?: { nome: string; quando: string }; ultima?: { nome: string; resultado: string; quando: string }; total: number; quando: string };

export function WidgetRotinas({ p, t, r, chave }: { p: Palette; t: Tamanho; r: RotinasWidget; chave: string }) {
  const abrir = { clickAction: 'OPEN_URI', clickActionData: { uri: 'elysium://rotinas' } };
  const prox = r.proxima ? `${r.proxima.nome} · ${r.proxima.quando}` : r.online ? 'Nenhuma rotina por hora' : 'PC desligado';
  if (t.linhas === 1) {
    return (
      <FlexWidget style={{ ...cartao(p), flexDirection: 'column', justifyContent: 'center', paddingHorizontal: 12 }} {...abrir} accessibilityLabel="Rotinas">
        <TextWidget text={t.colunas >= 4 ? 'Próxima rotina' : 'Rotina'} style={{ fontSize: 10, color: c(p.textMuted) }} />
        <TextWidget text={prox} style={{ fontSize: 13, fontWeight: 'bold', color: c(r.proxima ? p.primary : p.textMuted) }} maxLines={1} truncate="END" />
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={{ ...cartao(p), flexDirection: 'column', padding: pad(t), flexGap: 6 }}>
      <Topo p={p} titulo="Rotinas" direita={r.online ? `${r.total} ativa${r.total === 1 ? '' : 's'}` : undefined} chave={chave} uri="elysium://rotinas" />
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }} {...abrir}>
        <TextWidget text="PRÓXIMA" style={{ fontSize: 9, color: c(p.textMuted), letterSpacing: 0.5 }} />
        <TextWidget text={prox} style={{ fontSize: 13, color: c(r.proxima ? p.primary : p.textMuted), fontWeight: '600' }} maxLines={1} truncate="END" />
      </FlexWidget>
      {r.ultima ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }} {...abrir}>
          <TextWidget text={`ÚLTIMA · ${r.ultima.nome} · ${r.ultima.quando}`} style={{ fontSize: 9, color: c(p.textMuted), letterSpacing: 0.5 }} maxLines={1} truncate="END" />
          <TextWidget text={r.ultima.resultado} style={{ fontSize: 11, color: c(p.text) }} maxLines={t.linhas >= 3 ? 4 : 2} truncate="END" />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
