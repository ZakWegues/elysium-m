import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming, ZoomIn, ZoomOut,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Text } from './ui';
import { pararDeFalar, pausarFala, retomarFala, useFala } from '../lib/falar';
import { haptica } from '../lib/haptica';
import {
  envelopeDoTrecho, estadoDaBolota, EstadoBolota, gravarPosicaoDaBolota, lerPosicaoDaBolota,
  nivelDaBolota, palavrasDoTrecho, prenderNaTela, useFaseDaBolota,
} from '../lib/bolota';

/**
 * A bolota Stark do celular (fase 21, bloco 215) — a mesma do PC, dentro do app, por cima de
 * todas as abas. Substitui a pílula "Ely falando": a pílula virou o estado ABERTO da bolota.
 *
 *  - dormindo: roxo discreto, respirando devagar; um toque começa a ouvir (como o widget Falar);
 *  - ouvindo: ciano, o núcleo segue o microfone;
 *  - pensando: âmbar, anel girando rápido;
 *  - falando: roxo, pulso palavra por palavra (pelo texto — o celular toca o MP3 do PC e não mede
 *    volume); um toque abre Pausar ⇄ Retomar e Parar, que recolhem sozinhos em 5 s.
 *
 * Arrasta para qualquer canto; a posição fica guardada. Com redução de movimento no aparelho,
 * sem giro nem respiração.
 */

const TAM = 64;
const RECOLHER_MS = 5000;
const CORES: Record<EstadoBolota, string> = { dormindo: '#8f6fd0', ouvindo: '#4ecdc4', pensando: '#f0b240', falando: '#9670d6' };

export function Bolota({ onFalar }: { onFalar: () => void }) {
  const fala = useFala();
  const faseVoz = useFaseDaBolota();
  const estado = estadoDaBolota(faseVoz, fala.falando);
  const cor = CORES[estado];
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tela = { largura: width, altura: height, topo: insets.top, base: insets.bottom + 72 };
  const [aberta, setAberta] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Posição: canto inferior direito, acima da barra de abas, até ele arrastar.
  const x = useSharedValue(width - TAM - 12);
  const y = useSharedValue(height - insets.bottom - TAM - 96);
  const inicio = useSharedValue({ x: 0, y: 0 });
  // Para que lado o painel abre — guardado em JS (ler `x.value` no render faz o Reanimated reclamar).
  const [lado, setLado] = useState({ direita: true, embaixo: true });
  const marcarLado = (px: number, py: number) => setLado({ direita: px > width / 2, embaixo: py > height / 2 });
  useEffect(() => {
    void lerPosicaoDaBolota().then((p) => {
      if (!p) return;
      const presa = prenderNaTela(p.x, p.y, TAM, tela);
      x.value = presa.x; y.value = presa.y;
      marcarLado(presa.x, presa.y);
    });
  }, []);

  const soltar = (nx: number, ny: number) => {
    const presa = prenderNaTela(nx, ny, TAM, tela);
    x.value = withSpring(presa.x, { damping: 16, stiffness: 180 });
    y.value = withSpring(presa.y, { damping: 16, stiffness: 180 });
    gravarPosicaoDaBolota(presa.x, presa.y);
    marcarLado(presa.x, presa.y);
  };

  const tocar = () => {
    haptica.leve();
    if (fala.falando) { setAberta((a) => !a); adiarRecolher(); return; }
    if (estado === 'dormindo') onFalar();
  };

  const arrasto = Gesture.Pan()
    .minDistance(6)
    .onStart(() => { inicio.value = { x: x.value, y: y.value }; })
    .onUpdate((e) => { x.value = inicio.value.x + e.translationX; y.value = inicio.value.y + e.translationY; })
    .onEnd(() => { runOnJS(soltar)(x.value, y.value); });
  const toque = Gesture.Tap().maxDuration(400).onEnd((_e, ok) => { if (ok) runOnJS(tocar)(); });
  const gestos = Gesture.Exclusive(arrasto, toque);

  const adiarRecolher = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberta(false), RECOLHER_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!fala.falando) setAberta(false); }, [fala.falando]);

  // Pulso da fala: o envelope do trecho, tocado em JS a cada 50 ms (barato: um número só).
  const pulso = useSharedValue(0);
  useEffect(() => {
    if (!fala.falando || fala.pausada || !fala.trecho) { pulso.value = withTiming(0, { duration: 200 }); return; }
    const { palavras, durMs } = palavrasDoTrecho(fala.trecho);
    const env = envelopeDoTrecho(palavras, durMs, 50);
    let i = 0;
    const t = setInterval(() => {
      // Passou da estimativa e a fala segue (voz mais lenta): recomeça, para não ficar parada.
      pulso.value = withTiming(env[i % env.length] ?? 0, { duration: 60 });
      i++;
    }, 50);
    return () => clearInterval(t);
  }, [fala.falando, fala.pausada, fala.trecho, pulso]);

  // Giro e respiração.
  const giro = useSharedValue(0);
  const respira = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(giro);
    const dur = estado === 'pensando' ? 1100 : estado === 'dormindo' ? 16000 : 6000;
    giro.value = 0;
    giro.value = withRepeat(withTiming(360, { duration: dur, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    respira.value = estado === 'dormindo' || estado === 'pensando'
      ? withRepeat(withSequence(withTiming(1, { duration: estado === 'pensando' ? 650 : 2600 }), withTiming(0, { duration: estado === 'pensando' ? 650 : 2600 })), -1, false)
      : withTiming(0);
    return () => { cancelAnimation(giro); cancelAnimation(respira); };
  }, [estado, giro, respira]);

  const estPos = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const estGiro = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value}deg` }] }));
  const estNucleo = useAnimatedStyle(() => {
    const n = estado === 'ouvindo' ? nivelDaBolota.value : estado === 'falando' ? pulso.value : respira.value * 0.25;
    return { transform: [{ scale: withSpring(0.86 + n * 0.36, { damping: 12, stiffness: 240, reduceMotion: ReduceMotion.System }) }] };
  });
  const estCaixa = useAnimatedStyle(() => ({ opacity: withTiming(estado === 'dormindo' ? 0.62 + respira.value * 0.18 : 1, { duration: 300 }) }));

  return (
    <>
      {aberta && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 59 }]} onPress={() => setAberta(false)} accessible={false} />}
      <Animated.View pointerEvents="box-none" style={[styles.camada, estPos]}>
        <GestureDetector gesture={gestos}>
          <Animated.View
            style={[{ width: TAM, height: TAM }, estCaixa]}
            accessibilityRole="button"
            accessibilityLabel={estado === 'falando' ? 'Ely falando. Tocar abre os controles' : estado === 'ouvindo' ? 'Ely ouvindo' : estado === 'pensando' ? 'Ely pensando' : 'Falar com a Ely'}
          >
            <Svg width={TAM} height={TAM} style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id="brilhoBolota" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={cor} stopOpacity={0.45} />
                  <Stop offset="1" stopColor={cor} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={TAM / 2} cy={TAM / 2} r={TAM / 2} fill="url(#brilhoBolota)" />
              <Circle cx={TAM / 2} cy={TAM / 2} r={TAM * 0.38} stroke={cor} strokeOpacity={0.55} strokeWidth={1.4} fill="none" />
            </Svg>
            <Animated.View style={[StyleSheet.absoluteFill, styles.centro, estGiro]}>
              <Svg width={TAM} height={TAM}>
                <Circle cx={TAM / 2} cy={TAM / 2} r={TAM * 0.46} stroke={cor} strokeOpacity={0.7} strokeWidth={1.4} strokeDasharray="4 6" fill="none" />
              </Svg>
            </Animated.View>
            <View style={[StyleSheet.absoluteFill, styles.centro]}>
              <Animated.View style={[styles.nucleo, { backgroundColor: cor, shadowColor: cor }, estNucleo]}>
                <View style={styles.reflexo} />
              </Animated.View>
            </View>
          </Animated.View>
        </GestureDetector>

        {aberta && fala.falando && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(140)}
            style={[
              styles.painel,
              // Abre para o lado que tem espaço.
              lado.embaixo ? { bottom: TAM + 8 } : { top: TAM + 8 },
              lado.direita ? { right: 0 } : { left: 0 },
              { backgroundColor: palette.surface, borderColor: cor, borderRadius: tokens.radii.xl },
            ]}
          >
            <Text variant="label" color={cor}>
              {fala.pausada ? 'ELY · PAUSADA' : 'ELY · FALANDO'}{fala.total > 1 ? `  ${fala.parte}/${fala.total}` : ''}
            </Text>
            <Text variant="caption" color={palette.textMuted} numberOfLines={3}>{fala.trecho}</Text>
            <View style={styles.botoes}>
              <Pressable
                onPress={() => { haptica.leve(); if (fala.pausada) retomarFala(); else pausarFala(); adiarRecolher(); }}
                accessibilityRole="button"
                accessibilityLabel={fala.pausada ? 'Retomar a fala' : 'Pausar a fala'}
                style={({ pressed }) => [styles.botao, { backgroundColor: cor, opacity: pressed ? 0.8 : 1 }]}
              >
                <Animated.View key={fala.pausada ? 'play' : 'pause'} entering={ZoomIn.duration(160)} exiting={ZoomOut.duration(120)}>
                  <Feather name={fala.pausada ? 'play' : 'pause'} size={18} color={palette.background} />
                </Animated.View>
                <Text variant="label" color={palette.background}>{fala.pausada ? 'Retomar' : 'Pausar'}</Text>
              </Pressable>
              <Pressable
                onPress={() => { haptica.medio(); pararDeFalar(); }}
                accessibilityRole="button"
                accessibilityLabel="Parar a fala"
                style={({ pressed }) => [styles.botao, { borderWidth: 1, borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="square" size={16} color={palette.text} />
                <Text variant="label">Parar</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', left: 0, top: 0, zIndex: 60, elevation: 60 },
  centro: { alignItems: 'center', justifyContent: 'center' },
  nucleo: { width: 30, height: 30, borderRadius: 15, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  reflexo: { position: 'absolute', top: 6, left: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.75)' },
  painel: { position: 'absolute', width: 280, padding: 14, gap: 8, borderWidth: 1, elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 4 },
  botao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 22 },
});
