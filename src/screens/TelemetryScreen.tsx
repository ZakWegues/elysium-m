import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { useTheme } from '../theme';
import { Card, ScreenHeader, Text } from '../components/ui';

const LABELS: Record<string, string> = {
  cpu: 'CPU',
  cpuPercent: 'CPU',
  cpuUsage: 'CPU',
  ram: 'RAM',
  ramPercent: 'RAM',
  memory: 'Memória',
  memoryPercent: 'Memória',
  battery: 'Bateria',
  batteryPercent: 'Bateria',
  batteryLevel: 'Bateria',
  disk: 'Disco',
  diskPercent: 'Disco',
  diskUsage: 'Disco',
};

const STATUS_LABEL: Record<TelemetryStatus, string> = {
  connecting: 'Conectando...',
  open: 'Conectado',
  closed: 'Desconectado',
};

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

export default function TelemetryScreen({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [snapshot, setSnapshot] = useState<TelemetryFrame | null>(null);

  useEffect(() => {
    const close = openTelemetryStream(pairing, setSnapshot, setStatus);
    return close;
  }, [pairing.ip, pairing.port, pairing.token]);

  const entries = snapshot ? Object.entries(snapshot).filter(([key]) => key !== 'type') : [];
  const statusColor = status === 'open' ? palette.success : palette.error;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title="Telemetria"
        right={
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text variant="caption" color={statusColor}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}>
        {!snapshot && (
          <Card style={styles.centerCard}>
            <Feather name="activity" size={22} color={palette.textMuted} />
            <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
              Esperando primeiro broadcast do NeuroAxis...
            </Text>
          </Card>
        )}

        {entries.map(([key, value]) => (
          <Card key={key} style={styles.row}>
            <Text variant="label">{LABELS[key] ?? key}</Text>
            <Text variant="body" color={palette.textMuted}>
              {formatValue(value)}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  centerCard: { alignItems: 'center', paddingVertical: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
