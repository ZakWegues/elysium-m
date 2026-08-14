import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError, sendCommand } from '../lib/api';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../components/ui';

type ActionKey = 'list' | 'run' | 'create' | 'delete';

const ACTIONS: {
  key: ActionKey;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  needsInput: boolean;
  placeholder?: string;
  buildCommand: (input: string) => string;
}[] = [
  { key: 'list', label: 'Listar', icon: 'list', needsInput: false, buildCommand: () => 'lista os meus presets' },
  {
    key: 'run',
    label: 'Executar',
    icon: 'play',
    needsInput: true,
    placeholder: 'nome do preset',
    buildCommand: (name) => `executa o preset ${name}`,
  },
  {
    key: 'create',
    label: 'Criar',
    icon: 'plus-circle',
    needsInput: true,
    placeholder: 'ex: gaming: abre Steam e Discord',
    buildCommand: (desc) => `cria um preset ${desc}`,
  },
  {
    key: 'delete',
    label: 'Apagar',
    icon: 'trash-2',
    needsInput: true,
    placeholder: 'nome do preset',
    buildCommand: (name) => `apaga o preset ${name}`,
  },
];

type LogEntry = { id: string; command: string; reply?: string; error?: string; ts: number };

export default function PresetsScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { palette, tokens } = useTheme();
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);

  async function runCommand(command: string) {
    setBusy(true);
    const id = `log-${Date.now()}`;
    try {
      const reply = await sendCommand(pairing, command);
      Speech.speak(reply, { language: 'pt-BR' });
      setLog((prev) => [{ id, command, reply, ts: Date.now() }, ...prev].slice(0, 15));
    } catch (err) {
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }
      setLog((prev) => [{ id, command, error: errMessage(err), ts: Date.now() }, ...prev].slice(0, 15));
    } finally {
      setBusy(false);
    }
  }

  function handleActionPress(action: (typeof ACTIONS)[number]) {
    if (!action.needsInput) {
      runCommand(action.buildCommand(''));
      return;
    }
    setActiveAction(action.key);
    setInput('');
  }

  function handleSubmitInput() {
    const action = ACTIONS.find((a) => a.key === activeAction);
    const value = input.trim();
    if (!action || !value) return;
    runCommand(action.buildCommand(value));
    setActiveAction(null);
    setInput('');
  }

  const activeMeta = ACTIONS.find((a) => a.key === activeAction);

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <Card glass style={{ gap: tokens.spacing.xs }}>
        <Text variant="subheading">O que são presets?</Text>
        <Text variant="body" color={palette.textMuted}>
          Um preset agrupa várias ações num comando só — "gaming" pode abrir Steam, Discord e
          ajustar o volume de uma vez. Peça pro ELYSIUM criar, listar, rodar ou apagar abaixo.
        </Text>
      </Card>

      <View style={styles.chipRow}>
        {ACTIONS.map((action) => {
          const selected = activeAction === action.key;
          return (
            <Button
              key={action.key}
              variant={selected ? 'primary' : 'glass'}
              title={action.label}
              onPress={() => handleActionPress(action)}
              disabled={busy}
              style={styles.chip}
            />
          );
        })}
      </View>

      {activeMeta && (
        <View style={{ gap: tokens.spacing.sm }}>
          <TextInput
            style={[
              styles.input,
              { borderColor: palette.border, borderRadius: tokens.radii.md, color: palette.text },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder={activeMeta.placeholder}
            placeholderTextColor={palette.textMuted}
            editable={!busy}
            onSubmitEditing={handleSubmitInput}
            returnKeyType="go"
            autoFocus
          />
          <Button title={`Confirmar "${activeMeta.label}"`} onPress={handleSubmitInput} disabled={busy || !input.trim()} />
        </View>
      )}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text variant="caption">Falando com o ELYSIUM...</Text>
        </View>
      )}

      {log.length === 0 && !busy && (
        <Card style={styles.center}>
          <Feather name="sliders" size={22} color={palette.textMuted} />
          <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm, textAlign: 'center' }}>
            Nenhuma ação ainda — toca num botão acima pra começar.
          </Text>
        </Card>
      )}

      {log.length > 0 && (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="label" color={palette.textMuted}>
            Histórico recente
          </Text>
          {log.map((entry) => (
            <Card key={entry.id} style={{ gap: tokens.spacing.xs }}>
              <Text variant="caption" color={palette.textMuted}>
                {new Date(entry.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · "{entry.command}"
              </Text>
              <Text variant="body" color={entry.error ? palette.error : palette.text}>
                {entry.error ? `Falha: ${entry.error}` : entry.reply}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexGrow: 1 },
  center: { alignItems: 'center', paddingVertical: 24 },
});
