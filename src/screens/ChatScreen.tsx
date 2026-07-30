import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError, sendCommand } from '../lib/api';
import { openVoiceConnection, VoiceConnection } from '../lib/stream';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { ScreenHeader, Text } from '../components/ui';

type Message = { id: string; from: 'me' | 'reply' | 'error'; text: string };
type MicStatus = 'checking' | 'ready' | 'denied';

export default function ChatScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { palette, tokens } = useTheme();
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', from: 'reply', text: `Pareado com ${pairing.ip}:${pairing.port}` },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceConnRef = useRef<VoiceConnection | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

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

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

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
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }
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
      style={{ flex: 1, backgroundColor: palette.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScreenHeader title="NeuroAxis Portal" />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}
        renderItem={({ item }) => {
          const bg = item.from === 'me' ? palette.primary : item.from === 'error' ? palette.errorSoft : palette.surfaceRaised;
          const color = item.from === 'me' ? palette.onPrimary : item.from === 'error' ? palette.error : palette.text;
          return (
            <View
              style={[
                styles.bubble,
                {
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.md,
                  backgroundColor: bg,
                  alignSelf: item.from === 'me' ? 'flex-end' : 'flex-start',
                  borderWidth: item.from === 'reply' ? StyleSheet.hairlineWidth : 0,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text variant="body" color={color}>
                {item.text}
              </Text>
            </View>
          );
        }}
      />

      {sending && (
        <View style={[styles.sendingRow, { paddingHorizontal: tokens.spacing.lg }]}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text variant="caption">Pensando...</Text>
        </View>
      )}

      <View
        style={[
          styles.inputRow,
          { padding: tokens.spacing.md, borderTopColor: palette.border, backgroundColor: palette.surface },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              borderColor: palette.border,
              borderRadius: tokens.radii.full,
              paddingHorizontal: tokens.spacing.lg,
              color: palette.text,
            },
          ]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreve um comando..."
          placeholderTextColor={palette.textMuted}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
        />
        <Pressable
          style={[
            styles.roundButton,
            {
              backgroundColor: recording ? palette.error : micStatus !== 'ready' ? palette.border : palette.primarySoft,
            },
          ]}
          onPressIn={handleRecordStart}
          onPressOut={handleRecordStop}
          disabled={sending || micStatus !== 'ready'}
        >
          <Feather name="mic" size={20} color={recording ? '#fff' : micStatus !== 'ready' ? palette.textMuted : palette.primary} />
        </Pressable>
        <Pressable
          style={[styles.roundButton, { backgroundColor: palette.primary, opacity: sending ? 0.5 : 1 }]}
          onPress={handleSend}
          disabled={sending}
        >
          <Feather name="arrow-up" size={20} color={palette.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
