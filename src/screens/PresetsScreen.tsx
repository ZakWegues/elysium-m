import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Pairing } from '../lib/pairing';
import { sendCommand } from '../lib/api';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function PresetsScreen({ pairing, onBack }: { pairing: Pairing; onBack: () => void }) {
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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>‹ Chat</Text>
        </Pressable>
        <Text style={styles.title}>Presets</Text>
        <View style={styles.backSpacer} />
      </View>

      <Pressable style={styles.actionButton} onPress={handleList} disabled={busy}>
        <Text style={styles.actionButtonText}>Listar presets</Text>
      </Pressable>

      <View style={styles.runRow}>
        <TextInput
          style={styles.input}
          value={presetName}
          onChangeText={setPresetName}
          placeholder="Nome do preset"
          editable={!busy}
          onSubmitEditing={handleRun}
          returnKeyType="go"
        />
        <Pressable style={styles.actionButton} onPress={handleRun} disabled={busy || !presetName.trim()}>
          <Text style={styles.actionButtonText}>Executar</Text>
        </Pressable>
      </View>

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.busyText}>Falando com o NeuroAxis...</Text>
        </View>
      )}

      {reply && (
        <View style={styles.replyBox}>
          <Text style={styles.replyText}>{reply}</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Falha: {error}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: '#4da3ff', fontSize: 16 },
  backSpacer: { width: 44 },
  title: { fontSize: 18, fontWeight: '600' },
  actionButton: {
    backgroundColor: '#4da3ff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontWeight: '600' },
  runRow: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  busyText: { color: '#666' },
  replyBox: { backgroundColor: '#eee', borderRadius: 12, padding: 16 },
  replyText: { color: '#000', fontSize: 15 },
  errorBox: { backgroundColor: '#f8d7da', borderRadius: 12, padding: 16 },
  errorText: { color: '#611a15' },
});
