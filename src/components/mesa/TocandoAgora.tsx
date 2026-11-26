import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { haptica } from '../../lib/haptica';
import { callRpc } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { ehNavegador, posicaoAgora, tempo, type MidiaMesa } from '../../lib/mesa';

/**
 * O que toca no PC, de qualquer app (Modo Mesa). Ocupa o espaço que recebe, sem cortar: sobrando
 * altura, capa grande em cima; senão capa ao lado do título. Deslizar a capa troca de faixa, dois
 * toques pausam, a barra de tempo arrasta para pular. Vídeo no navegador ganha ±10 s e tela cheia.
 */
export function TocandoAgora({ pairing, midia, acento, parado, aoErro }: {
  pairing: Pairing;
  midia: MidiaMesa | null;
  acento: string;
  /** Descansando: o relógio da barra não precisa andar. */
  parado: boolean;
  aoErro: (e: unknown) => void;
}) {
  const { palette, tokens } = useTheme();
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
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

  const capa = midia?.capa ? { uri: `data:image/jpeg;base64,${midia.capa}` } : midia?.capaUrl ? { uri: midia.capaUrl } : null;
  const pos = midia ? posicaoAgora({ ...midia, tocando }, agora) : 0;
  const video = !!midia && ehNavegador(midia.app);
  const medir = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setCaixa((c) => (c.w === w && c.h === h ? c : { w, h }));
  };

  if (!midia) {
    return (
      <View onLayout={medir} style={[styles.vazio, { borderColor: palette.glassBorder, borderRadius: tokens.radii.lg }]}>
        <Feather name="music" size={26} color={palette.textMuted} />
        <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }}>Nada tocando no PC.{'\n'}Ponha uma música ou um vídeo pelo campo.</Text>
      </View>
    );
  }

  // O que vai além da capa, em altura: título 44, tempo 40, controles 60, vídeo 40, e os espaços.
  const extra = 44 + (midia.dur > 0 ? 40 : 0) + 60 + (video ? 40 : 0) + 36;
  const emPe = caixa.h - extra >= Math.min(caixa.w * 0.5, 170);
  const lado = emPe
    ? Math.floor(Math.min(caixa.w * 0.78, caixa.h - extra))
    : Math.floor(Math.max(56, Math.min(caixa.w * 0.42, caixa.h - 60 - (video ? 42 : 0) - 24)));

  const capaView = (
    <GestureDetector gesture={Gesture.Exclusive(doisToques, troca)}>
      <Animated.View style={[{ width: lado, height: lado, borderRadius: tokens.radii.lg, overflow: 'hidden', backgroundColor: palette.surface }, styles.sombra, capaEstilo]}
        accessible accessibilityLabel={`Capa de ${midia.titulo}. Deslize para trocar de faixa, dois toques para pausar.`}>
        {capa
          ? <Image source={capa} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <LinearGradient colors={[acento, palette.surface]} style={[StyleSheet.absoluteFill, styles.centro]}><Feather name="music" size={lado / 3} color="rgba(255,255,255,0.7)" /></LinearGradient>}
      </Animated.View>
    </GestureDetector>
  );
  const titulo = (
    <View style={{ gap: 2, alignItems: emPe ? 'center' : 'flex-start', alignSelf: 'stretch' }}>
      <Text variant="subheading" numberOfLines={1} style={{ textAlign: emPe ? 'center' : 'left' }}>{midia.titulo}</Text>
      <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{[midia.artista, midia.nomeApp].filter(Boolean).join(' · ')}</Text>
    </View>
  );
  const barra = midia.dur > 0 ? <BarraDeTempo pairing={pairing} pos={pos} dur={midia.dur} acento={acento} aoErro={aoErro} /> : null;
  const controles = (
    <View style={styles.controles}>
      <Botao icone="skip-back" rotulo="Anterior" desligado={!midia.podeVoltar} onPress={() => comando('anterior')} />
      <Pressable onPress={() => comando('alternar')} accessibilityRole="button" accessibilityLabel={tocando ? 'Pausar' : 'Tocar'}
        style={({ pressed }) => [styles.play, { backgroundColor: acento, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <Feather name={tocando ? 'pause' : 'play'} size={26} color="#0b0b10" style={{ marginLeft: tocando ? 0 : 3 }} />
      </Pressable>
      <Botao icone="skip-forward" rotulo="Próxima" desligado={!midia.podeAvancar} onPress={() => comando('proxima')} />
    </View>
  );
  const controlesDeVideo = video
    ? <ControlesDeVideo pairing={pairing} pos={pos} dur={midia.dur} podePular={midia.podePular === true && midia.dur > 0} aoErro={aoErro} />
    : null;

  return (
    <View onLayout={medir} style={styles.caixa}>
      {caixa.w === 0 ? null : emPe ? (
        <View style={[styles.coluna, { gap: 12 }]}>
          {capaView}
          <View style={{ alignSelf: 'stretch', gap: 8 }}>{titulo}{barra}</View>
          {controles}
          {controlesDeVideo}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={[styles.linha, { gap: 14 }]}>
            {capaView}
            <View style={{ flex: 1, gap: 8 }}>{titulo}{barra}</View>
          </View>
          {controles}
          {controlesDeVideo}
        </View>
      )}
    </View>
  );
}

/** Vídeo no navegador: voltar e avançar 10 s (se o site deixar pular) e a tela cheia do YouTube. */
function ControlesDeVideo({ pairing, pos, dur, podePular, aoErro }: { pairing: Pairing; pos: number; dur: number; podePular: boolean; aoErro: (e: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const pular = (d: number) => {
    void haptica.tique();
    callRpc(pairing, 'midia.pular', { segundos: Math.max(0, Math.min(dur, pos + d)) }).catch(aoErro);
  };
  const pilula = ({ pressed }: { pressed: boolean }) => [styles.pilulaVideo, { borderRadius: tokens.radii.full, backgroundColor: pressed ? palette.primarySoft : 'rgba(255,255,255,0.07)' }];
  return (
    <View style={styles.linhaVideo}>
      {podePular ? (
        <Pressable onPress={() => pular(-10)} accessibilityRole="button" accessibilityLabel="Voltar 10 segundos" style={pilula}>
          <Feather name="rotate-ccw" size={14} color={palette.text} /><Text variant="caption">10 s</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => { void haptica.leve(); callRpc(pairing, 'midia.telaCheia', {}, { timeoutMs: 10000 }).catch(aoErro); }}
        accessibilityRole="button" accessibilityLabel="Tela cheia no YouTube do PC" style={pilula}>
        <Feather name="maximize" size={14} color={palette.text} /><Text variant="caption">Tela cheia</Text>
      </Pressable>
      {podePular ? (
        <Pressable onPress={() => pular(10)} accessibilityRole="button" accessibilityLabel="Avançar 10 segundos" style={pilula}>
          <Text variant="caption">10 s</Text><Feather name="rotate-cw" size={14} color={palette.text} />
        </Pressable>
      ) : null}
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
  caixa: { flex: 1, justifyContent: 'center' },
  coluna: { alignItems: 'center', justifyContent: 'center' },
  linha: { flexDirection: 'row', alignItems: 'center' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  sombra: { elevation: 10, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  vazio: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 16 },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  botao: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  play: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  alvoTempo: { height: 22, justifyContent: 'center' },
  trilho: { borderRadius: 4, overflow: 'hidden' },
  tempos: { flexDirection: 'row', justifyContent: 'space-between' },
  linhaVideo: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pilulaVideo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32 },
  numero: { fontVariant: ['tabular-nums'] },
});
