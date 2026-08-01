import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  callRpc, AppEntry, DiskEntry, ProcessEntry, MediaOperation, PowerOperation,
} from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import TelemetryScreen from './TelemetryScreen';
import { Button, Card, MetricBar, ScreenHeader, Text } from '../components/ui';

type Section = 'monitor' | 'processos' | 'apps' | 'controle';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'monitor', label: 'Monitor' },
  { key: 'processos', label: 'Processos' },
  { key: 'apps', label: 'Apps' },
  { key: 'controle', label: 'Controle' },
];

export default function SystemScreen({
  pairing,
  onUnpair,
}: {
  pairing: Pairing;
  onUnpair: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [section, setSection] = useState<Section>('monitor');

  /** Erro de token é fatal em qualquer seção: força reparear em vez de insistir. */
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
      <ScreenHeader title="Sistema" />

      <View style={[styles.segmentRow, { paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.xs }]}>
        {SECTIONS.map(s => {
          const active = s.key === section;
          return (
            <Pressable
              key={s.key}
              onPress={() => setSection(s.key)}
              style={[
                styles.segment,
                {
                  borderRadius: tokens.radii.full,
                  backgroundColor: active ? palette.primary : palette.primarySoft,
                },
              ]}
            >
              <Text variant="caption" color={active ? palette.onPrimary : palette.primary}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === 'monitor' && <TelemetryScreen pairing={pairing} embedded />}
      {section === 'processos' && <ProcessesSection pairing={pairing} onError={handleError} />}
      {section === 'apps' && <AppsSection pairing={pairing} onError={handleError} />}
      {section === 'controle' && <ControlSection pairing={pairing} onError={handleError} />}
    </View>
  );
}

type SectionProps = {
  pairing: Pairing;
  onError: (err: unknown, context: string) => void;
};

// ── Processos ─────────────────────────────────────────────────────────────────

function ProcessesSection({ pairing, onError }: SectionProps) {
  const { palette, tokens } = useTheme();
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const [disks, setDisks] = useState<DiskEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sequencial de propósito: cada chamada dispara um PowerShell no PC e as duas
      // juntas competem por CPU justamente quando o usuário quer medir a CPU.
      const procs = await callRpc(pairing, 'system.processes', {}, { timeoutMs: 20000 });
      setProcesses(procs.processes);
      const d = await callRpc(pairing, 'system.disks', {}, { timeoutMs: 20000 });
      setDisks(d.disks);
    } catch (err) {
      onError(err, 'Falha ao ler processos');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  useEffect(() => { load(); }, [load]);

  async function kill(proc: ProcessEntry) {
    const confirmed = await confirmDestructive(
      `Encerrar ${proc.name}?`,
      `O processo ${proc.name} (PID ${proc.pid}) será encerrado à força. Trabalho não salvo se perde.`
    );
    if (confirmed !== 'confirmed') return;

    try {
      await callRpc(pairing, 'system.killProcess', { pid: proc.pid }, { confirmed: true });
      setProcesses(prev => prev.filter(p => p.pid !== proc.pid));
    } catch (err) {
      onError(err, 'Falha ao encerrar processo');
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />}
    >
      {disks.length > 0 && (
        <Card glass style={{ gap: tokens.spacing.md }}>
          <Text variant="label">Armazenamento</Text>
          {disks.map(d => (
            <MetricBar
              key={d.name}
              icon="hard-drive"
              label={`Disco ${d.name}`}
              percent={d.usedPct}
              detail={`${d.freeGB} GB livres de ${d.totalGB} GB`}
            />
          ))}
        </Card>
      )}

      <Text variant="label">Processos</Text>
      {loading && processes.length === 0 && <ActivityIndicator color={palette.primary} />}

      {processes.map(proc => (
        <Card key={proc.pid} style={styles.procRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">{proc.name}</Text>
            <Text variant="caption" color={palette.textMuted}>
              PID {proc.pid} · {proc.cpu}% CPU · {proc.ramMB} MB
              {proc.isSystem ? ' · sistema' : ''}
            </Text>
          </View>
          <Pressable onPress={() => kill(proc)} hitSlop={10}>
            <Feather name="x-circle" size={20} color={palette.error} />
          </Pressable>
        </Card>
      ))}
    </ScrollView>
  );
}

// ── Apps ──────────────────────────────────────────────────────────────────────

function AppsSection({ pairing, onError }: SectionProps) {
  const { palette, tokens } = useTheme();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRpc(pairing, 'apps.list');
      setApps(res.apps);
    } catch (err) {
      onError(err, 'Falha ao listar apps');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  useEffect(() => { load(); }, [load]);

  async function open(app: AppEntry) {
    setBusyKey(app.key);
    try {
      await callRpc(pairing, 'apps.open', { name: app.key }, { timeoutMs: 15000 });
    } catch (err) {
      onError(err, `Falha ao abrir ${app.key}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function close(app: AppEntry) {
    const confirmed = await confirmDestructive(
      `Fechar ${app.key}?`,
      'O programa será encerrado à força no PC.'
    );
    if (confirmed !== 'confirmed') return;

    setBusyKey(app.key);
    try {
      await callRpc(pairing, 'apps.close', { name: app.key }, { confirmed: true, timeoutMs: 15000 });
    } catch (err) {
      onError(err, `Falha ao fechar ${app.key}`);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.primary} />}
    >
      <Text variant="caption" color={palette.textMuted}>
        Toque para abrir no PC. O X fecha o programa.
      </Text>

      {apps.map(app => (
        <Card key={app.key} style={styles.procRow}>
          <Pressable style={{ flex: 1 }} onPress={() => open(app)} disabled={busyKey === app.key}>
            <Text variant="body">{app.key}</Text>
            <Text variant="caption" color={palette.textMuted}>{app.command}</Text>
          </Pressable>
          {busyKey === app.key ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Pressable onPress={() => close(app)} hitSlop={10}>
              <Feather name="x-circle" size={20} color={palette.error} />
            </Pressable>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

// ── Controle (energia, clipboard, mídia, volume) ──────────────────────────────

const POWER_BUTTONS: { op: PowerOperation; label: string; icon: keyof typeof Feather.glyphMap; warn: string }[] = [
  { op: 'lock', label: 'Bloquear', icon: 'lock', warn: 'A tela do PC será bloqueada.' },
  { op: 'sleep', label: 'Suspender', icon: 'moon', warn: 'O PC vai suspender.' },
  { op: 'restart', label: 'Reiniciar', icon: 'rotate-cw', warn: 'O PC reinicia em 30 segundos. Trabalho não salvo se perde.' },
  { op: 'shutdown', label: 'Desligar', icon: 'power', warn: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
];

const MEDIA_BUTTONS: { op: MediaOperation; icon: keyof typeof Feather.glyphMap }[] = [
  { op: 'previous', icon: 'skip-back' },
  { op: 'play', icon: 'play' },
  { op: 'pause', icon: 'pause' },
  { op: 'skip', icon: 'skip-forward' },
];

function ControlSection({ pairing, onError }: SectionProps) {
  const { palette, tokens } = useTheme();
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function power(op: PowerOperation, label: string, warn: string) {
    const confirmed = await confirmDestructive(`${label} o PC?`, warn);
    if (confirmed !== 'confirmed') return;

    try {
      const res = await callRpc(pairing, 'power.control', { operation: op }, { confirmed: true });
      Alert.alert('NEUROAXIS', res.message);
    } catch (err) {
      onError(err, `Falha ao ${label.toLowerCase()}`);
    }
  }

  async function cancelShutdown() {
    // Também exige confirmação porque o desktop marca power.control inteiro como
    // destrutivo — um método, uma regra.
    const confirmed = await confirmDestructive('Cancelar desligamento?', 'O desligamento agendado será abortado.');
    if (confirmed !== 'confirmed') return;
    try {
      const res = await callRpc(pairing, 'power.control', { operation: 'cancel' }, { confirmed: true });
      Alert.alert('NEUROAXIS', res.message);
    } catch (err) {
      onError(err, 'Falha ao cancelar');
    }
  }

  async function pullClipboard() {
    setBusy(true);
    try {
      const res = await callRpc(pairing, 'clipboard.get');
      setClipboardText(res.text);
      if (res.text) await Clipboard.setStringAsync(res.text);
    } catch (err) {
      onError(err, 'Falha ao ler a área de transferência do PC');
    } finally {
      setBusy(false);
    }
  }

  async function pushClipboard() {
    setBusy(true);
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        Alert.alert('Vazio', 'Não há nada copiado no celular.');
        return;
      }
      await callRpc(pairing, 'clipboard.set', { text });
      setClipboardText(text);
      Alert.alert('Pronto', 'Colado na área de transferência do PC.');
    } catch (err) {
      onError(err, 'Falha ao enviar para o PC');
    } finally {
      setBusy(false);
    }
  }

  async function media(op: MediaOperation) {
    try {
      await callRpc(pairing, 'media.control', { operation: op });
    } catch (err) {
      onError(err, 'Falha no controle de mídia');
    }
  }

  async function volume(level: number | 'mute' | 'unmute') {
    try {
      await callRpc(pairing, 'volume.set', { level });
    } catch (err) {
      onError(err, 'Falha ao ajustar o volume');
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
      <Card glass style={{ gap: tokens.spacing.md }}>
        <Text variant="label">Energia</Text>
        <View style={styles.grid}>
          {POWER_BUTTONS.map(b => (
            <Pressable
              key={b.op}
              onPress={() => power(b.op, b.label, b.warn)}
              style={[
                styles.powerTile,
                { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft },
              ]}
            >
              <Feather
                name={b.icon}
                size={20}
                color={b.op === 'shutdown' ? palette.error : palette.primary}
              />
              <Text variant="caption" color={b.op === 'shutdown' ? palette.error : palette.primary}>
                {b.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button variant="ghost" title="Cancelar desligamento agendado" onPress={cancelShutdown} />
      </Card>

      <Card glass style={{ gap: tokens.spacing.md }}>
        <Text variant="label">Área de transferência</Text>
        {clipboardText !== null && (
          <Text variant="caption" color={palette.textMuted} numberOfLines={4}>
            {clipboardText || '(vazio)'}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Puxar do PC" onPress={pullClipboard} loading={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Mandar pro PC" onPress={pushClipboard} loading={busy} />
          </View>
        </View>
      </Card>

      <Card glass style={{ gap: tokens.spacing.md }}>
        <Text variant="label">Mídia</Text>
        <View style={[styles.grid, { justifyContent: 'space-around' }]}>
          {MEDIA_BUTTONS.map(b => (
            <Pressable
              key={b.op}
              onPress={() => media(b.op)}
              style={[styles.mediaTile, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
            >
              <Feather name={b.icon} size={20} color={palette.primary} />
            </Pressable>
          ))}
        </View>

        <Text variant="label">Volume</Text>
        <View style={styles.grid}>
          {[0, 25, 50, 75, 100].map(level => (
            <Pressable
              key={level}
              onPress={() => volume(level)}
              style={[styles.volTile, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
            >
              <Text variant="caption" color={palette.primary}>{level}%</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => volume('mute')}
            style={[styles.volTile, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
          >
            <Feather name="volume-x" size={16} color={palette.primary} />
          </Pressable>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  segmentRow: { flexDirection: 'row', paddingBottom: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  procRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  powerTile: { flexGrow: 1, minWidth: '45%', alignItems: 'center', gap: 4, paddingVertical: 14 },
  mediaTile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  volTile: { flexGrow: 1, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
});
