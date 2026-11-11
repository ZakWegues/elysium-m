import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { pausaFundo, pausaToque, reduzirUI, relogioFundo } from '../../lib/motion';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';
import { PAPEIS, type PapelId } from '../../theme/fundo';
import { useFala } from '../../lib/falar';
import { estadoDaBolota, useFaseDaBolota } from '../../lib/bolota';
import { ManchasSkia, TEM_SKIA } from '../vidro/ManchasSkia';

/**
 * Fundo do app — fase 23.1: PORTE CAMADA A CAMADA do `css/fundo.css` do desktop.
 *
 * O Zak: "o desktop ainda tá bizarramente melhor que o mobile… plano de fundo, animações e
 * muito mais devem ser compartilhados igualmente". A versão anterior inventava um fundo
 * próprio: manchas nas cores PRIMÁRIA e DE ACENTO (fortes — no Stark viravam bolhas laranja)
 * feitas de sete círculos empilhados, que aparecem como ANÉIS. Agora é o mesmo desenho do PC:
 *
 *   · manchas: as cinco `.lg-blob` do PC, com as cores `blobs` do tema (as mesmas do
 *     `THEMES` do desktop), opacidades e ciclos de deriva/respiração iguais. Cada mancha é um
 *     gradiente radial de SVG — queda suave de verdade, sem anel;
 *   · aurora: os dois discos girando em sentidos opostos (90 s e 130 s);
 *   · feixes de luz (só ELYSIUM): três faixas diagonais pulsando;
 *   · traços finos (três linhas de 1 px) e poeira (oito pontos);
 *   · Stark: sem manchas — grade técnica de 46 px com a varredura descendo (11 s);
 *   · 30/10: Glass usa as mesmas camadas com manchas mais fortes; e o fundo pode ser um
 *     papel de parede colorido ou uma imagem da galeria (`fundo` do tema);
 *   · "vivo" (ouvindo/pensando/falando): a aurora acende, como o `body.vivo` do PC.
 *
 * Os tamanhos do PC são para uma janela de ~1024 px; aqui escalam pela largura da tela.
 * Tudo é transform/opacidade de views já desenhadas (compositor) e para com "reduzir
 * movimento" (`ReduceMotion.System`). `pointerEvents="none"` em tudo.
 */

/**
 * 10/11: tudo no fundo anda pelo `relogioFundo` (um relógio só, a 30 quadros por segundo), que
 * para durante a troca de tela, enquanto você toca/rola e com "reduzir movimento". Antes cada peça
 * tinha o seu `withRepeat`, que nunca parava. Chamado uma vez, no AppBackground.
 */
function useRelogioDoFundo() {
  const acumulado = useSharedValue(0);
  useFrameCallback((f) => {
    if (pausaFundo.value || pausaToque.value || reduzirUI.value) return;
    acumulado.value += (f.timeSincePreviousFrame ?? 16) / 1000;
    if (acumulado.value < 1 / 30) return;
    relogioFundo.value += acumulado.value;
    acumulado.value = 0;
  });
}

/** Valor 0 → 1 → 0 para sempre, com a curva seno do `ease-in-out` alternado do CSS. */
function useVaiVem(ms: number, atrasoMs = 0) {
  return useDerivedValue(() => 0.5 - 0.5 * Math.cos((Math.PI * Math.max(0, relogioFundo.value * 1000 - atrasoMs)) / ms));
}

/** Uma `.lg-blob`: disco com queda radial (o `filter: blur(36px)` do PC), deriva e respiração. */
function Mancha({ id, cor, lado, pos, opac, deriva, respira }: {
  id: string; cor: string; lado: number;
  pos: { top?: number | `${number}%`; left?: number | `${number}%`; right?: number | `${number}%`; bottom?: number | `${number}%` };
  /** Opacidade de/até da respiração (`lg-respira-N`). */
  opac: [number, number];
  /** Deriva do `lg-drift-N`: até onde vai (px, já escalado), escala final e período. */
  deriva: { dx: number; dy: number; escala: number; ms: number };
  respira: number;
}) {
  const d = useVaiVem(deriva.ms);
  const r = useVaiVem(respira, 700);
  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: d.value * deriva.dx }, { translateY: d.value * deriva.dy }, { scale: 1 + (deriva.escala - 1) * d.value }],
    opacity: opac[0] + (opac[1] - opac[0]) * r.value,
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: lado, height: lado }, pos, estilo]}>
      <Svg width={lado} height={lado}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={cor} stopOpacity={1} />
            <Stop offset="0.45" stopColor={cor} stopOpacity={0.85} />
            <Stop offset="0.75" stopColor={cor} stopOpacity={0.32} />
            <Stop offset="1" stopColor={cor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={lado} height={lado} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** As cinco manchas do `fundo.css`, nas posições e ritmos de lá (escala `k` pela largura). */
function Manchas({ blobs, k, forca = 1 }: { blobs: readonly [string, string, string]; k: number; forca?: number }) {
  const o = (a: number, b: number): [number, number] => [Math.min(1, a * forca), Math.min(1, b * forca)];
  return (
    <>
      <Mancha id="b1" cor={blobs[0]} lado={620 * k} pos={{ top: -230 * k, right: -170 * k }} opac={o(0.5, 0.66)} respira={11_000} deriva={{ dx: 120 * k, dy: 80 * k, escala: 1.14, ms: 16_000 }} />
      <Mancha id="b2" cor={blobs[1]} lado={640 * k} pos={{ bottom: -280 * k, left: -190 * k }} opac={o(0.55, 0.38)} respira={13_000} deriva={{ dx: -110 * k, dy: -130 * k, escala: 1.1, ms: 20_000 }} />
      <Mancha id="b3" cor={blobs[2]} lado={400 * k} pos={{ top: '46%', left: '48%' }} opac={o(0.4, 0.58)} respira={9_000} deriva={{ dx: -90 * k, dy: 110 * k, escala: 0.88, ms: 14_000 }} />
      <Mancha id="b4" cor={blobs[1]} lado={300 * k} pos={{ top: '8%', left: '14%' }} opac={o(0.26, 0.42)} respira={15_000} deriva={{ dx: 150 * k, dy: -70 * k, escala: 1.2, ms: 24_000 }} />
      <Mancha id="b5" cor={blobs[0]} lado={340 * k} pos={{ bottom: '6%', right: '18%' }} opac={o(0.22, 0.36)} respira={17_000} deriva={{ dx: -130 * k, dy: -90 * k, escala: 1.12, ms: 22_000 }} />
    </>
  );
}

/**
 * A aurora do PC: dois discos com faixas nas cores das manchas, girando em sentidos opostos.
 * O PC usa `conic-gradient` com `blur(60px)`; aqui faixas lineares bem suaves girando dão a
 * mesma luz que varre. `vivo` acende (0,16 → 0,30, como o `body.vivo .aurora`).
 */
function Aurora({ cores, base, vivo, lado }: { cores: readonly [string, string, string]; base: number; vivo: boolean; lado: number }) {
  const luz = useSharedValue(base);
  // Uma volta em 90 s e outra em 130 s, no sentido contrário, pelo relógio do fundo.
  const a1 = useDerivedValue(() => (relogioFundo.value * 4) % 360);
  const a2 = useDerivedValue(() => -((relogioFundo.value * 360) / 130) % 360);
  useEffect(() => { luz.value = withTiming(vivo ? base * 1.9 : base, { duration: 1200 }); }, [vivo, base, luz]);
  const e1 = useAnimatedStyle(() => ({ opacity: luz.value, transform: [{ rotate: `${a1.value}deg` }] }));
  const e2 = useAnimatedStyle(() => ({ opacity: luz.value * 0.62, transform: [{ rotate: `${a2.value}deg` }] }));
  const disco = { position: 'absolute' as const, width: lado, height: lado, borderRadius: lado / 2, top: '50%' as const, left: '50%' as const, marginTop: -lado / 2, marginLeft: -lado / 2, overflow: 'hidden' as const };
  const faixas = (
    <LinearGradient
      colors={['transparent', cores[0], 'transparent', cores[1], 'transparent', cores[2], 'transparent']}
      locations={[0, 0.17, 0.33, 0.55, 0.72, 0.89, 1]}
      start={{ x: 0, y: 0.3 }} end={{ x: 1, y: 0.7 }}
      style={StyleSheet.absoluteFill}
    />
  );
  return (
    <>
      <Animated.View pointerEvents="none" style={[disco, e1]}>{faixas}</Animated.View>
      <Animated.View pointerEvents="none" style={[disco, e2]}>{faixas}</Animated.View>
    </>
  );
}

/** Um `.ely-shaft`: faixa diagonal de luz, deslizando e pulsando (0,06 ↔ 0,12). */
function Feixe({ cor, left, largura, de, ate, ms, pulso, fraco, altura }: {
  cor: string; left: `${number}%`; largura: `${number}%`; de: number; ate: number; ms: number; pulso: number; fraco?: boolean; altura: number;
}) {
  const d = useVaiVem(ms);
  const p = useVaiVem(pulso, fraco ? 6000 : 0);
  const [o0, o1] = fraco ? [0.04, 0.08] : [0.06, 0.12];
  const estilo = useAnimatedStyle(() => ({
    opacity: o0 + (o1 - o0) * p.value,
    transform: [{ translateX: de + (ate - de) * d.value }, { rotate: '14deg' }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -altura * 0.3, height: altura * 1.6, left, width: largura }, estilo]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={`feixe${left.replace("%", "")}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={cor} stopOpacity={1} />
            <Stop offset="0.6" stopColor={cor} stopOpacity={0.45} />
            <Stop offset="1" stopColor={cor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#feixe${left.replace("%", "")})`} />
      </Svg>
    </Animated.View>
  );
}

/** Os três `.bg-traco`: linhas de 1 px inclinadas, quase invisíveis, deslizando bem devagar. */
function Tracos({ cor, cor2, altura }: { cor: string; cor2: string; altura: number }) {
  const linhas = [
    { left: '22%' as const, rot: '9deg', de: -40, ate: 60, ms: 68_000, c: cor },
    { left: '54%' as const, rot: '-7deg', de: 50, ate: -70, ms: 84_000, c: cor2 },
    { left: '81%' as const, rot: '5deg', de: 30, ate: -50, ms: 76_000, c: cor },
  ];
  return <>{linhas.map((l) => <Traco key={l.left} {...l} altura={altura} />)}</>;
}
function Traco({ left, rot, de, ate, ms, c, altura }: { left: `${number}%`; rot: string; de: number; ate: number; ms: number; c: string; altura: number }) {
  const t = useVaiVem(ms);
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateX: de + (ate - de) * t.value }, { rotate: rot }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -altura * 0.2, height: altura * 1.4, width: 1, left, opacity: 0.09 }, estilo]}>
      <LinearGradient colors={['transparent', c, 'transparent']} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** `#bg-poeira`: oito pontos de 2 px, cada um no seu ritmo (posições fixas, não sorteadas). */
const POEIRA = [
  { x: '12%', y: '18%', d: 46_000, a: 0.22 }, { x: '34%', y: '72%', d: 58_000, a: 0.18 },
  { x: '58%', y: '24%', d: 52_000, a: 0.26 }, { x: '82%', y: '58%', d: 64_000, a: 0.2 },
  { x: '24%', y: '44%', d: 40_000, a: 0.16 }, { x: '70%', y: '84%', d: 56_000, a: 0.22 },
  { x: '46%', y: '9%', d: 48_000, a: 0.18 }, { x: '90%', y: '30%', d: 60_000, a: 0.24 },
] as const;
function Grao({ x, y, d, a, cor }: { x: string; y: string; d: number; a: number; cor: string }) {
  const t = useVaiVem(d);
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 26 }, { translateY: t.value * -34 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x as `${number}%`, top: y as `${number}%`, width: 2, height: 2, borderRadius: 1, backgroundColor: cor, opacity: a }, estilo]} />;
}
function Poeira({ cor }: { cor: string }) {
  return <>{POEIRA.map((p) => <Grao key={p.x + p.y} {...p} cor={cor} />)}</>;
}

/**
 * Stark: a grade técnica de 46 px do `stark.css`, que some para as bordas (a máscara radial
 * de lá vira um véu radial da cor do fundo por cima), e a varredura — uma faixa de 140 px
 * descendo a tela a cada 11 s (4 s com a Ely viva).
 */
function GradeStark({ cor, fundo, largura, altura, vivo }: { cor: string; fundo: string; largura: number; altura: number; vivo: boolean }) {
  const passo = 46;
  const verticais = useMemo(() => Array.from({ length: Math.ceil(largura / passo) + 1 }, (_, i) => i * passo), [largura]);
  const horizontais = useMemo(() => Array.from({ length: Math.ceil(altura / passo) + 1 }, (_, i) => i * passo), [altura]);
  // A faixa desce a tela inteira a cada 11 s (4 s com a Ely viva), pelo relógio do fundo.
  const y = useDerivedValue(() => {
    const ms = vivo ? 4000 : 11_000;
    return -160 + (((relogioFundo.value * 1000) % ms) / ms) * (altura * 1.2 + 160);
  });
  const varre = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <>
      <Svg width={largura} height={altura} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="mascaraGrade" cx="50%" cy="35%" rx="70%" ry="60%">
            <Stop offset="0.3" stopColor={fundo} stopOpacity={0} />
            <Stop offset="1" stopColor={fundo} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        {verticais.map((x) => <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={altura} stroke={cor} strokeOpacity={0.06} strokeWidth={1} />)}
        {horizontais.map((h) => <Line key={`h${h}`} x1={0} y1={h} x2={largura} y2={h} stroke={cor} strokeOpacity={0.06} strokeWidth={1} />)}
        <Rect width={largura} height={altura} fill="url(#mascaraGrade)" />
      </Svg>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 140 }, varre]}>
        <LinearGradient colors={['transparent', cor, 'transparent']} style={[StyleSheet.absoluteFill, { opacity: 0.07 }]} />
      </Animated.View>
    </>
  );
}

/** A Ely está ouvindo, pensando ou falando — o `body.vivo` do PC. */
function useVivo(): boolean {
  const fala = useFala();
  return estadoDaBolota(useFaseDaBolota(), fala.falando) !== 'dormindo';
}

/**
 * 30/10: papéis de parede próprios, para quem quer cor atrás do vidro. Pedido do Zak: "mais
 * informação e mais cores para quando eu passe a parte de liquid glass". São estáticos (um
 * SVG só, nada por quadro): várias manchas de cor fortes se sobrepondo, como uma malha.
 */

/** Posição (fração da tela) e raio (fração da largura) de cada mancha do papel. */
const MALHA = [
  { x: 0.1, y: 0.08, r: 0.9 }, { x: 0.95, y: 0.22, r: 0.8 }, { x: 0.3, y: 0.52, r: 0.75 },
  { x: 0.9, y: 0.7, r: 0.85 }, { x: 0.15, y: 0.92, r: 0.8 }, { x: 0.6, y: 0.35, r: 0.55 },
] as const;

export function PapelDeParede({ id, largura, altura }: { id: PapelId; largura: number; altura: number }) {
  const p = PAPEIS[id];
  return (
    <Svg width={largura} height={altura} style={StyleSheet.absoluteFill}>
      <Defs>
        {MALHA.map((m, i) => (
          <RadialGradient key={i} id={`papel${i}`} cx={m.x * largura} cy={m.y * altura} r={m.r * largura} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={p.cores[i]} stopOpacity={0.95} />
            <Stop offset="0.55" stopColor={p.cores[i]} stopOpacity={0.4} />
            <Stop offset="1" stopColor={p.cores[i]} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <Rect width={largura} height={altura} fill={p.base} />
      {MALHA.map((_, i) => <Rect key={i} width={largura} height={altura} fill={`url(#papel${i})`} />)}
    </Svg>
  );
}

export function AppBackground() {
  useRelogioDoFundo();
  const { palette, familiaResolvida, fundo } = useTheme();
  const { width, height } = useWindowDimensions();
  const vivo = useVivo();
  // O PC desenha para uma janela de ~1024 px; aqui tudo escala pela largura da tela.
  const k = Math.max(0.42, Math.min(1, width / 1024)) * 1.25;
  const lado = Math.max(width, height) * 1.4;

  // Fundo escolhido pelo Zak: papel colorido ou uma imagem da galeria, com um véu escuro leve
  // para o texto continuar lendo. A poeira continua por cima.
  if (fundo.tipo !== 'animado') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, overflow: 'hidden' }]} pointerEvents="none">
        {fundo.tipo === 'papel'
          ? <PapelDeParede id={fundo.id} largura={width} altura={height} />
          : <Image source={{ uri: fundo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />
        <Poeira cor="#ffffff" />
      </View>
    );
  }

  const stark = familiaResolvida === 'stark';
  const vidro = familiaResolvida === 'glass';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, overflow: 'hidden' }]} pointerEvents="none">
      <Aurora cores={palette.blobs} base={vidro ? 0.18 : stark ? 0.16 : 0.1} vivo={vivo} lado={lado} />
      {stark
        ? <GradeStark cor={palette.primary} fundo={palette.background} largura={width} altura={height} vivo={vivo} />
        // Glass: manchas mais fortes — o vidro precisa de cor atrás para parecer vidro.
        // 31/10: no Android com Skia, as mesmas manchas num shader (a barra de abas usa a mesma função).
        : TEM_SKIA ? <ManchasSkia blobs={palette.blobs} forca={vidro ? 1.5 : 1} /> : <Manchas blobs={palette.blobs} k={k} forca={vidro ? 1.5 : 1} />}
      {familiaResolvida === 'dark' && (
        <>
          <Feixe cor={palette.primary} left="6%" largura="42%" de={-40 * k} ate={150 * k} ms={24_000} pulso={9_000} altura={height} />
          <Feixe cor={palette.primary} left="56%" largura="42%" de={40 * k} ate={-170 * k} ms={30_000} pulso={12_000} altura={height} />
          <Feixe cor={palette.primary} left="44%" largura="26%" de={90 * k} ate={-90 * k} ms={36_000} pulso={15_000} fraco altura={height} />
        </>
      )}
      <Tracos cor={palette.primary} cor2={palette.accent} altura={height} />
      <Poeira cor={palette.primary} />
    </View>
  );
}
