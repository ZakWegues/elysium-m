import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeOutUp, interpolate, ReduceMotion, type SharedValue, useAnimatedStyle,
  useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { Text } from './ui';

/**
 * A animação de falar com a Ely (08/10): ao tocar no microfone, um núcleo de luz nasce com
 * mola acima do campo, com uma onda de choque, três anéis que saem dele no ritmo da voz e
 * barras que pulam com o volume. Pensando: os anéis param, o anel tracejado gira rápido e o
 * núcleo respira. Ao soltar, ela sobe e some — o pedido "foi". Com redução de movimento no
 * aparelho, tudo vira um fade simples (`ReduceMotion.System`).
 *
 * `nivel` é 0–1, alimentado pelo medidor do gravador a cada ~70 ms (ChatScreen).
 */
export type FaseVoz = 'ouvindo' | 'pensando';

const TAM = 132;

export function VozAoVivo({ fase, nivel, acima = 86 }: { fase: FaseVoz | null; nivel: SharedValue<number>; /** Distância do pé da tela (acima do campo de texto). */ acima?: number }) {
  if (!fase) return null;
  return (
    <Animated.View
      pointerEvents="none"
      entering={ZoomIn.springify().damping(13).stiffness(170).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(260).reduceMotion(ReduceMotion.System)}
      style={[styles.caixa, { bottom: acima }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={fase === 'ouvindo' ? 'Ouvindo' : 'Pensando'}
    >
      <Orbe fase={fase} nivel={nivel} />
      <Rotulo fase={fase} />
    </Animated.View>
  );
}

function Orbe({ fase, nivel }: { fase: FaseVoz; nivel: SharedValue<number> }) {
  const { palette } = useTheme();
  const ouvindo = fase === 'ouvindo';

  // Onda de choque: uma vez, no nascimento.
  const choque = useSharedValue(0);
  useEffect(() => {
    choque.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [choque]);
  const estChoque = useAnimatedStyle(() => ({
    opacity: interpolate(choque.value, [0, 1], [0.7, 0]),
    transform: [{ scale: interpolate(choque.value, [0, 1], [0.4, 2.6]) }],
  }));

  // Giro do anel tracejado: devagar ouvindo, rápido pensando.
  const giro = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(giro);
    giro.value = withRepeat(withTiming(giro.value + 360, { duration: ouvindo ? 5000 : 1300, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    return () => cancelAnimation(giro);
  }, [ouvindo, giro]);
  const estGiro = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value}deg` }] }));

  // Núcleo: segue a voz ouvindo; respira pensando.
  const respira = useSharedValue(0);
  useEffect(() => {
    respira.value = ouvindo ? withTiming(0) : withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
  }, [ouvindo, respira]);
  const estNucleo = useAnimatedStyle(() => {
    const alvo = ouvindo ? 1 + nivel.value * 0.42 : 1 + respira.value * 0.12;
    return { transform: [{ scale: withSpring(alvo, { damping: 12, stiffness: 220, reduceMotion: ReduceMotion.System }) }] };
  });
  const estBrilho = useAnimatedStyle(() => ({ opacity: ouvindo ? 0.35 + nivel.value * 0.55 : 0.3 + respira.value * 0.3 }));

  return (
    <View style={{ width: TAM, height: TAM, alignItems: 'center', justifyContent: 'center' }}>
      {/* brilho difuso por trás */}
      <Animated.View style={[StyleSheet.absoluteFill, estBrilho]}>
        <Svg width={TAM} height={TAM}>
          <Defs>
            <RadialGradient id="brilho" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={palette.primary} stopOpacity={0.55} />
              <Stop offset="1" stopColor={palette.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={TAM / 2} cy={TAM / 2} r={TAM / 2} fill="url(#brilho)" />
        </Svg>
      </Animated.View>
      {ouvindo && [0, 1, 2].map(i => <Anel key={i} atraso={i * 600} nivel={nivel} cor={palette.primary} />)}
      <Animated.View style={[styles.choque, { borderColor: palette.primary }, estChoque]} />
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, estGiro]}>
        <Svg width={84} height={84}>
          <Circle cx={42} cy={42} r={40} stroke={palette.primary} strokeOpacity={0.7} strokeWidth={1.4} strokeDasharray="5 7" fill="none" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.nucleo, { backgroundColor: palette.primary, shadowColor: palette.primary }, estNucleo]}>
        <Barras nivel={nivel} ouvindo={ouvindo} cor={palette.onPrimary} />
      </Animated.View>
    </View>
  );
}

/** Anel que sai do núcleo e some; a voz alta empurra ele mais longe. */
function Anel({ atraso, nivel, cor }: { atraso: number; nivel: SharedValue<number>; cor: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(atraso, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false));
    return () => cancelAnimation(t);
  }, [atraso, t]);
  const est = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.9, 1.9 + nivel.value * 0.9]) }],
  }));
  return <Animated.View style={[styles.anel, { borderColor: cor }, est]} />;
}

const OFFSETS = [0.55, 0.85, 1, 0.8, 0.6];

/** Cinco barras no núcleo, pulando com o volume (ouvindo) ou em onda lenta (pensando). */
function Barras({ nivel, ouvindo, cor }: { nivel: SharedValue<number>; ouvindo: boolean; cor: string }) {
  return (
    <View style={styles.barras}>
      {OFFSETS.map((o, i) => <Barra key={i} i={i} o={o} nivel={nivel} ouvindo={ouvindo} cor={cor} />)}
    </View>
  );
}

function Barra({ i, o, nivel, ouvindo, cor }: { i: number; o: number; nivel: SharedValue<number>; ouvindo: boolean; cor: string }) {
  const onda = useSharedValue(0);
  useEffect(() => {
    onda.value = withDelay(i * 110, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 420 })), -1, false));
    return () => cancelAnimation(onda);
  }, [i, onda]);
  const est = useAnimatedStyle(() => {
    const h = ouvindo ? 5 + Math.min(1, nivel.value * o * 1.6 + onda.value * 0.08) * 20 : 5 + onda.value * 7;
    return { height: withSpring(h, { damping: 14, stiffness: 300, reduceMotion: ReduceMotion.System }) };
  });
  return <Animated.View style={[styles.barra, { backgroundColor: cor }, est]} />;
}

function Rotulo({ fase }: { fase: FaseVoz }) {
  const { palette } = useTheme();
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    setSeg(0);
    if (fase !== 'ouvindo') return;
    const t = setInterval(() => setSeg(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [fase]);
  return (
    <Text variant="caption" color={palette.primary} style={{ marginTop: -6, letterSpacing: 1.6, fontWeight: '600' }}>
      {fase === 'ouvindo' ? `OUVINDO · ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : 'PENSANDO…'}
    </Text>
  );
}

const styles = StyleSheet.create({
  caixa: { position: 'absolute', alignSelf: 'center', alignItems: 'center', zIndex: 20 },
  nucleo: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  anel: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 1.5 },
  choque: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2.5 },
  barras: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 26 },
  barra: { width: 3.5, borderRadius: 2 },
});
