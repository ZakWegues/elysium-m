import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  callRpc, AppEntry, CapturedFrame, DiskEntry, MediaOperation, MemoryFact, NowPlaying,
  PowerOperation, ProcessEntry, Reminder, ScreenInfo,
} from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { findMetric } from '../lib/telemetryFormat';
import { useTheme } from '../theme';
import TrackpadFullscreen from './TrackpadFullscreen';
import { Button, Card, Drawer, MetricBar, ScreenHeader, Text } from '../components/ui';

/**
 * Cadência do espelhamento. Medido no PC do Zak: cada captura leva ~640 ms, e esse
 * custo é fixo do `desktopCapturer` — não muda com o tamanho pedido. O teto real é
 * ~1,5 quadro por segundo. Isto é "dar uma olhada na tela", não vídeo.
 */
const REFRESH_MS = 1200;
/** Como o tamanho não afeta a latência, vale pedir um quadro grande: só custa banda. */
const MIRROR_MAX_WIDTH = 1100;
const MIRROR_QUALITY = 60;

type ErrorHandler = (err: unknown, context: string) => void;

/**
 * Guia única de controle do PC.
 *
 * O espelho da tela fica aparente logo ao entrar, sem precisar abrir nada. Todo o
 * resto (trackpad, monitor, processos, apps, energia, transferência, mídia) mora em
 * gavetas recolhidas, que só carregam dados quando abertas.
 */
export default function ControlScreen({
  pairing,
  onUnpair,
}: {
  pairing: Pairing;
  onUnpair: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [trackpadOpen, setTrackpadOpen] = useState(false);

  const handleError = useCallback<ErrorHandler>((err, context) => {
    if (err instanceof AuthError) {
      Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
      onUnpair();
      return;
    }
    Alert.alert(context, errMessage(err));
  }, [onUnpair]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Controle do PC" />

      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
        <MirrorPanel pairing={pairing} onError={handleError} />

        <Pressable onPress={() => setTrackpadOpen(true)}>
          <Card glass style={styles.trackpadRow}>
            <Feather name="move" size={18} color={palette.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Trackpad e teclado</Text>
              <Text variant="caption" color={palette.textMuted}>
                Abre em tela cheia
              </Text>
            </View>
            <Feather name="maximize-2" size={18} color={palette.textMuted} />
          </Card>
        </Pressable>

        <RemindersDrawer pairing={pairing} onError={handleError} />
        <MemoryDrawer pairing={pairing} onError={handleError} />
        <MonitorDrawer pairing={pairing} />
        <ProcessesDrawer pairing={pairing} onError={handleError} />
        <AppsDrawer pairing={pairing} onError={handleError} />
        <PowerDrawer pairing={pairing} onError={handleError} />
        <ClipboardDrawer pairing={pairing} onError={handleError} />
        <MediaDrawer pairing={pairing} onError={handleError} />
      </ScrollView>

      <TrackpadFullscreen
        pairing={pairing}
        visible={trackpadOpen}
        onClose={() => setTrackpadOpen(false)}
        onError={handleError}
      />
    </View>
  );
}

// ── Espelho (sempre visível) ──────────────────────────────────────────────────

function MirrorPanel({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

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
      // Falha de quadro é comum e transitória (PC ocupado); mostra sem parar o loop.
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

  /**
   * O PC captura a tela de novo e manda para o modelo de visão. Não reaproveitamos o
   * quadro já baixado de propósito: o do espelho é comprimido para caber na rede, e
   * texto pequeno — que costuma ser justo o que se quer ler — não sobrevive a isso.
   */
  async function askScreen() {
    setAsking(true);
    setAnswer(null);
    try {
      const res = await callRpc(pairing, 'vision.screen', {}, { timeoutMs: 90000 });
      setAnswer(res.answer);
      Speech.speak(res.answer, { language: 'pt-BR' });
    } catch (err) {
      onError(err, 'Falha ao interpretar a tela');
    } finally {
      setAsking(false);
    }
  }

  const aspect = frame ? frame.width / Math.max(1, frame.height) : 16 / 9;

  return (
    <View style={{ gap: tokens.spacing.sm }}>
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

      <View style={styles.toolbar}>
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

        <Pressable
          onPress={askScreen}
          disabled={asking}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primary }]}
        >
          {asking
            ? <ActivityIndicator size="small" color={palette.onPrimary} />
            : <Feather name="help-circle" size={14} color={palette.onPrimary} />}
          <Text variant="caption" color={palette.onPrimary}>Perguntar sobre a tela</Text>
        </Pressable>

        {screens.length > 1 && screens.map(s => {
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

      {answer && (
        <Card glass style={{ gap: tokens.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
            <Feather name="eye" size={14} color={palette.primary} />
            <Text variant="label" color={palette.primary}>O que ele viu</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setAnswer(null)} hitSlop={10}>
              <Feather name="x" size={16} color={palette.textMuted} />
            </Pressable>
          </View>
          <Text variant="body">{answer}</Text>
        </Card>
      )}

      {error && <Text variant="caption" color={palette.error}>{error}</Text>}
    </View>
  );
}

// ── Lembretes ─────────────────────────────────────────────────────────────────

function formatDue(dueAt: number): string {
  const d = new Date(dueAt);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR')} às ${hora}`;
}

function RemindersDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRpc(pairing, 'reminders.list');
      setReminders(res.reminders.filter(r => !r.firedAt));
    } catch (err) {
      onError(err, 'Falha ao listar lembretes');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  async function cancel(reminder: Reminder) {
    try {
      await callRpc(pairing, 'reminders.cancel', { id: reminder.id });
      setReminders(prev => prev.filter(r => r.id !== reminder.id));
    } catch (err) {
      onError(err, 'Falha ao cancelar');
    }
  }

  return (
    <Drawer
      title="Lembretes"
      icon="bell"
      subtitle="Criar por voz é mais rápido: “me lembra daqui a 10 minutos de…”"
      onOpen={load}
      right={
        <Pressable onPress={load} hitSlop={8}>
          <Feather name="refresh-cw" size={16} color={palette.textMuted} />
        </Pressable>
      }
    >
      {loading && <ActivityIndicator color={palette.primary} />}
      {!loading && reminders.length === 0 && (
        <Text variant="caption" color={palette.textMuted}>Nenhum lembrete agendado.</Text>
      )}
      {reminders.map(r => (
        <View key={r.id} style={styles.procRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">{r.text}</Text>
            <Text variant="caption" color={palette.textMuted}>
              {r.kind === 'weekly' ? 'toda semana ' : ''}{formatDue(r.dueAt)}
            </Text>
          </View>
          <Pressable onPress={() => cancel(r)} hitSlop={10}>
            <Feather name="x-circle" size={20} color={palette.error} />
          </Pressable>
        </View>
      ))}
      <Text variant="caption" color={palette.textMuted} style={{ marginTop: tokens.spacing.xs }}>
        Quando disparar, o PC fala e manda uma notificação para o celular — mesmo fora de casa.
      </Text>
    </Drawer>
  );
}

// ── Memória ───────────────────────────────────────────────────────────────────

function MemoryDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRpc(pairing, 'memory.list');
      setFacts(res.facts);
    } catch (err) {
      onError(err, 'Falha ao ler a memória');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const res = await callRpc(pairing, 'memory.add', { text });
      if (res.created) setFacts(prev => [...prev, res.fact]);
    } catch (err) {
      onError(err, 'Falha ao guardar');
    }
  }

  async function remove(fact: MemoryFact) {
    try {
      await callRpc(pairing, 'memory.remove', { id: fact.id });
      setFacts(prev => prev.filter(f => f.id !== fact.id));
    } catch (err) {
      onError(err, 'Falha ao esquecer');
    }
  }

  return (
    <Drawer
      title="Memória"
      icon="bookmark"
      subtitle="O que o NEUROAXIS lembra sobre você"
      onOpen={load}
    >
      {loading && <ActivityIndicator color={palette.primary} />}
      {!loading && facts.length === 0 && (
        <Text variant="caption" color={palette.textMuted}>Nada guardado ainda.</Text>
      )}
      {facts.map(f => (
        <View key={f.id} style={styles.procRow}>
          <Text variant="body" style={{ flex: 1 }}>{f.text}</Text>
          <Pressable onPress={() => remove(f)} hitSlop={10}>
            <Feather name="x-circle" size={20} color={palette.error} />
          </Pressable>
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Guardar um fato…"
          placeholderTextColor={palette.textMuted}
          onSubmitEditing={add}
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
          onPress={add}
          style={[styles.sendBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primary }]}
        >
          <Feather name="plus" size={18} color={palette.onPrimary} />
        </Pressable>
      </View>
    </Drawer>
  );
}

// ── Monitor ───────────────────────────────────────────────────────────────────

function MonitorDrawer({ pairing }: { pairing: Pairing }) {
  const { palette } = useTheme();
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [snapshot, setSnapshot] = useState<TelemetryFrame | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    return openTelemetryStream(pairing, setSnapshot, setStatus);
  }, [mounted, pairing.activeIp, pairing.port, pairing.token]);

  const known = snapshot
    ? Object.entries(snapshot).filter(([k, v]) => findMetric(k) && typeof v === 'number')
    : [];

  return (
    <Drawer
      title="Monitor"
      icon="activity"
      subtitle={status === 'open' ? 'Ao vivo' : 'Desconectado'}
      onOpen={() => setMounted(true)}
    >
      {known.length === 0 ? (
        <Text variant="caption" color={palette.textMuted}>Esperando o primeiro broadcast…</Text>
      ) : (
        known.map(([key, value]) => {
          const metric = findMetric(key)!;
          const charging = key.startsWith('battery') && typeof snapshot?.battery_charging === 'boolean'
            ? snapshot.battery_charging
            : undefined;
          const detail = charging !== undefined
            ? `${Math.round(value as number)}%${charging ? ' · carregando' : ''}`
            : undefined;
          return (
            <MetricBar key={key} icon={metric.icon} label={metric.label} percent={value as number} detail={detail} />
          );
        })
      )}
    </Drawer>
  );
}

// ── Processos ─────────────────────────────────────────────────────────────────

function ProcessesDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette } = useTheme();
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const [disks, setDisks] = useState<DiskEntry[]>([]);
  const [loading, setLoading] = useState(false);

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
    <Drawer
      title="Processos e discos"
      icon="cpu"
      onOpen={load}
      right={
        <Pressable onPress={load} hitSlop={8}>
          <Feather name="refresh-cw" size={16} color={palette.textMuted} />
        </Pressable>
      }
    >
      {loading && <ActivityIndicator color={palette.primary} />}

      {disks.map(d => (
        <MetricBar
          key={d.name}
          icon="hard-drive"
          label={`Disco ${d.name}`}
          percent={d.usedPct}
          detail={`${d.freeGB} GB livres de ${d.totalGB} GB`}
        />
      ))}

      {processes.map(proc => (
        <View key={proc.pid} style={styles.procRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">{proc.name}</Text>
            <Text variant="caption" color={palette.textMuted}>
              PID {proc.pid} · {proc.cpu}% CPU · {proc.ramMB} MB{proc.isSystem ? ' · sistema' : ''}
            </Text>
          </View>
          <Pressable onPress={() => kill(proc)} hitSlop={10}>
            <Feather name="x-circle" size={20} color={palette.error} />
          </Pressable>
        </View>
      ))}
    </Drawer>
  );
}

// ── Apps ──────────────────────────────────────────────────────────────────────

function AppsDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette } = useTheme();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    const confirmed = await confirmDestructive(`Fechar ${app.key}?`, 'O programa será encerrado à força no PC.');
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
    <Drawer title="Programas" icon="grid" subtitle="Toque abre · X fecha" onOpen={load}>
      {loading && <ActivityIndicator color={palette.primary} />}
      {apps.map(app => (
        <View key={app.key} style={styles.procRow}>
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
        </View>
      ))}
    </Drawer>
  );
}

// ── Energia ───────────────────────────────────────────────────────────────────

const POWER_BUTTONS: { op: PowerOperation; label: string; icon: keyof typeof Feather.glyphMap; warn: string }[] = [
  { op: 'lock', label: 'Bloquear', icon: 'lock', warn: 'A tela do PC será bloqueada.' },
  { op: 'sleep', label: 'Suspender', icon: 'moon', warn: 'O PC vai suspender.' },
  { op: 'restart', label: 'Reiniciar', icon: 'rotate-cw', warn: 'O PC reinicia em 30 segundos. Trabalho não salvo se perde.' },
  { op: 'shutdown', label: 'Desligar', icon: 'power', warn: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
];

function PowerDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();

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

  return (
    <Drawer title="Energia" icon="power">
      <View style={styles.grid}>
        {POWER_BUTTONS.map(b => (
          <Pressable
            key={b.op}
            onPress={() => power(b.op, b.label, b.warn)}
            style={[styles.powerTile, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}
          >
            <Feather name={b.icon} size={20} color={b.op === 'shutdown' ? palette.error : palette.primary} />
            <Text variant="caption" color={b.op === 'shutdown' ? palette.error : palette.primary}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button
        variant="ghost"
        title="Cancelar desligamento agendado"
        onPress={() => power('cancel', 'Cancelar', 'O desligamento agendado será abortado.')}
      />
    </Drawer>
  );
}

// ── Área de transferência ─────────────────────────────────────────────────────

function ClipboardDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pull() {
    setBusy(true);
    try {
      const res = await callRpc(pairing, 'clipboard.get');
      setText(res.text);
      if (res.text) await Clipboard.setStringAsync(res.text);
    } catch (err) {
      onError(err, 'Falha ao ler a área de transferência do PC');
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setBusy(true);
    try {
      const value = await Clipboard.getStringAsync();
      if (!value) {
        Alert.alert('Vazio', 'Não há nada copiado no celular.');
        return;
      }
      await callRpc(pairing, 'clipboard.set', { text: value });
      setText(value);
      Alert.alert('Pronto', 'Colado na área de transferência do PC.');
    } catch (err) {
      onError(err, 'Falha ao enviar para o PC');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer title="Área de transferência" icon="clipboard">
      {text !== null && (
        <Text variant="caption" color={palette.textMuted} numberOfLines={4}>
          {text || '(vazio)'}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title="Puxar do PC" onPress={pull} loading={busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title="Mandar pro PC" onPress={push} loading={busy} />
        </View>
      </View>
    </Drawer>
  );
}

// ── Mídia e volume ────────────────────────────────────────────────────────────

const MEDIA_BUTTONS: { op: MediaOperation; icon: keyof typeof Feather.glyphMap }[] = [
  { op: 'previous', icon: 'skip-back' },
  { op: 'play', icon: 'play' },
  { op: 'pause', icon: 'pause' },
  { op: 'skip', icon: 'skip-forward' },
];

function MediaDrawer({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSpotify = useCallback(async () => {
    try {
      const status = await callRpc(pairing, 'spotify.status');
      setConnected(status.connected);
      if (!status.connected) return;
      const res = await callRpc(pairing, 'spotify.nowPlaying');
      setNow(res.nowPlaying);
    } catch {
      // Spotify indisponível não pode impedir os botões de mídia genéricos de aparecer.
      setConnected(false);
    }
  }, [pairing]);

  async function connect() {
    setBusy(true);
    try {
      const res = await callRpc(pairing, 'spotify.login');
      Alert.alert('Autorize no PC', res.message);
    } catch (err) {
      onError(err, 'Falha ao iniciar o login');
    } finally {
      setBusy(false);
    }
  }

  async function spotifyCmd(operation: 'play' | 'pause' | 'next' | 'previous') {
    try {
      await callRpc(pairing, 'spotify.command', { operation });
      // O Spotify demora um instante para refletir a troca de faixa; sem a pausa a
      // consulta devolve a música anterior.
      setTimeout(loadSpotify, 500);
    } catch (err) {
      onError(err, 'Falha no comando do Spotify');
    }
  }

  async function media(op: MediaOperation) {
    try {
      await callRpc(pairing, 'media.control', { operation: op });
    } catch (err) {
      onError(err, 'Falha no controle de mídia');
    }
  }

  async function volume(level: number | 'mute') {
    try {
      await callRpc(pairing, 'volume.set', { level });
    } catch (err) {
      onError(err, 'Falha ao ajustar o volume');
    }
  }

  return (
    <Drawer title="Mídia e volume" icon="music" onOpen={loadSpotify}>
      {connected === false && (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="caption" color={palette.textMuted}>
            Conecte o Spotify para ver o que está tocando e controlar a faixa. A autorização
            acontece no navegador do PC.
          </Text>
          <Button title="Conectar Spotify" variant="secondary" onPress={connect} loading={busy} />
        </View>
      )}

      {now && (
        <View style={{ flexDirection: 'row', gap: tokens.spacing.md, alignItems: 'center' }}>
          {now.albumArt && (
            <Image
              source={{ uri: now.albumArt }}
              style={{ width: 64, height: 64, borderRadius: tokens.radii.sm }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>{now.track}</Text>
            <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{now.artist}</Text>
            {now.device && (
              <Text variant="caption" color={palette.textMuted} numberOfLines={1}>
                {now.isPlaying ? '▶' : '❚❚'} {now.device}
              </Text>
            )}
          </View>
        </View>
      )}

      {connected && (
        <View style={[styles.grid, { justifyContent: 'space-around' }]}>
          {([
            { op: 'previous', icon: 'skip-back' },
            { op: now?.isPlaying ? 'pause' : 'play', icon: now?.isPlaying ? 'pause' : 'play' },
            { op: 'next', icon: 'skip-forward' },
          ] as const).map(b => (
            <Pressable
              key={b.op}
              onPress={() => spotifyCmd(b.op as 'play' | 'pause' | 'next' | 'previous')}
              style={[styles.mediaTile, { borderRadius: tokens.radii.full, backgroundColor: palette.primary }]}
            >
              <Feather name={b.icon as keyof typeof Feather.glyphMap} size={20} color={palette.onPrimary} />
            </Pressable>
          ))}
        </View>
      )}

      <Text variant="caption" color={palette.textMuted}>
        {connected ? 'Abaixo: teclas de mídia, funcionam com qualquer player.' : 'Teclas de mídia'}
      </Text>

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
    </Drawer>
  );
}

const styles = StyleSheet.create({
  centerCard: { alignItems: 'center', paddingVertical: 40 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  trackpadRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  procRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  powerTile: { flexGrow: 1, minWidth: '45%', alignItems: 'center', gap: 4, paddingVertical: 14 },
  mediaTile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  volTile: { flexGrow: 1, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  sendBtn: { width: 46, alignItems: 'center', justifyContent: 'center' },
});
