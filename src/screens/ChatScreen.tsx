import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleProp, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import AnimatedReanimated, {
  FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { falar, pararDeFalar } from '../lib/falar';
import { liberarMicrofone, ocuparMicrofone } from '../lib/microfone';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MotivoParada, resumoRodada } from '../lib/maoLivreDiag';
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
import { haptica } from '../lib/haptica';
import { MAILBOX_MAX_ATTACHMENT_BYTES, sendMessage } from '../lib/mailbox';
import CameraAsk from './CameraAsk';
import { deriveTitle, listSessions, saveSession, StoredMessage } from '../lib/chatHistoryStore';
import { MOV } from '../lib/motion';
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
  perguntaPendente,
  onPerguntaEnviada,
  pedidoVoz,
}: {
  pairing: Pairing;
  /**
   * "Elysium" ouvido pelo app (bloco 129): cada `n` novo entra na mão livre; com `texto`,
   * ele é o primeiro pedido (o que veio colado na palavra).
   */
  pedidoVoz?: { n: number; texto: string } | null;
  /** Texto que a busca da Início pediu para enviar. Enviado uma vez, ao chegar. */
  perguntaPendente?: string | null;
  onPerguntaEnviada?: () => void;
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
  /** Id da bolha que está sendo escrita em pedaços; `null` fora de um stream. */
  const [escrevendoId, setEscrevendoId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  // Medição de nível ligada: é o que a conversa mão livre usa para saber quando a pessoa
  // parou de falar (bloco 89). No aperta-e-fala não muda nada.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  /** Conversa mão livre (bloco 89): grava → responde → volta a ouvir, sem tocar na tela. */
  const [maoLivre, setMaoLivre] = useState(false);
  const [faseMaoLivre, setFaseMaoLivre] = useState<'ouvindo' | 'pensando' | 'falando' | null>(null);
  const maoLivreRef = useRef(false);
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
    // A voz neural do PC quando der; a do aparelho quando não (bloco 85).
    falar(reply, pairing);
  }

  // Pergunta vinda da busca da Início. Limpa ANTES de enviar: se o envio falhar e o
  // componente remontar, a pergunta não pode ser disparada de novo sozinha.
  useEffect(() => {
    if (!perguntaPendente) return;
    const texto = perguntaPendente;
    onPerguntaEnviada?.();
    handleSend(texto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perguntaPendente]);

  /**
   * A resposta chega em pedaços pelo WebSocket (bloco 59). O primeiro pedaço cria a bolha
   * e os seguintes só trocam o texto dela — a bolha é a mesma, então nada pula. Devolve
   * uma função que recebe o texto acumulado.
   */
  function bolhaEmPedacos(): { onChunk: (parcial: string) => void; fechar: (texto: string) => void; comecou: () => boolean } {
    const id = `reply-${Date.now()}`;
    let criada = false;
    const onChunk = (parcial: string) => {
      if (!criada) {
        criada = true;
        setEscrevendoId(id);
        setMessages((prev) => [...prev, { id, from: 'reply', text: parcial, ts: Date.now() }]);
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: parcial } : m)));
    };
    const fechar = (texto: string) => {
      setEscrevendoId(null);
      if (criada) setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: texto } : m)));
      else setMessages((prev) => [...prev, { id, from: 'reply', text: texto, ts: Date.now() }]);
    };
    return { onChunk, fechar, comecou: () => criada };
  }

  async function handleSend(texto?: string) {
    const text = (texto ?? draft).trim();
    if (!text || sending) return;
    setDraft('');
    setStarters([]);   // a fileira só faz sentido enquanto a tela está em branco
    setMessages((prev) => [...prev, { id: `me-${Date.now()}`, from: 'me', text, ts: Date.now() }]);
    setSending(true);

    const bolha = bolhaEmPedacos();
    try {
      // WebSocket primeiro: é o único caminho que traz a resposta em pedaços. Se ele não
      // abrir (PC de pé mas WS bloqueado, por exemplo), o HTTP de sempre continua valendo
      // — resposta inteira de uma vez, como antes do bloco 59.
      let reply: string;
      try {
        // Cinco segundos para o WS abrir. Com o PC fora do ar o handshake pode levar o
        // timeout do TCP inteiro; o HTTP abaixo já sabe lidar com isso (fila offline).
        const conn = await Promise.race([
          ensureVoiceConnection(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('WebSocket demorou a abrir')), 5000)),
        ]);
        reply = (await conn.sendText(text, bolha.onChunk)).reply;
      } catch (wsErr) {
        // Só cai no HTTP se o PC não chegou a responder NADA: com pedaços já na tela o
        // comando já rodou lá, e mandar de novo abriria o programa duas vezes.
        if (bolha.comecou()) throw wsErr;
        console.warn('[chat] WS indisponível, caindo no HTTP', errMessage(wsErr));
        reply = await sendCommand(pairing, text);
      }
      bolha.fechar(reply);
      speakReply(reply);
    } catch (err) {
      setEscrevendoId(null);
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

    // Bloco 129: tira o reconhecedor do "Elysium" do microfone ANTES de preparar o gravador.
    ocuparMicrofone('gravar');
    await new Promise((r) => setTimeout(r, 150));
    try {
      await recorder.prepareToRecordAsync();
    } catch (err) {
      liberarMicrofone('gravar');
      pushError(`Falha ao preparar gravação: ${errMessage(err)}`);
      return;
    }

    try {
      recorder.record();
    } catch (err) {
      liberarMicrofone('gravar');
      pushError(`Falha ao iniciar gravação: ${errMessage(err)}`);
      return;
    }

    // O dedo já está no botão e o olho na tela: a vibração é o "pode falar" que não
    // exige olhar para o mic.
    haptica.medio();
    setRecording(true);
  }

  async function handleRecordStop() {
    if (!recording) return;
    haptica.leve();
    setRecording(false);

    try {
      await recorder.stop();
    } catch (err) {
      pushError(`Falha ao parar gravação: ${errMessage(err)}`);
      return;
    } finally {
      liberarMicrofone('gravar');
    }

    const uri = recorder.uri;
    if (!uri) {
      pushError('Falha ao ler o áudio gravado: uri vazia após stop()');
      return;
    }
    const r = await enviarAudio(uri);
    if (r) speakReply(r.reply);
  }

  /** Manda um áudio gravado e escreve a resposta em pedaços. Devolve null se falhou. */
  async function enviarAudio(uri: string): Promise<{ reply: string; transcricao: string } | null> {
    setSending(true);
    setMessages((prev) => [...prev, { id: `me-audio-${Date.now()}`, from: 'me', text: '🎤 (áudio)', ts: Date.now() }]);
    let transcricao = '';
    try {
      const conn = await ensureVoiceConnection();
      const bolha = bolhaEmPedacos();
      // A transcrição chega ANTES do primeiro pedaço, então a bolha "me" entra na ordem
      // certa — antes da resposta que vai começar a ser escrita logo depois.
      const { reply } = await conn.sendAudio(uri, bolha.onChunk, (transcript) => {
        transcricao = transcript;
        setMessages((prev) => [...prev, { id: `transcript-${Date.now()}`, from: 'me', text: transcript, ts: Date.now() }]);
      });
      bolha.fechar(reply);
      return { reply, transcricao };
    } catch (err) {
      setEscrevendoId(null);
      pushError(errMessage(err));
      return null;
    } finally {
      setSending(false);
    }
  }

  // ── Mão livre (bloco 89) ──────────────────────────────────────────────────
  // Nível em dBFS do expo-audio: fala perto do celular fica entre −30 e −10; um quarto
  // silencioso, abaixo de −50. Os dois limiares com folga entre si evitam que um ruído no
  // meio do caminho fique alternando "falou"/"calou".
  const LIMIAR_FALA_DB = -38;
  const LIMIAR_SILENCIO_DB = -46;
  const SILENCIO_PARA_FECHAR_MS = 1300;
  const ESPERA_SEM_FALA_MS = 20_000;
  const TETO_GRAVACAO_MS = 30_000;
  // Só frases de encerrar, nunca "para" sozinho: "para a música" é um pedido, não um tchau.
  const FRASES_DE_PARAR = /^\W*(chega|pode parar|tchau|at[eé] mais|obrigad[oa],? (é|e) s[oó]|encerrar|desliga (a )?m[aã]o livre)(?=\W|$)/i;

  /**
   * Grava até a pessoa falar e calar. `uri` null = ninguém falou em 20 s (ou mão livre
   * desligou). Os níveis e o motivo de parar voltam junto para o diagnóstico (bloco 116).
   */
  async function gravarAteSilencio(): Promise<{ uri: string | null; niveis: number[]; inicio: number; primeiraFalaEm: number | null; fim: number; motivo: MotivoParada }> {
    await recorder.prepareToRecordAsync();
    recorder.record();
    const inicio = Date.now();
    let falou = false;
    let ultimaVoz = 0;
    let primeiraFalaEm: number | null = null;
    let motivo: MotivoParada = 'desligou';
    const niveis: number[] = [];
    try {
      while (maoLivreRef.current) {
        await new Promise((r) => setTimeout(r, 120));
        const nivel = recorder.getStatus().metering ?? -160;
        niveis.push(nivel);
        const agora = Date.now();
        if (nivel > LIMIAR_FALA_DB) { if (!falou) primeiraFalaEm = agora; falou = true; ultimaVoz = agora; }
        else if (falou && nivel > LIMIAR_SILENCIO_DB) ultimaVoz = agora;
        if (falou && agora - ultimaVoz > SILENCIO_PARA_FECHAR_MS) { motivo = 'silencio'; break; }
        if (!falou && agora - inicio > ESPERA_SEM_FALA_MS) { motivo = 'sem_fala'; break; }
        if (agora - inicio > TETO_GRAVACAO_MS) { motivo = 'teto'; break; }
      }
    } finally {
      try { await recorder.stop(); } catch { /* já parado */ }
    }
    return { uri: falou && maoLivreRef.current ? recorder.uri : null, niveis, inicio, primeiraFalaEm, fim: Date.now(), motivo };
  }

  /** Pedido falado que já veio em texto (colado no "Elysium"): mesma conversa, sem gravar. */
  async function enviarTextoFalado(texto: string): Promise<string | null> {
    setSending(true);
    setMessages((prev) => [...prev, { id: `me-voz-${Date.now()}`, from: 'me', text: texto, ts: Date.now() }]);
    try {
      const conn = await ensureVoiceConnection();
      const bolha = bolhaEmPedacos();
      const { reply } = await conn.sendText(texto, bolha.onChunk);
      bolha.fechar(reply);
      return reply;
    } catch (err) {
      setEscrevendoId(null);
      pushError(errMessage(err));
      return null;
    } finally {
      setSending(false);
    }
  }

  async function cicloMaoLivre(primeiroPedido?: string) {
    const linhas: string[] = [];
    let numero = 0;
    ocuparMicrofone('mao-livre');
    // O reconhecedor do "Elysium" acabou de ser abortado; um respiro para ele soltar o microfone.
    await new Promise((r) => setTimeout(r, 300));
    if (primeiroPedido) {
      setFaseMaoLivre('pensando');
      const reply = await enviarTextoFalado(primeiroPedido);
      if (reply && maoLivreRef.current && !FRASES_DE_PARAR.test(primeiroPedido)) {
        setFaseMaoLivre('falando');
        await falar(reply, pairing);
      } else {
        maoLivreRef.current = false;
      }
    }
    while (maoLivreRef.current) {
      setFaseMaoLivre('ouvindo');
      haptica.leve();
      let g: Awaited<ReturnType<typeof gravarAteSilencio>>;
      try { g = await gravarAteSilencio(); }
      catch (err) { pushError(`Mão livre: ${errMessage(err)}`); break; }
      numero++;
      if (!maoLivreRef.current || !g.uri) {
        linhas.push(resumoRodada({ numero, ...g, caracteres: null }));
        if (maoLivreRef.current) pushError('Ninguém falou em 20 s — mão livre desligada.');
        break;
      }
      setFaseMaoLivre('pensando');
      const r = await enviarAudio(g.uri);
      linhas.push(resumoRodada({ numero, ...g, caracteres: r ? r.transcricao.trim().length : null }));
      if (!r || !maoLivreRef.current) break;
      if (FRASES_DE_PARAR.test(r.transcricao.trim())) break;
      setFaseMaoLivre('falando');
      await falar(r.reply, pairing);
    }
    maoLivreRef.current = false;
    setMaoLivre(false);
    setFaseMaoLivre(null);
    liberarMicrofone('mao-livre');
    // Para o log do PC (bloco 116). Melhor esforço: sem PC, a calibragem só perde esta conversa.
    if (linhas.length) callRpc(pairing, 'diag.registrar', { origem: 'mao-livre', linhas }).catch(() => {});
  }

  function alternarMaoLivre() {
    if (maoLivreRef.current) {
      maoLivreRef.current = false;
      pararDeFalar();
      haptica.leve();
      return;
    }
    if (micStatus !== 'ready') {
      Alert.alert('Microfone indisponível', 'Permissão de microfone não foi concedida.');
      return;
    }
    maoLivreRef.current = true;
    setMaoLivre(true);
    haptica.medio();
    cicloMaoLivre();
  }

  // Sair da tela (ou trocar de conversa) desliga a mão livre: microfone aberto sem ninguém
  // olhando para a tela é exatamente o que ninguém quer.
  useEffect(() => () => { maoLivreRef.current = false; pararDeFalar(); liberarMicrofone('mao-livre'); liberarMicrofone('gravar'); }, []);

  // "Elysium" ouvido (bloco 129): entra na mão livre — e, se o pedido veio colado, ele é a
  // primeira rodada. Um respiro antes de gravar: o reconhecedor acabou de soltar o microfone.
  const ultimoPedidoVoz = useRef(0);
  useEffect(() => {
    if (!pedidoVoz || pedidoVoz.n === ultimoPedidoVoz.current) return;
    ultimoPedidoVoz.current = pedidoVoz.n;
    if (maoLivreRef.current || micStatus !== 'ready') return;
    const texto = pedidoVoz.texto.trim();
    const t = setTimeout(() => {
      maoLivreRef.current = true;
      setMaoLivre(true);
      haptica.medio();
      cicloMaoLivre(texto || undefined);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoVoz?.n, micStatus]);

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

      {sending && !escrevendoId && <BolhaPensando />}

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

      {maoLivre && (
        <View style={[styles.faixaMaoLivre, { backgroundColor: palette.primarySoft, borderColor: palette.glassBorder }]}>
          <Feather name={faseMaoLivre === 'falando' ? 'volume-2' : faseMaoLivre === 'pensando' ? 'loader' : 'mic'} size={15} color={palette.primary} />
          <Text variant="caption" color={palette.primary} style={{ flex: 1 }}>
            {faseMaoLivre === 'falando' ? 'Respondendo…' : faseMaoLivre === 'pensando' ? 'Pensando…' : 'Mão livre — pode falar. Diga "chega" para parar.'}
          </Text>
          <Pressable onPress={alternarMaoLivre} hitSlop={10}>
            <Feather name="x" size={16} color={palette.primary} />
          </Pressable>
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
          pulsando={recording}
          onPressIn={handleRecordStart}
          onPressOut={handleRecordStop}
          disabled={sending || micStatus !== 'ready' || maoLivre}
        >
          <Feather
            name="mic"
            size={20}
            color={recording ? palette.error : micStatus !== 'ready' ? palette.textMuted : palette.primary}
          />
        </GlassCircle>
        {/* Com o campo vazio, o botão de enviar vira o da conversa mão livre (bloco 89):
            não há o que enviar, e o gesto "falar sem segurar" mora perto do microfone. */}
        {draft.trim() || sending ? (
          <GlassCircle size={40} ativo onPress={() => handleSend()} disabled={sending}>
            <Feather name="arrow-up" size={20} color={palette.primary} />
          </GlassCircle>
        ) : (
          <GlassCircle size={40} ativo={maoLivre} pulsando={maoLivre && faseMaoLivre === 'ouvindo'} onPress={alternarMaoLivre} disabled={micStatus !== 'ready'}>
            <Feather name="headphones" size={19} color={maoLivre ? palette.error : palette.primary} />
          </GlassCircle>
        )}
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
          falar(answer, pairing);
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
  return (
    <AnimatedReanimated.View
      entering={FadeInDown.withInitialValues({ transform: [{ translateY: 6 }] })
        .duration(MOV.base)
        .reduceMotion(ReduceMotion.System)}
      style={style}
    >
      {children}
    </AnimatedReanimated.View>
  );
}

/**
 * "Digitando…" de app de mensagem: três pontos que sobem em sequência, numa bolha do
 * lado da resposta. Substitui o spinner com "Pensando..." solto no rodapé, que ficava
 * fora da conversa e não dizia de onde a resposta ia sair.
 *
 * Depois de 6 s a bolha explica a demora: o `llama3.1:8b` recarrega em ~18 s a frio
 * (§22, bloco 41), e sem uma palavra na tela esse intervalo parece o app travado.
 */
function BolhaPensando() {
  const { palette, tokens } = useTheme();
  const [demorando, setDemorando] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDemorando(true), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.sm }}>
      <AnimatedReanimated.View
        entering={FadeInDown.duration(MOV.base).reduceMotion(ReduceMotion.System)}
        style={[
          styles.pensando,
          {
            borderRadius: tokens.radii.lg,
            backgroundColor: palette.surfaceRaised,
            borderColor: palette.border,
            paddingHorizontal: tokens.spacing.md,
          },
        ]}
      >
        {[0, 1, 2].map(i => <Ponto key={i} atraso={i * 160} cor={palette.textMuted} />)}
        {demorando && (
          <Text variant="caption" color={palette.textMuted} style={{ marginLeft: 6 }}>
            acordando o cérebro…
          </Text>
        )}
      </AnimatedReanimated.View>
    </View>
  );
}

function Ponto({ atraso, cor }: { atraso: number; cor: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(atraso, withRepeat(
      withSequence(withTiming(-4, { duration: 260 }), withTiming(0, { duration: 260 }), withTiming(0, { duration: 280 })),
      -1,
    ));
  }, [atraso, y]);
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <AnimatedReanimated.View style={[styles.ponto, { backgroundColor: cor }, estilo]} />;
}

const styles = StyleSheet.create({
  faixaMaoLivre: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  bubble: { maxWidth: '80%' },
  pensando: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 38, borderWidth: StyleSheet.hairlineWidth,
  },
  ponto: { width: 7, height: 7, borderRadius: 4 },
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




