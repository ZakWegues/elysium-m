import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Pairing } from '../lib/pairing';
import { sendCommand } from '../lib/api';
import { openVoiceConnection, VoiceConnection } from '../lib/stream';

type Message = { id: string; from: 'me' | 'reply' | 'error'; text: string };
type MicStatus = 'checking' | 'ready' | 'denied';

export default function ChatScreen({
  pairing,
  onUnpair,
  onOpenTelemetry,
  onOpenPresets,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  onOpenTelemetry: () => void;
  onOpenPresets: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', from: 'reply', text: `Pareado com ${pairing.ip}:${pairing.port}` },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceConnRef = useRef<VoiceConnection | null>(null);

  function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function pushError(text: string) {
    setMessages((prev) => [...prev, { id: `err-${Date.now()}`, from: 'error', text }]);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let perm;
      try {
        perm = await requestRecordingPermissionsAsync();
      } catch (err) {
        if (!cancelled) {
          setMicStatus('denied');
          pushError(`Falha na permissão: ${errMessage(err)}`);
        }
        return;
      }
      if (cancelled) return;
      if (!perm.granted) {
        setMicStatus('denied');
        return;
      }

      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch (err) {
        if (!cancelled) {
          setMicStatus('denied');
          pushError(`Falha no audio mode: ${errMessage(err)}`);
        }
        return;
      }

      if (!cancelled) setMicStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      voiceConnRef.current?.close();
      voiceConnRef.current = null;
    };
  }, []);

  async function ensureVoiceConnection(): Promise<VoiceConnection> {
    if (voiceConnRef.current) return voiceConnRef.current;
    const conn = openVoiceConnection(pairing, () => {
      if (voiceConnRef.current === conn) voiceConnRef.current = null;
    });
    voiceConnRef.current = conn;
    try {
      await conn.ready;
    } catch (err) {
      if (voiceConnRef.current === conn) voiceConnRef.current = null;
      throw err;
    }
    return conn;
  }

  function speakReply(reply: string) {
    Speech.speak(reply, { language: 'pt-BR' });
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: `me-${Date.now()}`, from: 'me', text }]);
    setSending(true);

    try {
      const reply = await sendCommand(pairing, text);
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, from: 'reply', text: reply }]);
      speakReply(reply);
    } catch (err) {
      pushError(`Falha: ${errMessage(err)}`);
    } finally {
      setSending(false);
    }
  }

  async function handleRecordStart() {
    if (sending || recording) return;
    if (micStatus !== 'ready') {
      Alert.alert('Microfone indisponível', 'Permissão de microfone não foi concedida.');
      return;
    }

    try {
      await recorder.prepareToRecordAsync();
    } catch (err) {
      pushError(`Falha ao preparar gravação: ${errMessage(err)}`);
      return;
    }

    try {
      recorder.record();
    } catch (err) {
      pushError(`Falha ao iniciar gravação: ${errMessage(err)}`);
      return;
    }

    setRecording(true);
  }

  async function handleRecordStop() {
    if (!recording) return;
    setRecording(false);

    try {
      await recorder.stop();
    } catch (err) {
      pushError(`Falha ao parar gravação: ${errMessage(err)}`);
      return;
    }

    const uri = recorder.uri;
    if (!uri) {
      pushError('Falha ao ler o áudio gravado: uri vazia após stop()');
      return;
    }

    setSending(true);
    setMessages((prev) => [...prev, { id: `me-audio-${Date.now()}`, from: 'me', text: '🎤 (áudio)' }]);

    try {
      const conn = await ensureVoiceConnection();
      const { transcript, reply } = await conn.sendAudio(uri);
      if (transcript) {
        setMessages((prev) => [...prev, { id: `transcript-${Date.now()}`, from: 'me', text: transcript }]);
      }
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, from: 'reply', text: reply }]);
      speakReply(reply);
    } catch (err) {
      pushError(errMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>NeuroAxis Portal</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onOpenPresets}>
            <Text style={styles.telemetryLink}>Presets</Text>
          </Pressable>
          <Pressable onPress={onOpenTelemetry}>
            <Text style={styles.telemetryLink}>Telemetria</Text>
          </Pressable>
          <Pressable onPress={onUnpair}>
            <Text style={styles.unpair}>Desparear</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.from === 'me' && styles.bubbleMe,
              item.from === 'reply' && styles.bubbleReply,
              item.from === 'error' && styles.bubbleError,
            ]}
          >
            <Text style={item.from === 'me' ? styles.bubbleTextMe : styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      {sending && (
        <View style={styles.sendingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.sendingText}>Pensando...</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreve um comando..."
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
        />
        <Pressable
          style={[styles.micButton, recording && styles.micButtonActive, micStatus !== 'ready' && styles.micButtonDisabled]}
          onPressIn={handleRecordStart}
          onPressOut={handleRecordStop}
          disabled={sending || micStatus !== 'ready'}
        >
          <Text style={styles.sendButtonText}>{recording ? '●' : '🎤'}</Text>
        </Pressable>
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  headerText: { fontSize: 18, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  telemetryLink: { color: '#4da3ff', fontSize: 14 },
  unpair: { color: '#c0392b', fontSize: 14 },
  list: { padding: 16, gap: 8 },
  bubble: { borderRadius: 12, padding: 12, maxWidth: '80%', backgroundColor: '#eee', alignSelf: 'flex-start' },
  bubbleMe: { backgroundColor: '#4da3ff', alignSelf: 'flex-end' },
  bubbleReply: { backgroundColor: '#eee' },
  bubbleError: { backgroundColor: '#f8d7da' },
  bubbleText: { color: '#000' },
  bubbleTextMe: { color: '#fff' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sendingText: { color: '#666' },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  micButton: {
    backgroundColor: '#888',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: '#c0392b' },
  micButtonDisabled: { backgroundColor: '#ccc' },
  sendButton: {
    backgroundColor: '#4da3ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
