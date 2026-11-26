import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme';
import { Text } from '../components/ui';
import { haptica } from '../lib/haptica';
import { errMessage } from '../lib/errors';
import { AuthError } from '../lib/http';
import { avisarTokenRecusado } from '../lib/erroRpc';
import type { Pairing } from '../lib/pairing';
import { IP_DA_PONTE } from '../lib/ponte';
import { acentoDaCapa, layoutDaMesa, useDescanso, useMesaAoVivo, type MidiaMesa } from '../lib/mesa';
import { TocandoAgora } from '../components/mesa/TocandoAgora';
import { SomDaMesa } from '../components/mesa/SomMesa';
import { GradeAtalhos } from '../components/mesa/GradeAtalhos';
import { Bancada, PorNoPc, type AbaBancada } from '../components/mesa/Bancada';

export type Origem = { x: number; y: number; w: number; h: number };
const DESCANSO_MS = 20_000;
const CHAVE_KEEP_AWAKE = 'modo-mesa';

/**
 * Modo Mesa (25/11): o celular apoiado ao lado do PC vira a central de controle. Abre crescendo a
 * partir do botão embaixo do preview; em pé ou deitado, o layout acompanha. A tela fica acesa e, 20 s
 * sem toque, escurece para o relógio e a música (um toque volta).
 */
export function ModoMesa({ pairing, visivel, origem, aoFechar }: { pairing: Pairing; visivel: boolean; origem: Origem | null; aoFechar: () => void }) {
  const [montado, setMontado] = useState(visivel);
  useEffect(() => { if (visivel) setMontado(true); }, [visivel]);
  if (!montado) return null;
  return <Conteudo pairing={pairing} visivel={visivel} origem={origem} aoFechar={aoFechar} aoSumir={() => setMontado(false)} />;
}

function Conteudo({ pairing, visivel, origem, aoFechar, aoSumir }: { pairing: Pairing; visivel: boolean; origem: Origem | null; aoFechar: () => void; aoSumir: () => void }) {
  const { palette, tokens } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { deitado, colunas } = layoutDaMesa(W, H);
  const [naFrente, setNaFrente] = useState(AppState.currentState === 'active');
  useEffect(() => { const s = AppState.addEventListener('change', (a) => setNaFrente(a === 'active')); return () => s.remove(); }, []);
  const vivo = useMesaAoVivo(pairing, visivel && naFrente);
  const { descansando, tocou } = useDescanso(DESCANSO_MS, visivel && naFrente);
  const [aba, setAba] = useState<AbaBancada>('mouse');
  const rolagem = useRef<ScrollView>(null);
  const midia = vivo.estado?.midia ?? null;
  const acento = acentoDaCapa(midia?.cor, palette.primary);

  const aoErro = useCallback((e: unknown) => {
    if (e instanceof AuthError) { avisarTokenRecusado(); return; }
    void haptica.erro();
    Alert.alert('Modo Mesa', errMessage(e));
  }, []);

  // Entrar: libera o giro e segura a tela acesa. Sair: tudo de volta como estava.
  useEffect(() => {
    if (!visivel) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    activateKeepAwakeAsync(CHAVE_KEEP_AWAKE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      deactivateKeepAwake(CHAVE_KEEP_AWAKE).catch(() => {});
      Brightness.restoreSystemBrightnessAsync().catch(() => {});
    };
  }, [visivel]);

  // Descansando: o brilho cai (só nesta janela); acordou, volta ao do sistema.
  useEffect(() => {
    if (!visivel) return;
    if (descansando) Brightness.setBrightnessAsync(0.06).catch(() => {});
    else Brightness.restoreSystemBrightnessAsync().catch(() => {});
  }, [descansando, visivel]);

  // Abre crescendo a partir do botão; fecha voltando para ele (deitado: só encolhe e some).
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(visivel ? 1 : 0, { duration: visivel ? 320 : 220, easing: Easing.bezier(0.22, 1, 0.36, 1) }, (fim) => { if (fim && !visivel) runOnJS(aoSumir)(); });
  }, [visivel]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = origem && !deitado ? origem : { x: W * 0.1, y: H * 0.3, w: W * 0.8, h: H * 0.4 };
  const entrada = useAnimatedStyle(() => {
    const q = p.value;
    return {
      opacity: Math.min(1, q * 2.5),
      borderRadius: 18 * (1 - q),
      transform: [
        { translateX: (o.x + o.w / 2 - W / 2) * (1 - q) },
        { translateY: (o.y + o.h / 2 - H / 2) * (1 - q) },
        { scaleX: o.w / W + (1 - o.w / W) * q },
        { scaleY: o.h / H + (1 - o.h / H) * q },
      ],
    };
  });

  const ondeEsta = pairing.activeIp === IP_DA_PONTE ? 'fora de casa' : /^100\./.test(pairing.activeIp) ? 'pelo túnel' : 'em casa';
  const cpu = Number(vivo.telemetria?.cpu_pct);
  const ram = Number(vivo.telemetria?.ram_pct);
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 };

  const blocoMusica = (
    <View style={[styles.cartao, { borderRadius: tokens.radii.xl }]}>
      <TocandoAgora pairing={pairing} midia={midia} acento={acento} parado={descansando} compacto={deitado ? H < 420 : H < 700} aoErro={aoErro} />
      <SomDaMesa pairing={pairing} som={vivo.estado?.som ?? null} aoErro={aoErro} />
    </View>
  );
  const blocoAtalhos = (
    <GradeAtalhos pairing={pairing} colunas={colunas} som={vivo.estado?.som ?? null} acento={acento} aoErro={aoErro}
      aoAbrirJanelas={() => { setAba('janelas'); setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 60); }} />
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={aoFechar} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: palette.background }, entrada]}
          onTouchStart={tocou}>
          <Fundo midia={midia} acento={acento} fundo={palette.background} />
          <View style={[styles.topo, { paddingTop: pad.paddingTop, paddingLeft: pad.paddingLeft, paddingRight: pad.paddingRight }]}>
            <Pressable onPress={() => { void haptica.leve(); aoFechar(); }} accessibilityRole="button" accessibilityLabel="Fechar o Modo Mesa" hitSlop={10}
              style={[styles.fechar, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
              <Feather name="chevron-down" size={22} color={palette.text} />
            </Pressable>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="label">Modo Mesa</Text>
              <View style={styles.status}>
                <View style={[styles.ponto, { backgroundColor: vivo.status === 'open' ? palette.success : palette.textMuted }]} />
                <Text variant="caption" color={palette.textMuted}>{vivo.status === 'open' ? `PC ligado · ${ondeEsta}` : 'conectando…'}</Text>
              </View>
            </View>
            {Number.isFinite(cpu) ? <Medida rotulo="CPU" valor={cpu} /> : null}
            {Number.isFinite(ram) ? <Medida rotulo="RAM" valor={ram} /> : null}
            <Relogio grande={false} />
          </View>

          {deitado ? (
            <View style={[styles.deitado, { paddingLeft: pad.paddingLeft, paddingRight: pad.paddingRight, paddingBottom: pad.paddingBottom }]}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
                {blocoMusica}
                <PorNoPc pairing={pairing} aoErro={aoErro} />
              </ScrollView>
              <ScrollView ref={rolagem} style={{ flex: 1.15 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {blocoAtalhos}
                <Bancada pairing={pairing} aba={aba} setAba={setAba} aoErro={aoErro} />
              </ScrollView>
            </View>
          ) : (
            <ScrollView ref={rolagem} contentContainerStyle={{ gap: 16, paddingLeft: pad.paddingLeft, paddingRight: pad.paddingRight, paddingBottom: pad.paddingBottom, paddingTop: 6 }}
              showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {blocoMusica}
              <PorNoPc pairing={pairing} aoErro={aoErro} />
              {blocoAtalhos}
              <Bancada pairing={pairing} aba={aba} setAba={setAba} aoErro={aoErro} />
            </ScrollView>
          )}

          {descansando ? <Descanso midia={midia} deitado={deitado} aoAcordar={tocou} /> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** A capa desfocada atrás de tudo, escurecida; sem capa, um brilho da cor do tema. */
function Fundo({ midia, acento, fundo }: { midia: MidiaMesa | null; acento: string; fundo: string }) {
  const capa = midia?.capa ? `data:image/jpeg;base64,${midia.capa}` : midia?.capaUrl || '';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {capa ? (
        <Animated.Image key={capa.slice(-40)} entering={FadeIn.duration(600)} source={{ uri: capa }} blurRadius={40} resizeMode="cover"
          style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: 1.3 }] }]} />
      ) : null}
      <LinearGradient colors={[`${acento}33`, `${fundo}cc`, fundo]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Medida({ rotulo, valor }: { rotulo: string; valor: number }) {
  const { palette } = useTheme();
  const cor = valor >= 90 ? palette.error : valor >= 70 ? palette.accent : palette.textMuted;
  return (
    <View style={styles.medida} accessible accessibilityLabel={`${rotulo} ${Math.round(valor)} por cento`}>
      <Text variant="caption" color={palette.textMuted} style={styles.mini}>{rotulo}</Text>
      <Text variant="caption" color={cor} style={styles.numero}>{Math.round(valor)}%</Text>
    </View>
  );
}

function useHora(): Date {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    // Acorda na virada do minuto, não a cada segundo.
    let t: ReturnType<typeof setTimeout>;
    const proximo = () => { t = setTimeout(() => { setAgora(new Date()); proximo(); }, 60_000 - (Date.now() % 60_000) + 50); };
    proximo();
    return () => clearTimeout(t);
  }, []);
  return agora;
}

function Relogio({ grande }: { grande: boolean }) {
  const { palette } = useTheme();
  const agora = useHora();
  const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  return <Text variant={grande ? 'heading' : 'label'} color={grande ? '#fff' : palette.text} style={[styles.numero, grande && styles.relogioGrande]}>{hora}</Text>;
}

/**
 * O descanso: preto, o relógio grande e a música. Anda 1 px a cada minuto (a tela não marca), e
 * qualquer toque acorda — o toque não chega aos botões de baixo.
 */
function Descanso({ midia, deitado, aoAcordar }: { midia: MidiaMesa | null; deitado: boolean; aoAcordar: () => void }) {
  const agora = useHora();
  const m = agora.getMinutes();
  const deslocar = { transform: [{ translateX: (m % 7) - 3 }, { translateY: (Math.floor(m / 7) % 7) - 3 }] };
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Animated.View entering={FadeIn.duration(700)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.descanso]}>
      <Pressable style={[StyleSheet.absoluteFill, styles.centro]} onPress={aoAcordar} accessibilityRole="button" accessibilityLabel="Acordar o Modo Mesa">
        <View style={[styles.centro, deslocar, { gap: deitado ? 4 : 10 }]}>
          <Relogio grande />
          <Text variant="body" color="rgba(255,255,255,0.55)">{data}</Text>
          {midia ? (
            <View style={styles.tocandoDescanso}>
              <Feather name={midia.tocando ? 'music' : 'pause'} size={14} color="rgba(255,255,255,0.55)" />
              <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1} style={{ maxWidth: 260 }}>{midia.titulo}{midia.artista ? ` · ${midia.artista}` : ''}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10 },
  fechar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  medida: { alignItems: 'center' },
  mini: { fontSize: 10, lineHeight: 12 },
  numero: { fontVariant: ['tabular-nums'] },
  cartao: { padding: 16, gap: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.09)' },
  deitado: { flex: 1, flexDirection: 'row', gap: 16 },
  descanso: { backgroundColor: 'rgba(0,0,0,0.94)' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  relogioGrande: { fontSize: 84, lineHeight: 92, fontWeight: '200', letterSpacing: 2 },
  tocandoDescanso: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
});
