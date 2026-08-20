import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, StyleSheet, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, NowPlaying } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { Text } from '../components/ui';

/** Cor da marca do Spotify — a mesma nos dois apps, independente do tema escolhido. */
const SPOTIFY_GREEN = '#1db954';

/** De quanto em quanto tempo perguntamos ao PC o que está tocando. */
const POLL_MS = 5000;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Estado do player, compartilhado entre a barra compacta e a tela cheia.
 *
 * O progresso avança localmente entre as consultas: perguntar ao Spotify a cada
 * segundo só para mover uma barra seria desperdício de rede e de cota da API.
 */
export function useSpotify(pairing: Pairing, active: boolean) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const status = await callRpc(pairing, 'spotify.status');
      setConnected(status.connected);
      if (!status.connected) { setNow(null); return; }
      const res = await callRpc(pairing, 'spotify.nowPlaying');
      setNow(res.nowPlaying);
      setError(null);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      inFlight.current = false;
    }
  }, [pairing]);

  useEffect(() => {
    if (!active) return;
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [active, poll]);

  // Avanço local do progresso, entre uma consulta e outra.
  useEffect(() => {
    if (!active || !now?.isPlaying) return;
    const timer = setInterval(() => {
      setNow(prev => prev && prev.isPlaying
        ? { ...prev, progressMs: Math.min(prev.durationMs, prev.progressMs + 1000) }
        : prev);
    }, 1000);
    return () => clearInterval(timer);
  }, [active, now?.isPlaying]);

  const send = useCallback(async (
    method: 'spotify.command' | 'spotify.volume' | 'spotify.seek' | 'spotify.shuffle' | 'spotify.repeat',
    params: Record<string, unknown>,
  ) => {
    try {
      await callRpc(pairing, method as never, params);
      // O Spotify demora um instante para refletir a mudança; sem a pausa a consulta
      // devolveria o estado anterior.
      setTimeout(poll, 400);
    } catch (err) {
      setError(errMessage(err));
    }
  }, [pairing, poll]);

  return { connected, now, error, poll, send, setNow };
}

/** Barra compacta: o que está tocando, com play/pause e atalho para a tela cheia. */
export function SpotifyBar({
  pairing,
  onOpen,
  semCard,
}: {
  pairing: Pairing;
  onOpen: () => void;
  /**
   * Dentro de um card da tela Início: o card já desenha a superfície, e um estado vazio
   * silencioso deixaria um card em branco. Fora dele a barra some quando nada toca, que é
   * o comportamento certo para um item flutuando na tela.
   */
  semCard?: boolean;
}) {
  const { palette, tokens } = useTheme();
  const { connected, now, send, setNow } = useSpotify(pairing, true);

  if (connected === false || !now) {
    if (!semCard) return null;
    return (
      <Text variant="caption" color={palette.textMuted}>
        {connected === false ? "Spotify não conectado no PC." : "Nada tocando."}
      </Text>
    );
  }

  function togglePlay() {
    const wasPlaying = now!.isPlaying;
    // Reflete na hora: esperar a próxima consulta faz o botão parecer travado.
    setNow(prev => prev ? { ...prev, isPlaying: !wasPlaying } : prev);
    send('spotify.command', { operation: wasPlaying ? 'pause' : 'play' });
  }

  return (
    <Pressable
      onPress={onOpen}
      style={[styles.bar, semCard
        ? { paddingHorizontal: 0, paddingVertical: 0 }
        : { backgroundColor: palette.surfaceRaised, borderRadius: tokens.radii.md }]}
    >
      {now.albumArt
        ? <Image source={{ uri: now.albumArt }} style={{ width: 44, height: 44, borderRadius: tokens.radii.sm }} />
        : <View style={[styles.barArtFallback, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.sm }]}>
            <Feather name="music" size={18} color={palette.primary} />
          </View>}

      <View style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={1}>{now.track}</Text>
        <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{now.artist}</Text>
      </View>

      <Pressable onPress={togglePlay} hitSlop={10} style={[styles.barPlay, { backgroundColor: SPOTIFY_GREEN }]}>
        <Feather name={now.isPlaying ? 'pause' : 'play'} size={16} color="#fff" />
      </Pressable>
    </Pressable>
  );
}

/** Player em tela cheia — capa grande, progresso arrastável, volume e modos. */
export default function SpotifyPlayer({
  pairing,
  visible,
  onClose,
}: {
  pairing: Pairing;
  visible: boolean;
  onClose: () => void;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { connected, now, error, poll, send, setNow } = useSpotify(pairing, visible);
  const [connecting, setConnecting] = useState(false);

  const seekWidth = useRef(0);

  async function connect() {
    setConnecting(true);
    try {
      await callRpc(pairing, 'spotify.login');
      // O login termina no navegador do PC; reconsultar depois evita obrigar o
      // usuário a fechar e reabrir a tela.
      setTimeout(poll, 8000);
    } finally {
      setConnecting(false);
    }
  }

  function togglePlay() {
    if (!now) return;
    const wasPlaying = now.isPlaying;
    setNow(prev => prev ? { ...prev, isPlaying: !wasPlaying } : prev);
    send('spotify.command', { operation: wasPlaying ? 'pause' : 'play' });
  }

  function seekTo(x: number) {
    if (!now?.durationMs || seekWidth.current === 0) return;
    const ratio = Math.min(1, Math.max(0, x / seekWidth.current));
    const target = Math.floor(ratio * now.durationMs);
    setNow(prev => prev ? { ...prev, progressMs: target } : prev);
    send('spotify.seek', { positionMs: target });
  }

  function cycleRepeat() {
    const order = ['off', 'context', 'track'] as const;
    const next = order[(order.indexOf(now?.repeat ?? 'off') + 1) % order.length];
    send('spotify.repeat', { state: next });
  }

  const progressPct = now?.durationMs ? (now.progressMs / now.durationMs) * 100 : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.root,
          {
            backgroundColor: palette.background,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={[styles.header, { paddingHorizontal: tokens.spacing.lg }]}>
          <Feather name="music" size={18} color={SPOTIFY_GREEN} />
          <Text variant="label" style={{ flex: 1 }}>Spotify</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="chevron-down" size={26} color={palette.textMuted} />
          </Pressable>
        </View>

        {connected === null ? (
          <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>
        ) : connected === false ? (
          <View style={styles.center}>
            <Feather name="music" size={40} color={palette.textMuted} />
            <Text variant="body" color={palette.textMuted} style={{ textAlign: 'center' }}>
              Conecte sua conta para ver o que está tocando e controlar a faixa.
            </Text>
            <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }}>
              A autorização acontece no navegador do PC.
            </Text>
            <Pressable
              onPress={connect}
              style={[styles.connectBtn, { backgroundColor: SPOTIFY_GREEN, borderRadius: tokens.radii.full }]}
            >
              {connecting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text variant="label" color="#fff">Conectar Spotify</Text>}
            </Pressable>
          </View>
        ) : !now ? (
          <View style={styles.center}>
            <Feather name="pause-circle" size={40} color={palette.textMuted} />
            <Text variant="body" color={palette.textMuted} style={{ textAlign: 'center' }}>
              Nada tocando. Abra o Spotify em algum dispositivo e dê play.
            </Text>
            {error && <Text variant="caption" color={palette.error}>{error}</Text>}
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: tokens.spacing.xl, justifyContent: 'center', gap: tokens.spacing.xl }}>
            {now.albumArt ? (
              <Image
                source={{ uri: now.albumArt }}
                style={{ width: '100%', aspectRatio: 1, borderRadius: tokens.radii.lg }}
              />
            ) : (
              <View style={[styles.artFallback, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.lg }]}>
                <Feather name="music" size={56} color={palette.primary} />
              </View>
            )}

            <View style={{ gap: 2 }}>
              <Text variant="heading" numberOfLines={2}>{now.track}</Text>
              <Text variant="body" color={palette.textMuted} numberOfLines={1}>{now.artist}</Text>
              <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{now.album}</Text>
            </View>

            <View style={{ gap: 6 }}>
              <View
                onLayout={e => { seekWidth.current = e.nativeEvent.layout.width; }}
                onStartShouldSetResponder={() => true}
                onResponderRelease={e => seekTo(e.nativeEvent.locationX)}
                style={[styles.seekTrack, { backgroundColor: palette.border }]}
              >
                <View style={[styles.seekFill, { width: `${progressPct}%`, backgroundColor: SPOTIFY_GREEN }]} />
              </View>
              <View style={styles.timeRow}>
                <Text variant="caption" color={palette.textMuted}>{formatTime(now.progressMs)}</Text>
                <Text variant="caption" color={palette.textMuted}>{formatTime(now.durationMs)}</Text>
              </View>
            </View>

            <View style={styles.controls}>
              <Pressable onPress={() => send('spotify.shuffle', { on: !now.shuffle })} hitSlop={8}>
                <Feather name="shuffle" size={20} color={now.shuffle ? SPOTIFY_GREEN : palette.textMuted} />
              </Pressable>

              <Pressable onPress={() => send('spotify.command', { operation: 'previous' })} hitSlop={8}>
                <Feather name="skip-back" size={26} color={palette.text} />
              </Pressable>

              <Pressable onPress={togglePlay} style={[styles.playBtn, { backgroundColor: SPOTIFY_GREEN }]}>
                <Feather name={now.isPlaying ? 'pause' : 'play'} size={26} color="#fff" />
              </Pressable>

              <Pressable onPress={() => send('spotify.command', { operation: 'next' })} hitSlop={8}>
                <Feather name="skip-forward" size={26} color={palette.text} />
              </Pressable>

              <Pressable onPress={cycleRepeat} hitSlop={8}>
                <Feather
                  name={now.repeat === 'track' ? 'repeat' : 'repeat'}
                  size={20}
                  color={now.repeat !== 'off' ? SPOTIFY_GREEN : palette.textMuted}
                />
                {/* O ícone é o mesmo nos dois modos; o "1" é o que diferencia repetir
                    a faixa de repetir a lista. */}
                {now.repeat === 'track' && (
                  <Text variant="caption" color={SPOTIFY_GREEN} style={styles.repeatOne}>1</Text>
                )}
              </Pressable>
            </View>

            {now.volumePercent !== null && (
              <View style={styles.volRow}>
                <Feather name="volume-1" size={16} color={palette.textMuted} />
                {[0, 25, 50, 75, 100].map(level => (
                  <Pressable
                    key={level}
                    onPress={() => send('spotify.volume', { percent: level })}
                    style={[
                      styles.volStep,
                      {
                        borderRadius: tokens.radii.full,
                        backgroundColor: now.volumePercent! >= level ? SPOTIFY_GREEN : palette.border,
                      },
                    ]}
                  />
                ))}
                <Text variant="caption" color={palette.textMuted}>{now.volumePercent}%</Text>
              </View>
            )}

            {now.device && (
              <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }}>
                Tocando em {now.device}
              </Text>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  connectBtn: { paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  artFallback: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  seekTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  seekFill: { height: '100%', borderRadius: 3 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  repeatOne: { position: 'absolute', top: -4, right: -6, fontSize: 9, fontWeight: '700' },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  volStep: { flex: 1, height: 5 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
  barArtFallback: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barPlay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
