import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import { callRpc, PowerOperation, Reminder } from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { findMetric } from '../lib/telemetryFormat';
import { useTheme } from '../theme';
import { SpotifyBar } from './SpotifyPlayer';
import { Card, MetricBar, ScreenHeader, Text } from '../components/ui';

/**
 * Tela inicial: o estado do PC de relance e os atalhos que se usa todo dia.
 *
 * O app abria direto no chat, o que fazia sentido quando conversar era quase tudo que
 * ele fazia. Com controle remoto, lembretes e player, chat virou uma aba entre outras —
 * e nada mostrava, de imediato, se o PC estava de pé.
 */
export default function HomeScreen({
  pairing,
  onNavigate,
  onOpenPlayer,
  onUnpair,
}: {
  pairing: Pairing;
  onNavigate: (screen: 'chat' | 'control' | 'mailbox') => void;
  onOpenPlayer: () => void;
  onUnpair: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [telemetry, setTelemetry] = useState<TelemetryFrame | null>(null);
  const [telemetryStatus, setTelemetryStatus] = useState<TelemetryStatus>('connecting');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => openTelemetryStream(pairing, setTelemetry, setTelemetryStatus),
    [pairing.activeIp, pairing.port, pairing.token]);

  const loadReminders = useCallback(async () => {
    try {
      const res = await callRpc(pairing, 'reminders.list');
      setReminders(res.reminders.filter(r => !r.firedAt).slice(0, 3));
    } catch {
      // Lembretes são um complemento aqui; falhar não pode esvaziar a tela inteira.
      setReminders([]);
    }
  }, [pairing]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  function handleError(err: unknown, context: string) {
    if (err instanceof AuthError) {
      Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
      onUnpair();
      return;
    }
    Alert.alert(context, errMessage(err));
  }

  async function power(op: PowerOperation, label: string, warn: string) {
    const confirmed = await confirmDestructive(`${label} o PC?`, warn);
    if (confirmed !== 'confirmed') return;
    setBusy(true);
    try {
      const res = await callRpc(pairing, 'power.control', { operation: op }, { confirmed: true });
      Alert.alert('NEUROAXIS', res.message);
    } catch (err) {
      handleError(err, `Falha ao ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  }

  const metrics = telemetry
    ? Object.entries(telemetry).filter(([k, v]) => findMetric(k) && typeof v === 'number').slice(0, 3)
    : [];

  const online = telemetryStatus === 'open';

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="NEUROAXIS"
        right={
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: online ? palette.success : palette.error }]} />
            <Text variant="caption" color={online ? palette.success : palette.error}>
              {online ? 'PC online' : 'PC offline'}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadReminders} tintColor={palette.primary} />}
      >
        <SpotifyBar pairing={pairing} onOpen={onOpenPlayer} />

        <View style={styles.grid}>
          {([
            { key: 'chat',    label: 'Conversar', icon: 'message-circle', onPress: () => onNavigate('chat') },
            { key: 'control', label: 'Controlar', icon: 'monitor',        onPress: () => onNavigate('control') },
            { key: 'mailbox', label: 'Caixa',     icon: 'inbox',          onPress: () => onNavigate('mailbox') },
            { key: 'player',  label: 'Música',    icon: 'music',          onPress: onOpenPlayer },
          ] as const).map(tile => (
            <Pressable
              key={tile.key}
              onPress={tile.onPress}
              style={[
                styles.tile,
                { borderRadius: tokens.radii.lg, backgroundColor: palette.primarySoft },
              ]}
            >
              <Feather name={tile.icon} size={22} color={palette.primary} />
              <Text variant="label" color={palette.primary}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>

        {metrics.length > 0 && (
          <Card glass style={{ gap: tokens.spacing.md }}>
            {metrics.map(([key, value]) => {
              const metric = findMetric(key)!;
              return (
                <MetricBar
                  key={key}
                  icon={metric.icon}
                  label={metric.label}
                  percent={value as number}
                />
              );
            })}
          </Card>
        )}

        {reminders.length > 0 && (
          <Card glass style={{ gap: tokens.spacing.sm }}>
            <Text variant="label">Próximos lembretes</Text>
            {reminders.map(r => (
              <View key={r.id} style={styles.reminderRow}>
                <Feather name="bell" size={14} color={palette.primary} />
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{r.text}</Text>
                <Text variant="caption" color={palette.textMuted}>
                  {new Date(r.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <Card glass style={{ gap: tokens.spacing.sm }}>
          <Text variant="label">Energia</Text>
          <View style={styles.powerRow}>
            {([
              { op: 'lock',     label: 'Bloquear', icon: 'lock',  warn: 'A tela do PC será bloqueada.' },
              { op: 'sleep',    label: 'Suspender', icon: 'moon', warn: 'O PC vai suspender.' },
              { op: 'shutdown', label: 'Desligar', icon: 'power', warn: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
            ] as const).map(b => (
              <Pressable
                key={b.op}
                onPress={() => power(b.op, b.label, b.warn)}
                disabled={busy}
                style={[
                  styles.powerBtn,
                  { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft },
                ]}
              >
                <Feather
                  name={b.icon}
                  size={18}
                  color={b.op === 'shutdown' ? palette.error : palette.primary}
                />
                <Text variant="caption" color={b.op === 'shutdown' ? palette.error : palette.primary}>
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {busy && <ActivityIndicator color={palette.primary} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, minWidth: '46%', alignItems: 'center', gap: 6, paddingVertical: 20 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  powerRow: { flexDirection: 'row', gap: 8 },
  powerBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12 },
});
