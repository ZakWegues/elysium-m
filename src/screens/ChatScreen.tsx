import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Pressable, StyleProp,
  StyleSheet, TextInput, View, ViewStyle,
} from 'react-native';
import * as Speech from 'expo-speech';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fromByteArray } from 'base64-js';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError, sendCommand } from '../lib/api';
import { TimeoutError } from '../lib/http';
import { enqueueCommand } from '../lib/commandQueue';
import { openVoiceConnection, VoiceConnection } from '../lib/stream';
import { callRpc } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { MAILBOX_MAX_ATTACHMENT_BYTES, sendMessage } from '../lib/mailbox';
import CameraAsk from './CameraAsk';
import { deriveTitle, listSessions, saveSession, StoredMessage } from '../lib/chatHistoryStore';
import { MOV, anima } from '../lib/motion';
import { useTheme } from '../theme';
import { GlassCircle, GlassFill, ScreenHeader, Text } from '../components/ui';

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
  /**
   * Perguntas de partida. Sorteadas no desktop (`perguntas.ts`) — as que você repete vêm
   * primeiro, curadas preenchem o resto. Sortear aqui também daria duas heurísticas para
   * manter em par, e só o PC vê o que você pergunta.
   */
  const [starters, setStarters] = useState<string[]>([]);
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

  /**
   * Mesma correção do lado dos recados: ancorar pelo tamanho do conteúdo, não pela
   * contagem de mensagens. Abrir uma conversa antiga pelo histórico caía no meio dela,
   * porque na hora do efeito a `FlatList` ainda não tinha medido as bolhas. Ver o
   * comentário longo em `MailboxScreen.tsx`.
   */
  const jaAncorou = useRef(false);
  const coladoNoFim = useRef(true);

  // Abrir OUTRA conversa precisa ancorar de novo — senão a segunda abre na posição da
  // primeira, que é o mesmo sintoma com outra causa.
  useEffect(() => { jaAncorou.current = false; coladoNoFim.current = true; }, [sessionId]);

  const aoCrescerConteudo = useCallback(() => {
    if (!jaAncorou.current) {
      listRef.current?.scrollToEnd({ animated: false });
      jaAncorou.current = true;
      return;
    }
    if (coladoNoFim.current) listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Recarrega ao montar a tela: entrar no Chat re-sorteia, como no desktop.
  useEffect(() => {
    let vivo = true;
    callRpc(pairing, "chat.starters")
      .then(r => { if (vivo) setStarters(r.starters ?? []); })
      .catch(() => { /* sem PC, sem bolhas — a tela funciona igual */ });
    return () => { vivo = false; };
  }, [pairing]);

  function speakReply(reply: string) {
    Speech.speak(reply, { language: 'pt-BR' });
  }

  async function handleSend(texto?: string) {
    const text = (texto ?? draft).trim();
    if (!text || sending) return;
    setDraft('');
    setStarters([]);   // a fileira só faz sentido enquanto a tela está em branco
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

  /**
   * Anexar arquivo — o mesmo botão dos dois lados do switch.
   *
   * O arquivo viaja pelo MESMO caminho do lado do PC (`mailbox`), porque é lá que um
   * anexo tem onde chegar: o `sendCommand` da IA leva texto e devolve texto. O que muda é
   * só o ponto de partida, e a bolha confirma para onde foi — sem isso o arquivo sumiria
   * numa conversa que não mostra anexo nenhum.
   */
  async function handleAnexar() {
    if (sending) return;
    const escolha = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: false,
    });
    if (escolha.canceled || !escolha.assets[0]) return;
    const asset = escolha.assets[0];

    setSending(true);
    try {
      const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
      if (bytes.byteLength > MAILBOX_MAX_ATTACHMENT_BYTES) {
        Alert.alert('Arquivo grande demais', 'Limite de 5MB por anexo.');
        return;
      }
      await sendMessage(pairing, {
        kind: 'file',
        attachment: {
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          base64: fromByteArray(bytes),
        },
      });
      const ts = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `file-${ts}`, from: 'me', text: `📎 ${asset.name}`, ts },
        { id: `file-ok-${ts + 1}`, from: 'reply', text: 'Arquivo entregue na caixa do PC.', ts: ts + 1 },
      ]);
    } catch (err) {
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }
      Alert.alert('Falha ao enviar o arquivo', errMessage(err));
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
        onContentSizeChange={aoCrescerConteudo}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          coladoNoFim.current =
            contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
        }}
        scrollEventThrottle={64}
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

      {/* Encostadas na barra de escrita, porque é de lá que a próxima mensagem sai. */}
      {starters.length > 0 && messages.length <= 1 && !sending && (
        <View style={[styles.starters, { paddingHorizontal: tokens.spacing.md }]}>
          {starters.map((t) => (
            <Pressable
              key={t}
              onPress={() => handleSend(t)}
              style={[styles.starter, {
                borderRadius: tokens.radii.full,
                borderColor: palette.glassBorder,
                backgroundColor: palette.primarySoft,
              }]}
            >
              <Text variant="caption" numberOfLines={1}>{t}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Encostadas na barra de escrita, porque é de lá que a próxima mensagem sai. */}
      {starters.length > 0 && messages.length <= 1 && !sending && (
        <View style={[styles.starters, { paddingHorizontal: tokens.spacing.md }]}>
          {starters.map((t) => (
            <Pressable
              key={t}
              onPress={() => handleSend(t)}
              style={[styles.starter, {
                borderRadius: tokens.radii.full,
                borderColor: palette.glassBorder,
                backgroundColor: palette.primarySoft,
              }]}
            >
              <Text variant="caption" numberOfLines={1}>{t}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* A barra em si é tinta chapada: ela acompanha a lista, e desfocar uma faixa
          inteira por quadro é o custo que este bloco foi tirar da rolagem. Os BOTÕES é
          que viram vidro de verdade — são três regiões de 44 px, fixas. */}
      <View style={{ overflow: 'hidden' }}>
        <GlassFill intensity={40} strong edge={false} blur={false} />
        <View
          style={[
            styles.inputRow,
            { padding: tokens.spacing.md, borderTopColor: palette.glassBorder },
          ]}
        >
        <GlassCircle size={40} onPress={() => setCameraOpen(true)} disabled={sending}>
          <Feather name="camera" size={20} color={palette.primary} />
        </GlassCircle>
        {/* Anexar fica à esquerda, colado na câmera, nos DOIS lados do switch: são os dois
            botões que trazem algo de fora para a conversa. */}
        <GlassCircle size={40} onPress={handleAnexar} disabled={sending}>
          <Feather name="paperclip" size={20} color={palette.primary} />
        </GlassCircle>
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
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
          editable={!sending}
        />
        <GlassCircle
          size={40}
          ativo={recording}
          onPressIn={handleRecordStart}
          onPressOut={handleRecordStop}
          disabled={sending || micStatus !== 'ready'}
        >
          <Feather
            name="mic"
            size={20}
            color={recording ? palette.error : micStatus !== 'ready' ? palette.textMuted : palette.primary}
          />
        </GlassCircle>
        <GlassCircle size={40} ativo onPress={() => handleSend()} disabled={sending}>
          <Feather name="arrow-up" size={20} color={palette.primary} />
        </GlassCircle>
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
  starters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, paddingBottom: 10 },
  starter: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%' },
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

});
