import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Pressable, StyleProp,
  StyleSheet, TextInput, View, ViewStyle,
} from 'react-native';
import * as Speech from 'expo-speech';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError, sendCommand } from '../lib/api';
import { TimeoutError } from '../lib/http';
import { enqueueCommand } from '../lib/commandQueue';
import { openVoiceConnection, VoiceConnection } from '../lib/stream';
import { errMessage } from '../lib/errors';
import CameraAsk from './CameraAsk';
import { deriveTitle, listSessions, saveSession, StoredMessage } from '../lib/chatHistoryStore';
import { MOV, anima } from '../lib/motion';
import { useTheme } from '../theme';
import { GlassFill, ScreenHeader, Text } from '../components/ui';

type MicStatus = 'checking' | 'ready' | 'denied';

export default function ChatScreen({
  pairing,
  onUnpair,
  sessionId,
  onSessionChange,
  onOpenConversations,
  semCabecalho,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  sessionId: string | null;
  onSessionChange: (id: string) => void;
  onOpenConversations: () => void;
  /** Dentro do ChatHub o cabeçalho é do hub, com o switch IA ↔ PC. */
  semCabecalho?: boolean;
}) {
  const { palette, tokens } = useTheme();
  const [messages, setMessages] = useState<StoredMessage[]>([
    { id: 'welcome', from: 'reply', text: `Pareado com ${pairing.activeIp}:${pairing.port}`, ts: Date.now() },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceConnRef = useRef<VoiceConnection | null>(null);
  const listRef = useRef<FlatList<StoredMessage>>(null);
  // Começa SEMPRE em null, mesmo recebendo um sessionId. Inicializar com a prop fazia a
  // guarda do efeito de carregamento bater já na montagem: abrir uma conversa antiga
  // pulava a leitura do storage, a tela aparecia só com a saudação, e a primeira
  // mensagem nova gravava por cima do histórico inteiro.
  const sessionIdRef = useRef<string | null>(null);
  const favoriteRef = useRef(false);
  const createdAtRef = useRef(Date.now());

  function pushError(text: string) {
    setMessages((prev) => [...prev, { id: `err-${Date.now()}`, from: 'error', text, ts: Date.now() }]);
  }

  // Carrega uma conversa diferente quando o usuário escolhe outra na tela de Conversas
  // (ou "+ Nova"). Se sessionId já bate com o que este componente controla, é uma
  // mudança que ele mesmo originou (ver efeito de persistência abaixo) - ignora pra não
  // recarregar do storage e sobrescrever mensagens recém-digitadas com uma versão velha.
  useEffect(() => {
    if (sessionId === sessionIdRef.current) return;

    (async () => {
      if (sessionId) {
        const sessions = await listSessions();
        const found = sessions.find((s) => s.id === sessionId);
        if (found) {
          sessionIdRef.current = found.id;
          favoriteRef.current = found.favorite;
          createdAtRef.current = found.createdAt;
          setMessages(found.messages);
          return;
        }
      }
      sessionIdRef.current = null;
      favoriteRef.current = false;
      createdAtRef.current = Date.now();
      setMessages([{ id: 'welcome', from: 'reply', text: `Pareado com ${pairing.activeIp}:${pairing.port}`, ts: Date.now() }]);
    })();
  }, [sessionId, pairing.activeIp, pairing.port]);

  useEffect(() => {
    const hasRealContent = messages.some((m) => m.id !== 'welcome');
    if (!hasRealContent) return;

    if (!sessionIdRef.current) {
      // Sufixo aleatório porque as conversas agora sincronizam: só o carimbo de tempo
      // colidiria se PC e celular criassem uma conversa no mesmo milissegundo, e o
      // merge trataria as duas como a mesma.
      sessionIdRef.current = `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      createdAtRef.current = Date.now();
      onSessionChange(sessionIdRef.current);
    }

    saveSession({
      id: sessionIdRef.current,
      title: deriveTitle(messages),
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      favorite: favoriteRef.current,
      messages,
    });
  }, [messages]);

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
    setMessages((prev) => [...prev, { id: `me-${Date.now()}`, from: 'me', text, ts: Date.now() }]);
    setSending(true);

    try {
      const reply = await sendCommand(pairing, text);
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, from: 'reply', text: reply, ts: Date.now() }]);
      speakReply(reply);
    } catch (err) {
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }

      // PC fora do ar: em vez de perder o comando, guarda pra reenviar quando voltar.
      // Erro de resposta do servidor (comando chegou e falhou lá) não entra na fila —
      // repetir não conserta.
      if (err instanceof TimeoutError || err instanceof TypeError) {
        await enqueueCommand(text);
        setMessages((prev) => [
          ...prev,
          { id: `queued-${Date.now()}`, from: 'reply', text: '⏳ PC fora do ar. Guardei esse comando e mando assim que ele voltar.', ts: Date.now() },
        ]);
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
    setMessages((prev) => [...prev, { id: `me-audio-${Date.now()}`, from: 'me', text: '🎤 (áudio)', ts: Date.now() }]);

    try {
      const conn = await ensureVoiceConnection();
      const { transcript, reply } = await conn.sendAudio(uri);
      if (transcript) {
        setMessages((prev) => [...prev, { id: `transcript-${Date.now()}`, from: 'me', text: transcript, ts: Date.now() }]);
      }
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, from: 'reply', text: reply, ts: Date.now() }]);
      speakReply(reply);
    } catch (err) {
      pushError(errMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    // O espaço do teclado é reservado uma vez só, na raiz do app (App.tsx). Aqui havia
    // um KeyboardAvoidingView que, somado àquele padding, deslocava a conversa duas
    // vezes — e que de todo modo não funciona no edge-to-edge do Android.
    <View style={{ flex: 1 }}>
      {!semCabecalho && (
        <ScreenHeader
          title="ELYSIUM-M"
          right={
            <Pressable onPress={onOpenConversations} hitSlop={8}>
              <Feather name="clock" size={22} color={palette.textMuted} />
            </Pressable>
          }
        />
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}
        renderItem={({ item }) => {
          const bg = item.from === 'me' ? palette.primary : item.from === 'error' ? palette.errorSoft : palette.surfaceRaised;
          const color = item.from === 'me' ? palette.onPrimary : item.from === 'error' ? palette.error : palette.text;
          return (
            <BolhaEntrando
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
            </BolhaEntrando>
          );
        }}
      />

      {sending && (
        <View style={[styles.sendingRow, { paddingHorizontal: tokens.spacing.lg }]}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text variant="caption">Pensando...</Text>
        </View>
      )}

      <View style={{ overflow: 'hidden' }}>
        <GlassFill intensity={65} strong edge={false} />
        <View
          style={[
            styles.inputRow,
            { padding: tokens.spacing.md, borderTopColor: palette.glassBorder },
          ]}
        >
        <Pressable
          style={[styles.roundButton, { backgroundColor: palette.primarySoft }]}
          onPress={() => setCameraOpen(true)}
          disabled={sending}
        >
          <Feather name="camera" size={20} color={palette.primary} />
        </Pressable>
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
      </View>

      <CameraAsk
        pairing={pairing}
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onAnswer={(question, answer) => {
          // A pergunta e a resposta entram como bolhas normais: para o histórico, uma
          // foto respondida é só mais um turno da conversa.
          const ts = Date.now();
          setMessages((prev) => [
            ...prev,
            { id: `me-${ts}`, from: 'me', text: `📷 ${question}`, ts },
            { id: `reply-${ts + 1}`, from: 'reply', text: answer, ts: ts + 1 },
          ]);
          Speech.speak(answer, { language: 'pt-BR' });
        }}
      />
    </View>
  );
}

/**
 * Bolha entrando: fade e 6px de subida. Mensagem aparecendo do nada, sobretudo a resposta
 * depois da espera, lê como salto — a subida curta dá a direção de onde ela veio.
 */
function BolhaEntrando({ style, children }: { style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opacidade = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(6)).current;
  useEffect(() => {
    Animated.parallel([anima(opacidade, 1, MOV.base), anima(y, 0, MOV.base)]).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity: opacidade, transform: [{ translateY: y }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
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
