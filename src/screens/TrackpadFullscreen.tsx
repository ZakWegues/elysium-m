import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { useKeyboard } from '../lib/useKeyboard';
import { haptica } from '../lib/haptica';
import { CanalInput, ModoCanal } from '../lib/inputCanal';
import {
  acelerar, diffTexto, EventoInput, gestoTresDedos, passoInercia,
  SENSIBILIDADE_MAX, SENSIBILIDADE_MIN, SENSIBILIDADE_PADRAO,
} from '../lib/trackpad';
import { useTheme } from '../theme';
import { Text } from '../components/ui';
import { BarraMidia } from '../components/BarraMidia';

/**
 * Trackpad em tela cheia (fase 22 — o antigo era "quase inútil": um dedo, ganho fixo, um POST
 * por movimento e o clique chegando antes do cursor).
 *
 * Gestos (gesture-handler, todos com callback na thread de JS — o envio é por quadro mesmo):
 *   1 dedo arrastando = mover, com aceleração        1 toque = clique (2 toques = duplo, o Windows junta)
 *   segurar 350 ms e arrastar = arrastar com o botão preso
 *   2 dedos: toque = direito · arrastar = rolar (vertical e horizontal), com inércia ao soltar
 *   3 dedos: toque = meio · deslizar para cima = Win+Tab · para baixo = Win+D
 *
 * Embaixo: E e D, e três abas — Teclado (digita ao vivo, cada mudança vira "apague N e digite
 * isto"), Atalhos e Mídia. Os eventos vão pelo canal do WebSocket (lib/inputCanal.ts).
 *
 * 🔴 Modal no Android é outra janela nativa: o GestureHandlerRootView daqui de dentro é o que
 * faz o GestureDetector receber o dedo.
 */

const CHAVE_AJUSTES = 'trackpad.ajustes';
interface Ajustes { sensibilidade: number; inverterRolagem: boolean; haptica: boolean }
const PADRAO: Ajustes = { sensibilidade: SENSIBILIDADE_PADRAO, inverterRolagem: false, haptica: true };

/** px de dedo por marca da roda. */
const PX_POR_MARCA = 38;

type AbaRodape = 'teclado' | 'atalhos' | 'midia';

const ATALHOS: { rotulo: string; teclas: string[]; perigoso?: boolean }[] = [
  { rotulo: 'Win', teclas: ['win'] },
  { rotulo: 'Alt+Tab', teclas: ['alt', 'tab'] },
  { rotulo: 'Win+D', teclas: ['win', 'd'] },
  { rotulo: 'Ctrl+C', teclas: ['ctrl', 'c'] },
  { rotulo: 'Ctrl+V', teclas: ['ctrl', 'v'] },
  { rotulo: 'Ctrl+Z', teclas: ['ctrl', 'z'] },
  { rotulo: 'Ctrl+A', teclas: ['ctrl', 'a'] },
  { rotulo: 'Esc', teclas: ['esc'] },
  { rotulo: 'Enter', teclas: ['enter'] },
  { rotulo: 'Del', teclas: ['del'] },
  { rotulo: '←', teclas: ['left'] },
  { rotulo: '↑', teclas: ['up'] },
  { rotulo: '↓', teclas: ['down'] },
  { rotulo: '→', teclas: ['right'] },
  { rotulo: 'PgUp', teclas: ['pgup'] },
  { rotulo: 'PgDn', teclas: ['pgdn'] },
  { rotulo: 'F5', teclas: ['f5'] },
  { rotulo: 'Alt+F4', teclas: ['alt', 'f4'], perigoso: true },
];

export default function TrackpadFullscreen({
  pairing,
  visible,
  onClose,
  onError,
}: {
  pairing: Pairing;
  visible: boolean;
  onClose: () => void;
  onError: (err: unknown, context: string) => void;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();

  const [modo, setModo] = useState<ModoCanal>('conectando');
  const [aba, setAba] = useState<AbaRodape>('teclado');
  const [ajustes, setAjustes] = useState<Ajustes>(PADRAO);
  const [engrenagem, setEngrenagem] = useState(false);
  const [armado, setArmado] = useState<string | null>(null);
  const [digitado, setDigitado] = useState('');
  const ajustesRef = useRef(ajustes);
  ajustesRef.current = ajustes;

  // ── canal ──
  const canal = useRef<CanalInput | null>(null);
  useEffect(() => {
    if (!visible) return;
    const c = new CanalInput(pairing, setModo);
    canal.current = c;
    c.abrir();
    return () => { c.fechar(); canal.current = null; };
  }, [visible, pairing]);
  const enviar = useCallback((e: EventoInput) => { canal.current?.enviar(e); }, []);

  // ── ajustes salvos ──
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_AJUSTES).then((s) => {
      if (!s) return;
      try { setAjustes({ ...PADRAO, ...JSON.parse(s) }); } catch { /* ajuste corrompido: fica o padrão */ }
    }).catch(() => {});
  }, []);
  const mudarAjustes = (a: Partial<Ajustes>) => {
    setAjustes((atual) => {
      const novo = { ...atual, ...a };
      AsyncStorage.setItem(CHAVE_AJUSTES, JSON.stringify(novo)).catch(() => {});
      return novo;
    });
  };
  const vibrar = (forca: 'leve' | 'medio') => { if (ajustesRef.current.haptica) void haptica[forca](); };

  // ── rastro do dedo ──
  const rastroX = useSharedValue(0), rastroY = useSharedValue(0), rastroA = useSharedValue(0);
  const rastro = useAnimatedStyle(() => ({
    opacity: rastroA.value,
    transform: [{ translateX: rastroX.value - 22 }, { translateY: rastroY.value - 22 }, { scale: 0.6 + rastroA.value * 0.4 }],
  }));
  const marcarDedo = (x: number, y: number) => { rastroX.value = x; rastroY.value = y; rastroA.value = 0.55; };
  const soltarDedo = () => { rastroA.value = withTiming(0, { duration: 350 }); };

  // ── mover (1 dedo) ──
  const ultimoMov = useRef(0);
  const mover = (dx: number, dy: number) => {
    const agora = Date.now();
    const dt = ultimoMov.current ? Math.min(100, agora - ultimoMov.current) : 16;
    ultimoMov.current = agora;
    const [x, y] = acelerar(dx, dy, dt, ajustesRef.current.sensibilidade);
    enviar(['m', x, y]);
  };

  // ── rolar (2 dedos) com inércia ──
  const inercia = useRef<{ vy: number; vx: number; id: number | null }>({ vy: 0, vx: 0, id: null });
  const pararInercia = () => { if (inercia.current.id !== null) cancelAnimationFrame(inercia.current.id); inercia.current.id = null; };
  const rolar = (dyPx: number, dxPx: number) => {
    const s = ajustesRef.current.inverterRolagem ? -1 : 1;
    // Dedo para cima = conteúdo sobe (como no celular): roda para baixo.
    enviar(['w', (dyPx / PX_POR_MARCA) * s, (-dxPx / PX_POR_MARCA) * s]);
  };
  const soltarRolagem = (vy: number, vx: number) => {
    pararInercia();
    // velocidade em px/s → px por quadro
    inercia.current.vy = vy / 60; inercia.current.vx = vx / 60;
    const passo = () => {
      const i = inercia.current;
      i.vy = passoInercia(i.vy, 0.92, 0.4); i.vx = passoInercia(i.vx, 0.92, 0.4);
      if (!i.vy && !i.vx) { i.id = null; return; }
      rolar(i.vy, i.vx);
      i.id = requestAnimationFrame(passo);
    };
    inercia.current.id = requestAnimationFrame(passo);
  };
  useEffect(() => () => pararInercia(), []);

  // ── gestos ──
  const umDedo = Gesture.Pan().runOnJS(true).maxPointers(1).minDistance(6)
    .onBegin((e) => { pararInercia(); marcarDedo(e.x, e.y); ultimoMov.current = 0; })
    .onChange((e) => { marcarDedo(e.x, e.y); mover(e.changeX, e.changeY); })
    .onFinalize(soltarDedo);
  const arrastarPreso = Gesture.Pan().runOnJS(true).maxPointers(1).activateAfterLongPress(350)
    .onStart((e) => { marcarDedo(e.x, e.y); vibrar('medio'); enviar(['d', 'left']); ultimoMov.current = 0; })
    .onChange((e) => { marcarDedo(e.x, e.y); mover(e.changeX, e.changeY); })
    .onEnd(() => { enviar(['u', 'left']); vibrar('leve'); })
    .onFinalize(soltarDedo);
  const doisDedos = Gesture.Pan().runOnJS(true).minPointers(2).maxPointers(2).minDistance(4)
    .onBegin(() => pararInercia())
    .onChange((e) => rolar(e.changeY, e.changeX))
    .onEnd((e) => soltarRolagem(e.velocityY, e.velocityX));
  const tresDedos = Gesture.Pan().runOnJS(true).minPointers(3).minDistance(20)
    .onEnd((e) => {
      const teclas = gestoTresDedos(e.translationY);
      if (teclas) { vibrar('medio'); enviar(['k', teclas]); }
    });
  const toque1 = Gesture.Tap().runOnJS(true).maxDuration(250).maxDistance(10)
    .onEnd((e, ok) => { if (!ok) return; marcarDedo(e.x, e.y); soltarDedo(); vibrar('leve'); enviar(['c', 'left']); });
  const toque2 = Gesture.Tap().runOnJS(true).minPointers(2).maxDuration(300).maxDistance(16)
    .onEnd((_e, ok) => { if (ok) { vibrar('leve'); enviar(['c', 'right']); } });
  const toque3 = Gesture.Tap().runOnJS(true).minPointers(3).maxDuration(350).maxDistance(20)
    .onEnd((_e, ok) => { if (ok) { vibrar('leve'); enviar(['c', 'middle']); } });
  const gestos = Gesture.Race(tresDedos, doisDedos, arrastarPreso, umDedo, Gesture.Exclusive(toque3, toque2, toque1));

  // ── teclado ao vivo ──
  const anterior = useRef('');
  const aoDigitar = (v: string) => {
    const { bs, texto } = diffTexto(anterior.current, v);
    anterior.current = v;
    setDigitado(v);
    if (bs) enviar(['bs', Math.min(200, bs)]);
    if (texto) enviar(['t', texto.slice(0, 500)]);
  };
  const aoEnter = () => { enviar(['k', ['enter']]); anterior.current = ''; setDigitado(''); };

  // ── atalhos (Alt+F4 pede um toque a mais) ──
  const timerArmado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atalho = (a: typeof ATALHOS[number]) => {
    if (a.perigoso && armado !== a.rotulo) {
      vibrar('medio');
      setArmado(a.rotulo);
      if (timerArmado.current) clearTimeout(timerArmado.current);
      timerArmado.current = setTimeout(() => setArmado(null), 2500);
      return;
    }
    setArmado(null);
    vibrar('leve');
    enviar(['k', a.teclas]);
  };
  useEffect(() => () => { if (timerArmado.current) clearTimeout(timerArmado.current); }, []);

  const [altPad, setAltPad] = useState(0);
  const aoMedir = (e: LayoutChangeEvent) => setAltPad(e.nativeEvent.layout.height);

  const corChip = { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft, borderColor: palette.glassBorder };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={[
            styles.root,
            {
              backgroundColor: palette.background,
              paddingTop: insets.top,
              paddingBottom: keyboard.visible ? keyboard.height : Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View style={[styles.header, { paddingHorizontal: tokens.spacing.lg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="subheading">Trackpad</Text>
              <View style={[styles.ponto, { backgroundColor: modo === 'ws' ? palette.success : modo === 'http' ? palette.primary : palette.textMuted }]} />
              <Text variant="caption" color={palette.textMuted}>
                {modo === 'ws' ? 'direto' : modo === 'http' ? 'modo compatível' : 'conectando…'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Pressable accessibilityLabel="Ajustes do trackpad" onPress={() => setEngrenagem(v => !v)} hitSlop={12}>
                <Feather name="settings" size={21} color={engrenagem ? palette.primary : palette.textMuted} />
              </Pressable>
              <Pressable accessibilityLabel="Fechar" accessibilityRole="button" onPress={onClose} hitSlop={12}>
                <Feather name="x" size={24} color={palette.textMuted} />
              </Pressable>
            </View>
          </View>

          {engrenagem && (
            <View style={[styles.ajustes, { marginHorizontal: tokens.spacing.lg, borderColor: palette.glassBorder, borderRadius: tokens.radii.md, backgroundColor: palette.surface }]}>
              <View style={styles.linhaAjuste}>
                <Text variant="label" style={{ flex: 1 }}>Sensibilidade</Text>
                <Pressable accessibilityLabel="Menos sensível" hitSlop={8} onPress={() => mudarAjustes({ sensibilidade: Math.max(SENSIBILIDADE_MIN, Math.round((ajustes.sensibilidade - 0.2) * 10) / 10) })}>
                  <Feather name="minus-circle" size={22} color={palette.primary} />
                </Pressable>
                <Text variant="label" style={{ minWidth: 40, textAlign: 'center' }}>{ajustes.sensibilidade.toFixed(1)}</Text>
                <Pressable accessibilityLabel="Mais sensível" hitSlop={8} onPress={() => mudarAjustes({ sensibilidade: Math.min(SENSIBILIDADE_MAX, Math.round((ajustes.sensibilidade + 0.2) * 10) / 10) })}>
                  <Feather name="plus-circle" size={22} color={palette.primary} />
                </Pressable>
              </View>
              <Interruptor rotulo="Inverter rolagem" valor={ajustes.inverterRolagem} aoMudar={(v) => mudarAjustes({ inverterRolagem: v })} />
              <Interruptor rotulo="Vibrar nos toques" valor={ajustes.haptica} aoMudar={(v) => mudarAjustes({ haptica: v })} />
            </View>
          )}

          {/* A área de gestos ocupa toda a sobra. */}
          <GestureDetector gesture={gestos}>
            <View
              onLayout={aoMedir}
              style={[
                styles.pad,
                {
                  marginHorizontal: tokens.spacing.lg,
                  borderRadius: tokens.radii.lg,
                  backgroundColor: palette.primarySoft,
                  borderColor: palette.border,
                },
              ]}
            >
              {altPad > 140 && (
                <View pointerEvents="none" style={styles.dica}>
                  <Feather name="move" size={22} color={palette.primary} style={{ opacity: 0.5 }} />
                  <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }}>
                    1 dedo move e clica · segure para arrastar{'\n'}2 dedos rolam e clicam com o direito · 3 dedos: Win+Tab / Win+D
                  </Text>
                </View>
              )}
              <Animated.View pointerEvents="none" style={[styles.rastro, { borderColor: palette.primary, backgroundColor: palette.primarySoft }, rastro]} />
            </View>
          </GestureDetector>

          {/* E e D, finos, colados no trackpad. */}
          <View style={[styles.botoes, { marginHorizontal: tokens.spacing.lg }]}>
            {(['left', 'right'] as const).map(b => (
              <Pressable
                key={b}
                accessibilityLabel={b === 'left' ? 'Clique esquerdo' : 'Clique direito'}
                onPress={() => { vibrar('leve'); enviar(['c', b]); }}
                style={({ pressed }) => [styles.botao, { borderRadius: tokens.radii.md, backgroundColor: pressed ? palette.primary : palette.primarySoft, borderColor: palette.glassBorder }]}
              >
                {({ pressed }) => <Text variant="label" color={pressed ? palette.onPrimary : palette.primary}>{b === 'left' ? 'E' : 'D'}</Text>}
              </Pressable>
            ))}
          </View>

          {/* Rodapé: Teclado, Atalhos, Mídia. */}
          <View style={[styles.abas, { marginHorizontal: tokens.spacing.lg }]}>
            {([['teclado', 'Teclado', 'type'], ['atalhos', 'Atalhos', 'command'], ['midia', 'Mídia', 'music']] as const).map(([id, rotulo, icone]) => (
              <Pressable key={id} onPress={() => setAba(id)} style={[styles.aba, aba === id && { borderBottomColor: palette.primary }]}>
                <Feather name={icone} size={15} color={aba === id ? palette.primary : palette.textMuted} />
                <Text variant="caption" color={aba === id ? palette.primary : palette.textMuted}>{rotulo}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ paddingHorizontal: tokens.spacing.lg, minHeight: 64, justifyContent: 'center' }}>
            {aba === 'teclado' && (
              <TextInput
                value={digitado}
                onChangeText={aoDigitar}
                onSubmitEditing={aoEnter}
                submitBehavior="submit"
                placeholder="Digite — vai aparecendo no PC"
                placeholderTextColor={palette.textMuted}
                autoCorrect={false}
                style={[styles.input, { borderRadius: tokens.radii.md, borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
              />
            )}
            {aba === 'atalhos' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {ATALHOS.map(a => (
                  <Pressable
                    key={a.rotulo}
                    onPress={() => atalho(a)}
                    style={[styles.chip, corChip, armado === a.rotulo && { backgroundColor: palette.error, borderColor: palette.error }]}
                  >
                    <Text variant="caption" color={armado === a.rotulo ? palette.onPrimary : palette.primary}>
                      {armado === a.rotulo ? 'Toque de novo' : a.rotulo}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {aba === 'midia' && <BarraMidia pairing={pairing} onError={onError} semCartao />}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Interruptor({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean; aoMudar: (v: boolean) => void }) {
  const { palette } = useTheme();
  return (
    <Pressable style={styles.linhaAjuste} onPress={() => aoMudar(!valor)} accessibilityRole="switch" accessibilityState={{ checked: valor }}>
      <Text variant="label" style={{ flex: 1 }}>{rotulo}</Text>
      <View style={[styles.trilho, { backgroundColor: valor ? palette.primary : palette.border }]}>
        <View style={[styles.bolinha, { backgroundColor: palette.background, alignSelf: valor ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  ajustes: { borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10, marginBottom: 10 },
  linhaAjuste: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trilho: { width: 40, height: 22, borderRadius: 11, padding: 3, justifyContent: 'center' },
  bolinha: { width: 16, height: 16, borderRadius: 8 },
  pad: { flex: 1, borderWidth: StyleSheet.hairlineWidth, minHeight: 120, overflow: 'hidden' },
  dica: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  rastro: { position: 'absolute', left: 0, top: 0, width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 },
  botoes: { flexDirection: 'row', gap: 8, marginTop: 8 },
  botao: { flex: 1, alignItems: 'center', paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth },
  abas: { flexDirection: 'row', marginTop: 10 },
  aba: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
});
