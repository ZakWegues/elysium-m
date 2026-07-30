import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Pairing } from '../lib/pairing';
import { AuthError, sendCommand } from '../lib/api';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { Button, Card, ScreenHeader, Text } from '../components/ui';

export default function PresetsScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { palette, tokens } = useTheme();
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');

  async function runCommand(text: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await sendCommand(pairing, text);
      setReply(result);
      Speech.speak(result, { language: 'pt-BR' });
    } catch (err) {
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleList() {
    runCommand('lista os meus presets');
  }

  function handleRun() {
    const name = presetName.trim();
    if (!name) return;
    runCommand(`executa o preset ${name}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Presets" />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.lg }}>
        <Button title="Listar presets" onPress={handleList} loading={busy} />

        <View style={{ gap: tokens.spacing.sm }}>
          <TextInput
            style={[
              styles.input,
              { borderColor: palette.border, borderRadius: tokens.radii.md, color: palette.text },
            ]}
            value={presetName}
            onChangeText={setPresetName}
            placeholder="Nome do preset"
            placeholderTextColor={palette.textMuted}
            editable={!busy}
            onSubmitEditing={handleRun}
            returnKeyType="go"
          />
          <Button title="Executar" variant="secondary" onPress={handleRun} disabled={busy || !presetName.trim()} />
        </View>

        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text variant="caption">Falando com o NeuroAxis...</Text>
          </View>
        )}

        {reply && (
          <Card>
            <Text variant="body">{reply}</Text>
          </Card>
        )}

        {error && (
          <Card style={{ backgroundColor: palette.errorSoft, borderColor: palette.errorSoft }}>
            <Text variant="body" color={palette.error}>
              Falha: {error}
            </Text>
          </Card>
        )}
      </ScrollView>
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
});
