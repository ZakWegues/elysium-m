import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import { callRpc, CapturedFrame, MouseButton, ScreenInfo } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { Card, ScreenHeader, Text } from '../components/ui';

type Mode = 'espelho' | 'trackpad';

/**
 * Cadência do espelhamento. Medido no PC do Zak: cada captura leva ~640 ms, e esse
 * custo é fixo do `desktopCapturer` — não muda com o tamanho pedido. O teto real é
 * ~1,5 quadro por segundo. Isto é "dar uma olhada na tela", não vídeo.
 */
const REFRESH_MS = 1200;
/** Como o tamanho não afeta a latência, vale pedir um quadro grande: só custa banda. */
const MIRROR_MAX_WIDTH = 1100;
const MIRROR_QUALITY = 60;

/** Quanto o cursor anda por pixel arrastado no celular. */
const POINTER_SENSITIVITY = 1.8;
/** Movimento menor que isto conta como toque, não como arrasto. */
const TAP_SLOP_PX = 6;
const TAP_MAX_MS = 250;
/**
 * Intervalo mínimo entre dois `input.move`. Os eventos de toque chegam a ~60 Hz;
 * mandar um POST por evento estouraria o rate limit do servidor e encheria a rede
 * de requisições redundantes. Acumulamos o deslocamento e enviamos a soma.
 */
const MOVE_THROTTLE_MS = 40;

export default function RemoteScreen({
  pairing,
  onUnpair,
}: {
  pairing: Pairing;
  onUnpair: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [mode, setMode] = useState<Mode>('espelho');

  const handleError = useCallback((err: unknown, context: string) => {
    if (err instanceof AuthError) {
      Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
      onUnpair();
      return;
    }
    Alert.alert(context, errMessage(err));
  }, [onUnpair]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Remoto" />

      <View style={[styles.segmentRow, { paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.xs }]}>
        {(['espelho', 'trackpad'] as Mode[]).map(m => {
          const active = m === mode;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.segment,
                { borderRadius: tokens.radii.full, backgroundColor: active ? palette.primary : palette.primarySoft },
              ]}
            >
              <Text variant="caption" color={active ? palette.onPrimary : palette.primary}>
                {m === 'espelho' ? 'Espelho' : 'Trackpad'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'espelho'
        ? <MirrorSection pairing={pairing} onError={handleError} />
        : <TrackpadSection pairing={pairing} onError={handleError} />}
    </View>
  );
}

type SectionProps = {
  pairing: Pairing;
  onError: (err: unknown, context: string) => void;
};

// ── Espelho ───────────────────────────────────────────────────────────────────

function MirrorSection({ pairing, onError }: SectionProps) {
  const { palette, tokens } = useTheme();
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evita empilhar requisições quando um quadro demora mais que o intervalo.
  const inFlight = useRef(false);
  const stopped = useRef(false);

  const grab = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const f = await callRpc(
        pairing,
        'screen.capture',
        { sourceId, maxWidth: MIRROR_MAX_WIDTH, quality: MIRROR_QUALITY },
        { timeoutMs: 15000 }
      );
      if (!stopped.current) {
        setFrame(f);
        setError(null);
      }
    } catch (err) {
      if (err instanceof AuthError) { onError(err, 'Espelho'); return; }
      // Falha de quadro é comum e transitória (PC ocupado); mostra sem interromper o loop.
      if (!stopped.current) setError(errMessage(err));
    } finally {
      inFlight.current = false;
    }
  }, [pairing, sourceId, onError]);

  useEffect(() => {
    stopped.current = false;
    callRpc(pairing, 'screen.list')
      .then(r => setScreens(r.screens))
      .catch(() => setScreens([]));
    return () => { stopped.current = true; };
  }, [pairing]);

  useEffect(() => {
    if (!live) return;
    grab();
    const timer = setInterval(grab, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, grab]);

  const aspect = frame ? frame.width / Math.max(1, frame.height) : 16 / 9;

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
      <View style={[styles.toolbar, { gap: tokens.spacing.sm }]}>
        <Pressable
          onPress={() => setLive(v => !v)}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
        >
          <Feather name={live ? 'pause' : 'play'} size={14} color={palette.primary} />
          <Text variant="caption" color={palette.primary}>{live ? 'Congelar' : 'Retomar'}</Text>
        </Pressable>

        <Pressable
          onPress={grab}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
        >
          <Feather name="refresh-cw" size={14} color={palette.primary} />
          <Text variant="caption" color={palette.primary}>Atualizar</Text>
        </Pressable>
      </View>

      {screens.length > 1 && (
        <View style={[styles.toolbar, { gap: tokens.spacing.sm }]}>
          {screens.map(s => {
            const active = (sourceId ?? screens[0]?.id) === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSourceId(s.id)}
                style={[
                  styles.pill,
                  { borderRadius: tokens.radii.full, backgroundColor: active ? palette.primary : palette.primarySoft },
                ]}
              >
                <Text variant="caption" color={active ? palette.onPrimary : palette.primary}>
                  {s.name}{s.isPrimary ? ' ★' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {frame ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${frame.base64}` }}
          style={{ width: '100%', aspectRatio: aspect, borderRadius: tokens.radii.md, backgroundColor: '#000' }}
          resizeMode="contain"
        />
      ) : (
        <Card style={styles.centerCard}>
          <ActivityIndicator color={palette.primary} />
          <Text variant="caption" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
            Capturando a tela do PC…
          </Text>
        </Card>
      )}

      {error && <Text variant="caption" color={palette.error}>{error}</Text>}

      {frame && (
        <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }}>
          {frame.sourceName} · {frame.width}×{frame.height} ·{' '}
          {new Date(frame.capturedAt).toLocaleTimeString('pt-BR')}
        </Text>
      )}
    </ScrollView>
  );
}

// ── Trackpad ──────────────────────────────────────────────────────────────────

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
  { label: 'Alt+Tab', sequence: '%{TAB}' },
];

function TrackpadSection({ pairing, onError }: SectionProps) {
  const { palette, tokens } = useTheme();
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);

  const last = useRef({ x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0, t: 0 });
  const moved = useRef(false);
  // Deslocamento acumulado desde o último envio, e quando foi esse envio.
  const pending = useRef({ dx: 0, dy: 0 });
  const lastSentAt = useRef(0);

  // Sobe o host de entrada assim que a tela abre: a primeira chamada paga ~480 ms
  // para compilar o interop no PC, e isso não pode acontecer no primeiro toque.
  useEffect(() => {
    callRpc(pairing, 'input.ping', {}, { timeoutMs: 15000 })
      .then(() => setReady(true))
      .catch(err => onError(err, 'Não consegui preparar o controle remoto'));
  }, [pairing, onError]);

  const fire = useCallback(
    (method: Parameters<typeof callRpc>[1], params?: Record<string, unknown>) => {
      // Sem await: movimento de cursor é fire-and-forget. Esperar cada resposta
      // transformaria o arrasto numa sequência de engasgos.
      callRpc(pairing, method as never, params).catch(() => { /* quadro perdido, segue */ });
    },
    [pairing]
  );

  /** Envia o que estiver acumulado e zera. */
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
    <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => onTouchStart(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onResponderMove={e => onTouchMove(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onResponderRelease={onTouchEnd}
        style={[
          styles.pad,
          {
            borderRadius: tokens.radii.lg,
            backgroundColor: palette.primarySoft,
            borderColor: palette.border,
          },
        ]}
      >
        {ready ? (
          <>
            <Feather name="move" size={26} color={palette.primary} />
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

      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <Pressable
          onPress={() => click('left')}
          style={[styles.mouseBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}
        >
          <Text variant="caption" color={palette.primary}>Clique esquerdo</Text>
        </Pressable>
        <Pressable
          onPress={() => click('right')}
          style={[styles.mouseBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}
        >
          <Text variant="caption" color={palette.primary}>Clique direito</Text>
        </Pressable>
      </View>

      <Card glass style={{ gap: tokens.spacing.sm }}>
        <Text variant="label">Rolagem</Text>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          {[3, 1, -1, -3].map(n => (
            <Pressable
              key={n}
              onPress={() => scroll(n)}
              style={[styles.scrollBtn, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
            >
              <Feather
                name={n > 0 ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={palette.primary}
              />
              <Text variant="caption" color={palette.primary}>{Math.abs(n)}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card glass style={{ gap: tokens.spacing.sm }}>
        <Text variant="label">Digitar no PC</Text>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Texto para digitar…"
            placeholderTextColor={palette.textMuted}
            onSubmitEditing={sendText}
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
          <Pressable
            onPress={sendText}
            style={[styles.sendBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primary }]}
          >
            <Feather name="corner-down-left" size={18} color={palette.onPrimary} />
          </Pressable>
        </View>

        <Text variant="label">Teclas</Text>
        <View style={styles.keyGrid}>
          {SPECIAL_KEYS.map(k => (
            <Pressable
              key={k.label}
              onPress={() => key(k.sequence)}
              style={[styles.keyBtn, { borderRadius: tokens.radii.sm, backgroundColor: palette.primarySoft }]}
            >
              <Text variant="caption" color={palette.primary}>{k.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  segmentRow: { flexDirection: 'row', paddingBottom: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  centerCard: { alignItems: 'center', paddingVertical: 40 },
  pad: { height: 220, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  mouseBtn: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  scrollBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  sendBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  keyBtn: { paddingHorizontal: 12, paddingVertical: 8 },
});
