import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { haptica } from '../../lib/haptica';
import { callRpc } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { posicaoAgora, tempo, type MidiaMesa } from '../../lib/mesa';

/**
 * O que toca no PC, de qualquer app (Modo Mesa). Capa grande: deslizar troca de faixa, dois toques
 * pausam. A barra de tempo arrasta para pular. Tudo responde na hora (otimista) e o PC confirma.
 */
export function TocandoAgora({ pairing, midia, acento, parado, compacto, aoErro }: {
  pairing: Pairing;
  midia: MidiaMesa | null;
  acento: string;
  /** Descansando: o relógio da barra não precisa andar. */
  parado: boolean;
  /** Deitado ou tela baixa: capa menor, ao lado do texto. */
  compacto: boolean;
  aoErro: (e: unknown) => void;
}) {
  const { palette, tokens } = useTheme();
  const [tocandoLocal, setTocandoLocal] = useState<boolean | null>(null);
  const tocando = tocandoLocal ?? midia?.tocando ?? false;
  useEffect(() => { setTocandoLocal(null); }, [midia?.tocando, midia?.titulo]);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!tocando || parado) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tocando, parado]);

  const desliza = useSharedValue(0);
  const capaEstilo = useAnimatedStyle(() => ({ transform: [{ translateX: desliza.value }, { rotate: `${desliza.value / 40}deg` }] }));

  async function comando(op: 'alternar' | 'proxima' | 'anterior') {
    void haptica.medio();
    if (op === 'alternar') setTocandoLocal(!tocando);
    try { await callRpc(pairing, 'midia.comando', { operation: op }); } catch (e) { setTocandoLocal(null); aoErro(e); }
  }

  const troca = Gesture.Pan().runOnJS(true).activeOffsetX([-14, 14]).failOffsetY([-20, 20])
    .onChange((e) => { desliza.value = e.translationX * 0.6; })
    .onEnd((e) => {
      desliza.value = withSpring(0, { damping: 16, stiffness: 220 });
      if (e.translationX < -70) void comando('proxima');
      else if (e.translationX > 70) void comando('anterior');
    });
  const doisToques = Gesture.Tap().runOnJS(true).numberOfTaps(2).onEnd((_e, ok) => { if (ok) void comando('alternar'); });

  const lado = compacto ? 112 : 220;
  const capa = midia?.capa ? { uri: `data:image/jpeg;base64,${midia.capa}` } : midia?.capaUrl ? { uri: midia.capaUrl } : null;
  const pos = midia ? posicaoAgora({ ...midia, tocando }, agora) : 0;

  if (!midia) {
    return (
      <View style={[styles.vazio, { borderColor: palette.glassBorder, borderRadius: tokens.radii.lg }]}>
        <Feather name="music" size={26} color={palette.textMuted} />
        <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }}>Nada tocando no PC.{'\n'}Ponha uma música ou um vídeo aqui embaixo.</Text>
      </View>
    );
  }

  return (
    <View style={[compacto ? styles.linha : styles.coluna, { gap: compacto ? 14 : 16 }]}>
      <GestureDetector gesture={Gesture.Exclusive(doisToques, troca)}>
        <Animated.View style={[{ width: lado, height: lado, borderRadius: tokens.radii.lg, overflow: 'hidden', backgroundColor: palette.surface }, styles.sombra, capaEstilo]}
          accessible accessibilityLabel={`Capa de ${midia.titulo}. Deslize para trocar de faixa, dois toques para pausar.`}>
          {capa
            ? <Image source={capa} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <LinearGradient colors={[acento, palette.surface]} style={[StyleSheet.absoluteFill, styles.centro]}><Feather name="music" size={lado / 3} color="rgba(255,255,255,0.7)" /></LinearGradient>}
        </Animated.View>
      </GestureDetector>

      <View style={{ flex: compacto ? 1 : undefined, alignSelf: 'stretch', gap: 10 }}>
        <View style={{ gap: 2, alignItems: compacto ? 'flex-start' : 'center' }}>
          <Text variant="subheading" numberOfLines={1} style={{ textAlign: compacto ? 'left' : 'center' }}>{midia.titulo}</Text>
          <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{[midia.artista, midia.nomeApp].filter(Boolean).join(' · ')}</Text>
        </View>
        {midia.dur > 0 ? <BarraDeTempo pairing={pairing} pos={pos} dur={midia.dur} acento={acento} aoErro={aoErro} /> : null}
        <View style={styles.controles}>
          <Botao icone="skip-back" rotulo="Anterior" desligado={!midia.podeVoltar} onPress={() => comando('anterior')} />
          <Pressable onPress={() => comando('alternar')} accessibilityRole="button" accessibilityLabel={tocando ? 'Pausar' : 'Tocar'}
            style={({ pressed }) => [styles.play, { backgroundColor: acento, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Feather name={tocando ? 'pause' : 'play'} size={28} color="#0b0b10" style={{ marginLeft: tocando ? 0 : 3 }} />
          </Pressable>
          <Botao icone="skip-forward" rotulo="Próxima" desligado={!midia.podeAvancar} onPress={() => comando('proxima')} />
        </View>
      </View>
    </View>
  );
}

function Botao({ icone, rotulo, onPress, desligado }: { icone: keyof typeof Feather.glyphMap; rotulo: string; onPress: () => void; desligado?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={desligado} hitSlop={8} accessibilityRole="button" accessibilityLabel={rotulo}
      style={({ pressed }) => [styles.botao, { backgroundColor: pressed ? palette.primarySoft : 'rgba(255,255,255,0.06)', opacity: desligado ? 0.35 : 1 }]}>
      <Feather name={icone} size={22} color={palette.text} />
    </Pressable>
  );
}

/** A barra de tempo: arrastar mostra para onde vai e, ao soltar, o PC pula para lá. */
function BarraDeTempo({ pairing, pos, dur, acento, aoErro }: { pairing: Pairing; pos: number; dur: number; acento: string; aoErro: (e: unknown) => void }) {
  const { palette } = useTheme();
  const [largura, setLargura] = useState(1);
  const [arrasto, setArrasto] = useState<number | null>(null);
  const altura = useSharedValue(4);
  const trilho = useAnimatedStyle(() => ({ height: altura.value }));
  const mostrado = arrasto ?? pos;
  const fracao = Math.max(0, Math.min(1, mostrado / dur));
  const pular = (x: number, final: boolean) => {
    const s = Math.max(0, Math.min(1, x / largura)) * dur;
    setArrasto(final ? null : s);
    if (final) { void haptica.tique(); callRpc(pairing, 'midia.pular', { segundos: s }).catch(aoErro); }
  };
  const gesto = Gesture.Pan().runOnJS(true).minDistance(0).hitSlop({ vertical: 14 })
    .onBegin((e) => { altura.value = withTiming(8, { duration: 120 }); pular(e.x, false); })
    .onChange((e) => pular(e.x, false))
    .onEnd((e) => pular(e.x, true))
    .onFinalize(() => { altura.value = withTiming(4, { duration: 160 }); });
  return (
    <View style={{ gap: 4 }}>
      <GestureDetector gesture={gesto}>
        <View onLayout={(e) => setLargura(Math.max(1, e.nativeEvent.layout.width))} style={styles.alvoTempo}
          accessible accessibilityRole="adjustable" accessibilityLabel={`${tempo(mostrado)} de ${tempo(dur)}`}>
          <Animated.View style={[styles.trilho, { backgroundColor: 'rgba(255,255,255,0.14)' }, trilho]}>
            <View style={{ width: `${fracao * 100}%`, height: '100%', backgroundColor: acento, borderRadius: 4 }} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.tempos}>
        <Text variant="caption" color={palette.textMuted} style={styles.numero}>{tempo(mostrado)}</Text>
        <Text variant="caption" color={palette.textMuted} style={styles.numero}>-{tempo(dur - mostrado)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coluna: { alignItems: 'center' },
  linha: { flexDirection: 'row', alignItems: 'center' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  sombra: { elevation: 10, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  vazio: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 16 },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  botao: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  play: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  alvoTempo: { height: 22, justifyContent: 'center' },
  trilho: { borderRadius: 4, overflow: 'hidden' },
  tempos: { flexDirection: 'row', justifyContent: 'space-between' },
  numero: { fontVariant: ['tabular-nums'] },
});
