import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, MouseButton, RpcMethod } from '../lib/rpc';
import { useKeyboard } from '../lib/useKeyboard';
import { useTheme } from '../theme';
import { Text } from '../components/ui';

/** Quanto o cursor anda por pixel arrastado no celular. */
const POINTER_SENSITIVITY = 1.8;
/** Movimento menor que isto conta como toque, não como arrasto. */
const TAP_SLOP_PX = 6;
const TAP_MAX_MS = 250;
/**
 * Intervalo mínimo entre dois `input.move`. Os eventos de toque chegam a ~60 Hz;
 * mandar um POST por evento estouraria o rate limit do servidor e encheria a rede de
 * requisições redundantes. Acumulamos o deslocamento e enviamos a soma.
 */
const MOVE_THROTTLE_MS = 40;

const SPECIAL_KEYS: { label: string; sequence: string }[] = [
  { label: 'Enter', sequence: '{ENTER}' },
  { label: 'Tab', sequence: '{TAB}' },
  { label: 'Esc', sequence: '{ESC}' },
  { label: '⌫', sequence: '{BACKSPACE}' },
  { label: '←', sequence: '{LEFT}' },
  { label: '→', sequence: '{RIGHT}' },
  { label: '↑', sequence: '{UP}' },
  { label: '↓', sequence: '{DOWN}' },
  { label: 'Ctrl+C', sequence: '^c' },
  { label: 'Ctrl+V', sequence: '^v' },
  { label: 'Ctrl+Z', sequence: '^z' },
  { label: 'Alt+Tab', sequence: '%{TAB}' },
];

/**
 * Trackpad em tela cheia.
 *
 * Fica numa tela própria, sem rolagem vertical, de propósito: dentro de uma página que
 * rola, o gesto de arrastar o dedo é capturado pelo ScrollView e o cursor não anda. As
 * únicas rolagens aqui são horizontais (fila de teclas), que não disputam com o gesto
 * vertical do trackpad.
 */
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

  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);

  const last = useRef({ x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0, t: 0 });
  const moved = useRef(false);
  const pending = useRef({ dx: 0, dy: 0 });
  const lastSentAt = useRef(0);

  // Sobe o host de entrada quando a tela abre: a primeira chamada paga ~480 ms para
  // compilar o interop no PC, e isso não pode acontecer no primeiro toque.
  useEffect(() => {
    if (!visible) return;
    setReady(false);
    callRpc(pairing, 'input.ping', {}, { timeoutMs: 15000 })
      .then(() => setReady(true))
      .catch(err => onError(err, 'Não consegui preparar o controle remoto'));
  }, [visible, pairing, onError]);

  const fire = useCallback((method: RpcMethod, params?: Record<string, unknown>) => {
    // Sem await: movimento de cursor é fire-and-forget. Esperar cada resposta
    // transformaria o arrasto numa sequência de engasgos.
    callRpc(pairing, method as never, params).catch(() => { /* quadro perdido, segue */ });
  }, [pairing]);

  function flushMove() {
    const { dx, dy } = pending.current;
    if (dx === 0 && dy === 0) return;
    pending.current = { dx: 0, dy: 0 };
    lastSentAt.current = Date.now();
    fire('input.move', { dx, dy });
  }

  function onTouchStart(x: number, y: number) {
    last.current = { x, y };
    start.current = { x, y, t: Date.now() };
    moved.current = false;
    pending.current = { dx: 0, dy: 0 };
  }

  function onTouchMove(x: number, y: number) {
    pending.current.dx += (x - last.current.x) * POINTER_SENSITIVITY;
    pending.current.dy += (y - last.current.y) * POINTER_SENSITIVITY;
    last.current = { x, y };

    if (Math.abs(x - start.current.x) > TAP_SLOP_PX || Math.abs(y - start.current.y) > TAP_SLOP_PX) {
      moved.current = true;
    }
    if (Date.now() - lastSentAt.current >= MOVE_THROTTLE_MS) flushMove();
  }

  function onTouchEnd() {
    // O resto do movimento precisa sair, senão o cursor para antes de onde o dedo parou.
    flushMove();
    const quick = Date.now() - start.current.t < TAP_MAX_MS;
    if (!moved.current && quick) fire('input.click', { button: 'left' });
  }

  function click(button: MouseButton) { fire('input.click', { button }); }
  function scroll(notches: number) { fire('input.scroll', { notches }); }
  function key(sequence: string) { fire('input.key', { sequence }); }

  async function sendText() {
    const text = draft;
    if (!text) return;
    setDraft('');
    try {
      await callRpc(pairing, 'input.type', { text });
    } catch (err) {
      onError(err, 'Falha ao digitar no PC');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.root,
          {
            backgroundColor: palette.background,
            paddingTop: insets.top,
            // Sem teclado, respeita a barra de gestos; com teclado, sobe tudo acima dele.
            paddingBottom: keyboard.visible ? keyboard.height : Math.max(insets.bottom, 8),
          },
        ]}
      >
        <View style={[styles.header, { paddingHorizontal: tokens.spacing.lg }]}>
          <Text variant="subheading">Trackpad</Text>
          <Pressable accessibilityLabel="Fechar" accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Feather name="x" size={24} color={palette.textMuted} />
          </Pressable>
        </View>

        {/* A área de gestos ocupa toda a sobra vertical. Quando o teclado abre ela
            encolhe, mas continua utilizável, e os controles seguem visíveis. */}
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={e => onTouchStart(e.nativeEvent.pageX, e.nativeEvent.pageY)}
          onResponderMove={e => onTouchMove(e.nativeEvent.pageX, e.nativeEvent.pageY)}
          onResponderRelease={onTouchEnd}
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
          {ready ? (
            <>
              <Feather name="move" size={28} color={palette.primary} />
              <Text variant="caption" color={palette.primary}>
                Arraste para mover · toque para clicar
              </Text>
            </>
          ) : (
            <>
              <ActivityIndicator color={palette.primary} />
              <Text variant="caption" color={palette.primary}>Preparando…</Text>
            </>
          )}
        </View>

        <View style={[styles.controls, { paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.sm }]}>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            <Pressable
              onPress={() => click('left')}
              style={[styles.mouseBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}
            >
              <Text variant="label" color={palette.primary}>Esquerdo</Text>
            </Pressable>
            <Pressable accessibilityLabel="Clique do meio" accessibilityRole="button"
              onPress={() => click('middle')}
              style={[styles.midBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}
            >
              <Feather name="disc" size={18} color={palette.primary} />
            </Pressable>
            <Pressable
              onPress={() => click('right')}
              style={[styles.mouseBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}
            >
              <Text variant="label" color={palette.primary}>Direito</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            {[3, 1, -1, -3].map(n => (
              <Pressable
                key={n}
                onPress={() => scroll(n)}
                style={[styles.scrollBtn, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
              >
                <Feather name={n > 0 ? 'chevron-up' : 'chevron-down'} size={16} color={palette.primary} />
                <Text variant="caption" color={palette.primary}>{Math.abs(n)}</Text>
              </Pressable>
            ))}
          </View>

          {/* Rolagem horizontal: não disputa com o gesto vertical do trackpad. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {SPECIAL_KEYS.map(k => (
              <Pressable
                key={k.label}
                onPress={() => key(k.sequence)}
                style={[styles.keyBtn, { borderRadius: tokens.radii.sm, backgroundColor: palette.primarySoft }]}
              >
                <Text variant="caption" color={palette.primary}>{k.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Digitar no PC…"
              placeholderTextColor={palette.textMuted}
              onSubmitEditing={sendText}
              blurOnSubmit={false}
              style={[
                styles.input,
                {
                  borderRadius: tokens.radii.md,
                  borderColor: palette.border,
                  color: palette.text,
                  backgroundColor: palette.surface,
                },
              ]}
            />
            <Pressable accessibilityLabel="Enter" accessibilityRole="button"
              onPress={sendText}
              style={[styles.sendBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primary }]}
            >
              <Feather name="corner-down-left" size={18} color={palette.onPrimary} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  pad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, minHeight: 120 },
  controls: { paddingTop: 12 },
  mouseBtn: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  midBtn: { width: 56, alignItems: 'center', justifyContent: 'center' },
  scrollBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  keyBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  sendBtn: { width: 46, alignItems: 'center', justifyContent: 'center' },
});
