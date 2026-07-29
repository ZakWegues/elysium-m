import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pairing } from '../lib/pairing';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';

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

export default function TelemetryScreen({ pairing, onBack }: { pairing: Pairing; onBack: () => void }) {
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [snapshot, setSnapshot] = useState<TelemetryFrame | null>(null);

  useEffect(() => {
    const close = openTelemetryStream(pairing, setSnapshot, setStatus);
    return close;
  }, [pairing.ip, pairing.port, pairing.token]);

  const entries = snapshot ? Object.entries(snapshot).filter(([key]) => key !== 'type') : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>‹ Chat</Text>
        </Pressable>
        <Text style={styles.title}>Telemetria</Text>
        <View style={styles.backSpacer} />
      </View>

      <Text style={[styles.status, status === 'open' && styles.statusOpen]}>{STATUS_LABEL[status]}</Text>

      {!snapshot && <Text style={styles.waiting}>Esperando primeiro broadcast do NeuroAxis...</Text>}

      {entries.map(([key, value]) => (
        <View key={key} style={styles.row}>
          <Text style={styles.label}>{LABELS[key] ?? key}</Text>
          <Text style={styles.value}>{formatValue(value)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  back: { color: '#4da3ff', fontSize: 16 },
  backSpacer: { width: 44 },
  title: { fontSize: 18, fontWeight: '600' },
  status: { color: '#c0392b', marginBottom: 16 },
  statusOpen: { color: '#2e8b47' },
  waiting: { color: '#888' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  label: { fontSize: 16, fontWeight: '600' },
  value: { fontSize: 16, color: '#333' },
});
