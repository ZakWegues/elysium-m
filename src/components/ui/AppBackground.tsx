import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';
import { useFala } from '../../lib/falar';
import { estadoDaBolota, useFaseDaBolota } from '../../lib/bolota';

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
 *   · 29/10, design novo: Dark é o preto OLED puro, sem nada; Glass é a cena índigo do
 *     `glass.css` com quatro orbes derivando devagar (19–31 s);
 *   · "vivo" (ouvindo/pensando/falando): a aurora acende, como o `body.vivo` do PC.
 *
 * Os tamanhos do PC são para uma janela de ~1024 px; aqui escalam pela largura da tela.
 * Tudo é transform/opacidade de views já desenhadas (compositor) e para com "reduzir
 * movimento" (`ReduceMotion.System`). `pointerEvents="none"` em tudo.
 */

const DUR = (ms: number) => ({ duration: ms, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System });

/** Valor 0 → 1 → 0 para sempre (o `alternate` do CSS). */
function useVaiVem(ms: number, atrasoMs = 0) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(atrasoMs, withRepeat(withTiming(1, DUR(ms)), -1, true));
    return () => cancelAnimation(t);
  }, [ms, atrasoMs, t]);
  return t;
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

/**
 * A aurora do PC: dois discos com faixas nas cores das manchas, girando em sentidos opostos.
 * O PC usa `conic-gradient` com `blur(60px)`; aqui faixas lineares bem suaves girando dão a
 * mesma luz que varre. `vivo` acende (0,16 → 0,30, como o `body.vivo .aurora`).
 */
function Aurora({ cores, base, vivo, lado }: { cores: readonly [string, string, string]; base: number; vivo: boolean; lado: number }) {
  const a1 = useSharedValue(0), a2 = useSharedValue(0), luz = useSharedValue(base);
  useEffect(() => {
    a1.value = withRepeat(withTiming(360, { duration: 90_000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    a2.value = withRepeat(withTiming(-360, { duration: 130_000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    return () => { cancelAnimation(a1); cancelAnimation(a2); };
  }, [a1, a2]);
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
  const y = useSharedValue(-160);
  useEffect(() => {
    y.value = -160;
    y.value = withRepeat(withTiming(altura * 1.2, { duration: vivo ? 4000 : 11_000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    return () => cancelAnimation(y);
  }, [vivo, altura, y]);
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

/**
 * A cena da Glass (`.lg-app` + `.lg-orb`): gradiente #0b0930 → #05041a e quatro orbes de
 * gradiente radial — violeta, turquesa, rosa e âmbar — no `lg-drift` (de −26,14 a 34,−38
 * com escala 1,14; 19, 24 e 31 s). O vidro precisa de cor atrás para parecer vidro.
 */
function CenaGlass({ largura, vivo }: { largura: number; vivo: boolean }) {
  const k = largura / 390;
  const drift = (ms: number, inverso = false) => ({ dx: (inverso ? -60 : 60) * k, dy: (inverso ? 52 : -52) * k, escala: 1.14, ms });
  const base: [number, number] = vivo ? [0.62, 0.8] : [0.5, 0.62];
  return (
    <>
      <LinearGradient colors={['#0b0930', '#05041a']} style={StyleSheet.absoluteFill} />
      <Mancha id="o1" cor="#705cff" lado={380 * k} pos={{ top: -60 * k, left: -150 * k }} opac={[base[0] * 0.8, base[1] * 0.8]} respira={13_000} deriva={drift(19_000)} />
      <Mancha id="o2" cor="#19d3c5" lado={300 * k} pos={{ top: '30%', right: -120 * k }} opac={[base[0] * 0.8, base[1] * 0.8]} respira={15_000} deriva={drift(24_000, true)} />
      <Mancha id="o3" cor="#ff4fa3" lado={320 * k} pos={{ bottom: '8%', left: -90 * k }} opac={[base[0] * 0.75, base[1] * 0.75]} respira={17_000} deriva={drift(31_000)} />
      <Mancha id="o4" cor="#ffb86b" lado={220 * k} pos={{ bottom: -60 * k, right: -40 * k }} opac={[base[0] * 0.6, base[1] * 0.6]} respira={11_000} deriva={drift(24_000)} />
    </>
  );
}

/** A Ely está ouvindo, pensando ou falando — o `body.vivo` do PC. */
function useVivo(): boolean {
  const fala = useFala();
  return estadoDaBolota(useFaseDaBolota(), fala.falando) !== 'dormindo';
}

export function AppBackground() {
  const { palette, familiaResolvida } = useTheme();
  const { width, height } = useWindowDimensions();
  const vivo = useVivo();
  const lado = Math.max(width, height) * 1.4;

  // Dark (29/10): preto OLED, sem nada por cima — superfícies chapadas fazem o resto.
  if (familiaResolvida === 'dark') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]} pointerEvents="none" />;
  }

  if (familiaResolvida === 'glass') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, overflow: 'hidden' }]} pointerEvents="none">
        <CenaGlass largura={width} vivo={vivo} />
      </View>
    );
  }

  // Stark.
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, overflow: 'hidden' }]} pointerEvents="none">
      <Aurora cores={palette.blobs} base={0.16} vivo={vivo} lado={lado} />
      <GradeStark cor={palette.primary} fundo={palette.background} largura={width} altura={height} vivo={vivo} />
      <Tracos cor={palette.primary} cor2={palette.accent} altura={height} />
      <Poeira cor={palette.primary} />
    </View>
  );
}
