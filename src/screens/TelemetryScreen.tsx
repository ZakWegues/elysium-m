import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { findMetric } from '../lib/telemetryFormat';
import { useTheme } from '../theme';
import { Card, MetricBar, ScreenHeader, Text } from '../components/ui';

const STATUS_LABEL: Record<TelemetryStatus, string> = {
  connecting: 'Conectando...',
  open: 'Conectado',
  closed: 'Desconectado',
};

function formatRawValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  }
  return String(value);
}

export default function TelemetryScreen({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [snapshot, setSnapshot] = useState<TelemetryFrame | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const loggedOnce = useRef(false);

  useEffect(() => {
    const close = openTelemetryStream(pairing, (frame) => {
      if (!loggedOnce.current) {
        loggedOnce.current = true;
        // Payload real de telemetria ainda não confirmado contra o desktop —
        // log único pra ajustar METRICS em src/lib/telemetryFormat.ts se necessário.
        console.log('[telemetry] primeiro payload recebido:', JSON.stringify(frame));
      }
      setSnapshot(frame);
    }, setStatus);
    return close;
  }, [pairing.ip, pairing.port, pairing.token]);

  const entries = snapshot ? Object.entries(snapshot).filter(([key]) => key !== 'type') : [];
  const known = entries.filter(([key]) => findMetric(key));
  const unknown = entries.filter(([key]) => !findMetric(key));
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
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
        {!snapshot && (
          <Card style={styles.centerCard}>
            <Feather name="activity" size={22} color={palette.textMuted} />
            <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
              Esperando primeiro broadcast do NeuroAxis...
            </Text>
          </Card>
        )}

        {known.length > 0 && (
          <Card style={{ gap: tokens.spacing.lg }}>
            {known.map(([key, value]) => {
              const metric = findMetric(key)!;
              const percent = typeof value === 'number' ? value : 0;
              return <MetricBar key={key} icon={metric.icon} label={metric.label} percent={percent} />;
            })}
          </Card>
        )}

        {unknown.map(([key, value]) => {
          const isArray = Array.isArray(value);
          const isExpanded = expandedKey === key;
          return (
            <Card key={key}>
              <Pressable
                style={styles.row}
                onPress={() => isArray && setExpandedKey(isExpanded ? null : key)}
                disabled={!isArray}
              >
                <Text variant="label">{key}</Text>
                {isArray ? (
                  <View style={styles.rawRow}>
                    <Text variant="body" color={palette.textMuted}>
                      {(value as unknown[]).length} itens
                    </Text>
                    <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textMuted} />
                  </View>
                ) : typeof value === 'object' && value !== null ? (
                  <Text variant="body" color={palette.textMuted}>
                    {JSON.stringify(value)}
                  </Text>
                ) : (
                  <Text variant="body" color={palette.textMuted}>
                    {formatRawValue(value)}
                  </Text>
                )}
              </Pressable>
              {isArray && isExpanded && (
                <Text variant="caption" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
                  {JSON.stringify(value, null, 2)}
                </Text>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  centerCard: { alignItems: 'center', paddingVertical: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rawRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
