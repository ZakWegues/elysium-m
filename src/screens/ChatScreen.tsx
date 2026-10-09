import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Linking, Pressable, StyleProp, StyleSheet, TextInput, ToastAndroid, View, ViewStyle } from 'react-native';
import AnimatedReanimated, {
  FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { abrirFalaAntecipada, falaAntecipadaLigada, falar, FalaAntecipada, lerRespostasEscritas, pararDeFalar } from '../lib/falar';
import { criarFatiador, restoParaFalar } from '../lib/fatiadorDeFrases';
import { criarAdiador, gravacaoCurta } from '../lib/adiador';
import { emFluxoExterno } from '../lib/atualizacaoOta';
import { useAbaAtiva } from '../components/AbaViva';
import { liberarMicrofone, ocuparMicrofone } from '../lib/microfone';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MotivoParada, resumoRodada } from '../lib/vozDiag';
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
import { deriveTitle, Fonte, listSessions, saveSession, StoredMessage } from '../lib/chatHistoryStore';
import { MOV } from '../lib/motion';
import { useTheme } from '../theme';
import { GlassCircle, GlassFill, ScreenHeader, Text } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { paraFala, textoPuro } from '../lib/markdown';
import * as Clipboard from 'expo-clipboard';
import { avisarTokenRecusado } from '../lib/erroRpc';
import { VozAoVivo } from '../components/VozAoVivo';

/** Primeiro balão (fase 16, a persona da Ely): era "Pareado com IP:porta", detalhe técnico
 * que ninguém precisava ler ao abrir o chat. O endereço continua em Ajustes → Sobre. */
const BOAS_VINDAS = "Sistemas no ar. Pode pedir — escrevendo, segurando o microfone ou dizendo \"Ely\".";

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
  falaDaEly,
  onFalaDaElyMostrada,
  pedidoVoz,
  onPedidoVozTratado,
}: {
  pairing: Pairing;
  /**
   * "Ely" ouvido pelo app (bloco 129): cada `n` novo vale um pedido por voz; com `texto`,
   * ele é o próprio pedido (o que veio colado na palavra).
   */
  pedidoVoz?: { n: number; texto: string } | null;
  /** Avisa o App que o pedido de voz foi tratado — ele limpa, e remontar o Chat não repete. */
  onPedidoVozTratado?: () => void;
  /** Texto que a busca da Início pediu para enviar. Enviado uma vez, ao chegar. */
  perguntaPendente?: string | null;
  onPerguntaEnviada?: () => void;
  /** Bloco 191: uma pergunta da Ely ("como foi a prova?") que entra como bolha dela. */
  falaDaEly?: string | null;
  onFalaDaElyMostrada?: () => void;
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
  /** Próximas perguntas sugeridas pelo PC depois da última resposta escrita (bloco 132). */
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [messages, setMessages] = useState<StoredMessage[]>([
    { id: 'welcome', from: 'reply', text: BOAS_VINDAS, ts: Date.now() },
  ]);
  const [draft, setDraft] = useState('');
  /**
   * "/" no começo da mensagem lista os comandos de IA (bloco 137): "/Corrigir português
   * texto…" manda só o texto para o comando, sem passar pela conversa.
   */
  const [comandosIa, setComandosIa] = useState<{ id: string; nome: string }[] | null>(null);
  const barra = draft.startsWith('/') ? draft.slice(1).toLowerCase() : null;
  const comandoEscolhido = barra !== null ? comandosIa?.find(c => barra.startsWith(c.nome.toLowerCase() + ' ')) : undefined;
  useEffect(() => {
    if (barra === null || comandosIa) return;
    callRpc(pairing, 'comandos.list').then(r => setComandosIa(r.comandos)).catch(() => setComandosIa([]));
  }, [barra === null, comandosIa, pairing]);
  const [sending, setSendingEstado] = useState(false);
  /**
   * O estado `sending` só muda no próximo render: dois toques rápidos passavam os dois pela
   * guarda e mandavam a pergunta duas vezes. O ref vale na hora. Começar um envio também
   * zera o "parado" do botão Parar — antes ele só zerava no envio digitado e ficava preso
   * depois de parar uma resposta falada.
   */
  const enviandoRef = useRef(false);
  const paradoRef = useRef(false);
  function setSending(v: boolean) {
    enviandoRef.current = v;
    if (v) paradoRef.current = false;
    setSendingEstado(v);
  }
  /** Id da bolha que está sendo escrita em pedaços; `null` fora de um stream. */
  const [escrevendoId, setEscrevendoId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  // Medição de nível ligada: é o que o pedido depois do "Ely" usa para saber quando a pessoa
  // parou de falar. No aperta-e-fala não muda nada.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  /** Volume da voz, 0–1, para a animação do microfone (08/10). */
  const nivelVoz = useSharedValue(0);
  /** Áudio enviado, resposta ainda não começou: a animação mostra "pensando". */
  const [pensandoVoz, setPensandoVoz] = useState(false);
  const voiceConnRef = useRef<VoiceConnection | null>(null);
  const listRef = useRef<FlatList<StoredMessage>>(null);
  // Começa SEMPRE em null, mesmo recebendo um sessionId. Inicializar com a prop fazia a
  // guarda do efeito de carregamento bater já na montagem: abrir uma conversa antiga
  // pulava a leitura do storage, a tela aparecia só com a saudação, e a primeira
  // mensagem nova gravava por cima do histórico inteiro.
  const sessionIdRef = useRef<string | null>(null);
  const favoriteRef = useRef(false);
  const createdAtRef = useRef(Date.now());

  const gravadorRef = useRef(criarAdiador<Parameters<typeof saveSession>[0]>((s) => { void saveSession(s); }, 800, (s) => s.id));
  // Bloco 196: quando o dedo encostou e se já soltou — o toque rápido soltava ANTES de a
  // gravação começar (ela espera o reconhecedor do "Ely" soltar o microfone), o "parar"
  // via `recording` ainda falso e saía, e o gravador ficava ligado sem ninguém segurando.
  const inicioGravacaoRef = useRef(0);
  // Bloco 191 (revisão): a conversa está sendo lida do armazenamento; a fala da Ely espera.
  const carregandoRef = useRef(false);
  const falaPendenteRef = useRef<string | null>(null);
  const soltouRef = useRef(false);

  function pushError(text: string) {
    setMessages((prev) => [...prev, { id: `err-${Date.now()}`, from: 'error', text, ts: Date.now() }]);
  }

  // Carrega uma conversa diferente quando o usuário escolhe outra na tela de Conversas
  // (ou "+ Nova"). Se sessionId já bate com o que este componente controla, é uma
  // mudança que ele mesmo originou (ver efeito de persistência abaixo) - ignora pra não
  // recarregar do storage e sobrescrever mensagens recém-digitadas com uma versão velha.
  useEffect(() => {
    if (sessionId === sessionIdRef.current) return;

    carregandoRef.current = true;
    (async () => {
      try {
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
        setMessages([{ id: 'welcome', from: 'reply', text: BOAS_VINDAS, ts: Date.now() }]);
      } finally {
        carregandoRef.current = false;
        // Bloco 191: a pergunta da Ely que chegou durante o carregamento entra DEPOIS dele —
        // antes, o carregamento terminava por cima e a bolha sumia.
        const pendente = falaPendenteRef.current;
        falaPendenteRef.current = null;
        if (pendente) setMessages((prev) => [...prev, { id: `ely-${Date.now()}`, from: 'reply', text: pendente, ts: Date.now() }]);
      }
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

    // Bloco 196: adiado — o streaming muda `messages` a cada pedaço, e cada gravação relia e
    // regravava o histórico inteiro. Agora grava uma vez quando a conversa para de mudar.
    gravadorRef.current.agendar({
      id: sessionIdRef.current,
      title: deriveTitle(messages),
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      favorite: favoriteRef.current,
      messages,
    });
  }, [messages]);

  // Sair da tela ou mandar o app para o fundo grava o que estava esperando, na hora.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') gravadorRef.current.descarregar(); });
    return () => { sub.remove(); gravadorRef.current.descarregar(); };
  }, []);

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
          pushError(`Falha ao preparar o áudio: ${errMessage(err)}`);
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
    }, setSugestoes);
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

  // Bloco 191: a pergunta do card "A Ely quer saber" vira a bolha da Ely; o PC já guardou
  // a mesma fala no histórico, então a resposta digitada chega com contexto.
  useEffect(() => {
    if (!falaDaEly) return;
    const texto = falaDaEly;
    onFalaDaElyMostrada?.();
    if (carregandoRef.current) { falaPendenteRef.current = texto; return; }
    setMessages((prev) => [...prev, { id: `ely-${Date.now()}`, from: 'reply', text: texto, ts: Date.now() }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falaDaEly]);

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
  function bolhaEmPedacos(): { onChunk: (parcial: string) => void; fechar: (texto: string, fontes?: Fonte[], local?: boolean) => void; comecou: () => boolean; parcial: () => string } {
    const id = `reply-${Date.now()}`;
    let criada = false;
    let ultimo = '';
    const onChunk = (parcial: string) => {
      ultimo = parcial;
      if (!criada) {
        criada = true;
        setEscrevendoId(id);
        setMessages((prev) => [...prev, { id, from: 'reply', text: parcial, ts: Date.now() }]);
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: parcial } : m)));
    };
    const fechar = (texto: string, fontes?: Fonte[], local?: boolean) => {
      setEscrevendoId(null);
      const extra = { ...(fontes?.length ? { fontes } : {}), ...(local ? { local: true } : {}) };
      if (criada) setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: texto, ...extra } : m)));
      else setMessages((prev) => [...prev, { id, from: 'reply', text: texto, ts: Date.now(), ...extra }]);
    };
    return { onChunk, fechar, comecou: () => criada, parcial: () => ultimo };
  }

  /**
   * "Parar" enquanto a resposta chega (02/10, como no ChatGPT). Fecha o WebSocket — o PC
   * descarta o resto — e o que já chegou fica na bolha, marcado com "…". A conexão reabre
   * sozinha no próximo envio (`ensureVoiceConnection`).
   */
  const bolhaAtualRef = useRef<ReturnType<typeof bolhaEmPedacos> | null>(null);
  function pararResposta() {
    if (!enviandoRef.current || paradoRef.current) return;
    paradoRef.current = true;
    haptica.leve();
    const b = bolhaAtualRef.current;
    if (b?.comecou()) b.fechar(b.parcial().trimEnd() + ' …');
    else setEscrevendoId(null);
    voiceConnRef.current?.close();
    voiceConnRef.current = null;
  }

  async function rodarComandoIa(cmd: { id: string; nome: string }, alvo: string) {
    setDraft('');
    setSending(true);
    const ts = Date.now();
    setMessages((prev) => [...prev, { id: `me-${ts}`, from: 'me', text: `/${cmd.nome}\n${alvo}`, ts }]);
    try {
      const r = await callRpc(pairing, 'comandos.run', { comando: cmd.id, texto: alvo }, { timeoutMs: 120_000 });
      if (paradoRef.current) return;
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, from: 'reply', text: r.resultado, ts: Date.now() }]);
    } catch (err) { if (!paradoRef.current) pushError(errMessage(err)); }
    finally { setSending(false); }
  }

  async function handleSend(texto?: string, opcoes: { refazer?: boolean } = {}) {
    const text = (texto ?? draft).trim();
    if (!text || enviandoRef.current) return;
    // Comando de IA pela barra (bloco 137).
    if (texto === undefined && comandoEscolhido) {
      const alvo = text.slice(comandoEscolhido.nome.length + 1).trim();
      if (alvo) { rodarComandoIa(comandoEscolhido, alvo); return; }
    }
    setDraft('');
    setStarters([]);   // a fileira só faz sentido enquanto a tela está em branco
    setSugestoes([]);  // as da resposta anterior já não servem
    // Refazer (bloco 130): a pergunta já está na tela; só a resposta antiga saiu.
    if (!opcoes.refazer) setMessages((prev) => [...prev, { id: `me-${Date.now()}`, from: 'me', text, ts: Date.now() }]);
    setSending(true);

    const bolha = bolhaEmPedacos();
    bolhaAtualRef.current = bolha;
    try {
      // WebSocket primeiro: é o único caminho que traz a resposta em pedaços. Se ele não
      // abrir (PC de pé mas WS bloqueado, por exemplo), o HTTP de sempre continua valendo
      // — resposta inteira de uma vez, como antes do bloco 59.
      let reply: string;
      let fontes: Fonte[] | undefined;
      let local = false;
      try {
        // Cinco segundos para o WS abrir. Com o PC fora do ar o handshake pode levar o
        // timeout do TCP inteiro; o HTTP abaixo já sabe lidar com isso (fila offline).
        const conn = await Promise.race([
          ensureVoiceConnection(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('WebSocket demorou a abrir')), 5000)),
        ]);
        // Bloco 130: digitado = canal "texto" — resposta de chat, com markdown.
        const r = await conn.sendText(text, bolha.onChunk, { canal: 'texto', refazer: opcoes.refazer });
        reply = r.reply;
        fontes = r.fontes;
        local = r.local === true;
      } catch (wsErr) {
        // Só cai no HTTP se o PC não chegou a responder NADA: com pedaços já na tela o
        // comando já rodou lá, e mandar de novo abriria o programa duas vezes.
        if (bolha.comecou() || paradoRef.current) throw wsErr;
        console.warn('[chat] WS indisponível, caindo no HTTP', errMessage(wsErr));
        reply = await sendCommand(pairing, text, 'texto');
      }
      if (paradoRef.current) return;
      bolha.fechar(reply, fontes, local);
      // Resposta escrita pode ser longa: a voz lê só o começo (o resto está na tela).
      if (await lerRespostasEscritas()) speakReply(paraFala(reply));
    } catch (err) {
      setEscrevendoId(null);
      // Parado pelo botão: o erro é o da conexão fechada de propósito, não um problema.
      if (paradoRef.current) return;
      if (err instanceof AuthError) {
        // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
        avisarTokenRecusado();
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
      bolhaAtualRef.current = null;
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
    if (enviandoRef.current) return;
    // Vários de uma vez (08/10): o seletor do Android deixa marcar mais de um; cada arquivo
    // vai como um recado, em sequência, e um grande demais não impede os outros.
    const escolha = await emFluxoExterno(() => DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: false,
      multiple: true,
    }));
    if (escolha.canceled || !escolha.assets.length) return;
    const arquivos = escolha.assets.slice(0, 10);

    setSending(true);
    try {
      const enviados: string[] = [];
      const grandes: string[] = [];
      for (const asset of arquivos) {
        const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
        if (bytes.byteLength > MAILBOX_MAX_ATTACHMENT_BYTES) { grandes.push(asset.name); continue; }
        await sendMessage(pairing, {
          kind: 'file',
          attachment: {
            name: asset.name,
            mimeType: asset.mimeType ?? 'application/octet-stream',
            base64: fromByteArray(bytes),
          },
        });
        enviados.push(asset.name);
      }
      const ts = Date.now();
      if (enviados.length) {
        setMessages((prev) => [
          ...prev,
          { id: `file-${ts}`, from: 'me', text: enviados.map(n => `📎 ${n}`).join('\n'), ts },
          { id: `file-ok-${ts + 1}`, from: 'reply', text: enviados.length === 1 ? 'Arquivo entregue na caixa do PC.' : `${enviados.length} arquivos entregues na caixa do PC.`, ts: ts + 1 },
        ]);
      }
      if (grandes.length) Alert.alert(grandes.length === 1 ? 'Arquivo grande demais' : 'Arquivos grandes demais', `Limite de ${Math.round(MAILBOX_MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB por anexo — ficou de fora: ${grandes.join(', ')}.`);
      if (escolha.assets.length > arquivos.length) Alert.alert('Até 10 de cada vez', `Mandei os 10 primeiros; ${escolha.assets.length - arquivos.length} ficaram para a próxima.`);
    } catch (err) {
      if (err instanceof AuthError) {
        // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
        avisarTokenRecusado();
        return;
      }
      Alert.alert('Falha ao enviar o arquivo', errMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function handleRecordStart() {
    if (enviandoRef.current || recording || turnoRef.current) return;
    soltouRef.current = false;
    inicioGravacaoRef.current = 0;
    if (micStatus !== 'ready') {
      Alert.alert('Microfone indisponível', 'Permissão de microfone não foi concedida.');
      return;
    }

    // Segurar o microfone enquanto ela fala é querer falar por cima: cala antes de gravar,
    // senão o áudio leva a voz dela junto.
    pararDeFalar();
    // Bloco 129: tira o reconhecedor do "Ely" do microfone ANTES de preparar o gravador.
    // Chave própria ('segurar'): o fim de um pedido por voz soltava a 'gravar' no meio
    // desta gravação e o reconhecedor voltava a disputar o microfone.
    ocuparMicrofone('segurar');
    await new Promise((r) => setTimeout(r, 150));
    try {
      await recorder.prepareToRecordAsync();
    } catch (err) {
      liberarMicrofone('segurar');
      pushError(`Falha ao preparar gravação: ${errMessage(err)}`);
      return;
    }

    try {
      recorder.record();
    } catch (err) {
      liberarMicrofone('segurar');
      pushError(`Falha ao iniciar gravação: ${errMessage(err)}`);
      return;
    }

    // Soltou antes de a gravação começar: era um toque, não fala.
    if (soltouRef.current) {
      try { await recorder.stop(); } catch { /* nada gravado */ }
      liberarMicrofone('segurar');
      ToastAndroid.show('Segure o microfone enquanto fala.', ToastAndroid.SHORT);
      return;
    }
    // O dedo já está no botão e o olho na tela: a vibração é o "pode falar" que não
    // exige olhar para o mic.
    haptica.medio();
    inicioGravacaoRef.current = Date.now();
    setRecording(true);
  }

  async function handleRecordStop() {
    soltouRef.current = true;
    if (!recording) return;
    haptica.leve();
    setRecording(false);
    const curta = gravacaoCurta(inicioGravacaoRef.current, Date.now());

    try {
      await recorder.stop();
    } catch (err) {
      pushError(`Falha ao parar gravação: ${errMessage(err)}`);
      return;
    } finally {
      liberarMicrofone('segurar');
    }

    // Toque rápido (ou duplo toque do TalkBack): um áudio de meio segundo não tem pedido —
    // mandar gastava uma transcrição e voltava "não entendi".
    if (curta) { ToastAndroid.show('Segure o microfone enquanto fala.', ToastAndroid.SHORT); return; }
    const uri = recorder.uri;
    if (!uri) {
      pushError('Falha ao ler o áudio gravado: uri vazia após stop()');
      return;
    }
    const r = await enviarAudio(uri);
    if (r) void falarResposta(r);
  }

  /**
   * Fase 19: com a fala antecipada, parte da resposta já saiu enquanto chegava — aqui só vai o
   * resto. Sem ela (ou se nada fechou frase a tempo), a resposta inteira, como sempre.
   */
  function falarResposta(r: { reply: string; fala: FalaAntecipada | null; jaFalado: string }): Promise<void> {
    if (r.fala) return r.fala.fechar(restoParaFalar(r.reply, r.jaFalado));
    return falar(r.reply, pairing);
  }

  /**
   * Os pedaços da resposta viram frases para a voz (fase 19). O `chunk` do WebSocket traz o
   * texto ACUMULADO; o fatiador quer só o que é novo. Se o acumulado não continuar o anterior
   * (o servidor reescreveu), a antecipação para ali — o resto sai inteiro no fim.
   */
  function antecipador(fala: FalaAntecipada | null) {
    const fatiador = criarFatiador();
    let anterior = '';
    let jaFalado = '';
    let desviou = false;
    return {
      aoPedaco(parcial: string) {
        if (!fala || desviou) return;
        if (!parcial.startsWith(anterior)) { desviou = true; return; }
        for (const frase of fatiador.push(parcial.slice(anterior.length))) { jaFalado += ` ${frase}`; fala.adicionar(frase); }
        anterior = parcial;
      },
      jaFalado: () => jaFalado,
    };
  }

  /** Manda um áudio gravado e escreve a resposta em pedaços. Devolve null se falhou. */
  async function enviarAudio(uri: string): Promise<{ reply: string; transcricao: string; fala: FalaAntecipada | null; jaFalado: string } | null> {
    setSending(true);
    setPensandoVoz(true);
    setMessages((prev) => [...prev, { id: `me-audio-${Date.now()}`, from: 'me', text: '🎤 (áudio)', ts: Date.now() }]);
    let transcricao = '';
    const fala = (await falaAntecipadaLigada()) ? abrirFalaAntecipada(pairing) : null;
    const ant = antecipador(fala);
    try {
      const conn = await ensureVoiceConnection();
      const bolha = bolhaEmPedacos();
      bolhaAtualRef.current = bolha;
      // A transcrição chega ANTES do primeiro pedaço, então a bolha "me" entra na ordem
      // certa — antes da resposta que vai começar a ser escrita logo depois.
      const { reply } = await conn.sendAudio(uri, (parcial) => { setPensandoVoz(false); bolha.onChunk(parcial); ant.aoPedaco(parcial); }, (transcript) => {
        transcricao = transcript;
        setMessages((prev) => [...prev, { id: `transcript-${Date.now()}`, from: 'me', text: transcript, ts: Date.now() }]);
      });
      if (paradoRef.current) { fala?.abortar(); return null; }
      bolha.fechar(reply);
      return { reply, transcricao, fala, jaFalado: ant.jaFalado() };
    } catch (err) {
      // Erro no meio: o que já foi dito fica, e a voz para junto com a resposta.
      fala?.abortar();
      setEscrevendoId(null);
      if (!paradoRef.current) pushError(errMessage(err));
      return null;
    } finally {
      setSending(false);
      setPensandoVoz(false);
      bolhaAtualRef.current = null;
    }
  }

  // ── Ações da bolha (bloco 130): copiar, ouvir, refazer ─────────────────────
  function acoesDaBolha(item: StoredMessage) {
    if (item.from === 'error' || item.id === 'welcome') return;
    haptica.leve();
    const copiar = { text: 'Copiar', onPress: () => { Clipboard.setStringAsync(item.from === 'reply' ? textoPuro(item.text) : item.text).catch(() => {}); } };
    if (item.from === 'me') { Alert.alert('Mensagem', undefined, [copiar], { cancelable: true }); return; }
    const ouvir = { text: 'Ouvir', onPress: () => { falar(textoPuro(item.text), pairing); } };
    // Refazer só a última resposta, e só se a pergunta dela foi digitada (áudio não tem texto para reenviar).
    const ultima = [...messages].reverse().find(m => m.from === 'reply');
    const indice = messages.findIndex(m => m.id === item.id);
    const pergunta = [...messages.slice(0, indice)].reverse().find(m => m.from === 'me');
    const podeRefazer = ultima?.id === item.id && pergunta && !pergunta.text.startsWith('🎤') && !pergunta.text.startsWith('📎') && !sending;
    const botoes = podeRefazer
      ? [copiar, ouvir, { text: 'Refazer', onPress: () => {
          setMessages(prev => prev.filter(m => m.id !== item.id));
          handleSend(pergunta!.text, { refazer: true });
        } }]
      : [copiar, ouvir];
    Alert.alert('Resposta', undefined, botoes, { cancelable: true });
  }

  // ── Pedido por voz depois do "Ely" (02/10) ────────────────────────────────
  // Era a conversa mão livre (bloco 89): gravava → respondia → voltava a ouvir, sem fim.
  // O Zak pediu para tirar: agora "Ely" vale UM pedido — ouve, responde, fala e encerra.
  // Para continuar, diz "Ely" de novo ou segura o microfone.
  //
  // Nível em dBFS do expo-audio: fala perto do celular fica entre −30 e −10; um quarto
  // silencioso, abaixo de −50. Os dois limiares com folga entre si evitam que um ruído no
  // meio do caminho fique alternando "falou"/"calou".
  const LIMIAR_FALA_DB = -38;
  const LIMIAR_SILENCIO_DB = -46;
  const SILENCIO_PARA_FECHAR_MS = 1300;
  // Depois do "Ely" a pessoa já está falando; 8 s sem voz é desistência, não pausa.
  const ESPERA_SEM_FALA_MS = 8_000;
  const TETO_GRAVACAO_MS = 30_000;

  /** Fase do pedido por voz, para a faixa acima do campo. `null` = nenhum em andamento. */
  const [faseVoz, setFaseVoz] = useState<'ouvindo' | 'pensando' | null>(null);
  // O medidor do gravador alimenta a animação enquanto ela ouve (segurando o mic ou depois do "Ely").
  const ouvindoAgora = recording || faseVoz === 'ouvindo';
  useEffect(() => {
    if (!ouvindoAgora) { nivelVoz.value = 0; return; }
    const t = setInterval(() => {
      try {
        // dBFS: fala perto do celular fica entre −30 e −10; silêncio, abaixo de −50.
        const db = recorder.getStatus().metering ?? -160;
        nivelVoz.value = Math.max(0, Math.min(1, (db + 55) / 45));
      } catch { /* gravador entre estados */ }
    }, 70);
    return () => clearInterval(t);
  }, [ouvindoAgora, recorder, nivelVoz]);

  const turnoRef = useRef(false);

  /**
   * Grava até a pessoa falar e calar. `uri` null = ninguém falou (ou o turno foi cancelado).
   * Os níveis e o motivo de parar voltam junto para o diagnóstico (bloco 116).
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
      while (turnoRef.current) {
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
    return { uri: falou && turnoRef.current ? recorder.uri : null, niveis, inicio, primeiraFalaEm, fim: Date.now(), motivo };
  }

  /** Pedido falado que já veio em texto (colado no "Ely"): mesma conversa, sem gravar. */
  async function enviarTextoFalado(texto: string): Promise<{ reply: string; fala: FalaAntecipada | null; jaFalado: string } | null> {
    setSending(true);
    setMessages((prev) => [...prev, { id: `me-voz-${Date.now()}`, from: 'me', text: texto, ts: Date.now() }]);
    const fala = (await falaAntecipadaLigada()) ? abrirFalaAntecipada(pairing) : null;
    const ant = antecipador(fala);
    try {
      const conn = await ensureVoiceConnection();
      const bolha = bolhaEmPedacos();
      bolhaAtualRef.current = bolha;
      const { reply } = await conn.sendText(texto, (parcial) => { bolha.onChunk(parcial); ant.aoPedaco(parcial); });
      if (paradoRef.current) { fala?.abortar(); return null; }
      bolha.fechar(reply);
      return { reply, fala, jaFalado: ant.jaFalado() };
    } catch (err) {
      fala?.abortar();
      setEscrevendoId(null);
      if (!paradoRef.current) pushError(errMessage(err));
      return null;
    } finally {
      setSending(false);
      bolhaAtualRef.current = null;
    }
  }

  /** Um pedido só: o que veio colado no "Ely", ou o que a pessoa falar em seguida. */
  async function turnoDeVoz(pedidoColado?: string) {
    turnoRef.current = true;
    ocuparMicrofone('gravar');
    let linha: string | null = null;
    try {
      // O reconhecedor do "Ely" acabou de ser abortado; um respiro para ele soltar o microfone.
      await new Promise((r) => setTimeout(r, 300));
      let resposta: { reply: string; fala: FalaAntecipada | null; jaFalado: string } | null = null;
      if (pedidoColado) {
        setFaseVoz('pensando');
        resposta = await enviarTextoFalado(pedidoColado);
      } else {
        setFaseVoz('ouvindo');
        haptica.leve();
        const g = await gravarAteSilencio();
        if (!turnoRef.current) return;
        if (!g.uri) {
          linha = resumoRodada({ numero: 1, ...g, caracteres: null });
          pushError('Não ouvi nenhum pedido. Diga "Ely" de novo quando quiser.');
          return;
        }
        setFaseVoz('pensando');
        const r = await enviarAudio(g.uri);
        linha = resumoRodada({ numero: 1, ...g, caracteres: r ? r.transcricao.trim().length : null });
        resposta = r;
      }
      setFaseVoz(null);
      liberarMicrofone('gravar');
      // A fala tem o botão "Interromper" do App (02/10); aqui só espera ela acabar.
      if (resposta && turnoRef.current) await falarResposta(resposta);
      else resposta?.fala?.abortar();
    } catch (err) {
      pushError(`Voz: ${errMessage(err)}`);
    } finally {
      turnoRef.current = false;
      setFaseVoz(null);
      liberarMicrofone('gravar');
      // Para o log do PC (bloco 116). Melhor esforço: sem PC, a calibragem só perde este pedido.
      if (linha) callRpc(pairing, 'diag.registrar', { origem: 'voz-ely', linhas: [linha] }).catch(() => {});
    }
  }

  function cancelarTurno() {
    turnoRef.current = false;
    pararDeFalar();
    haptica.leve();
  }

  // Sair da tela (ou trocar de conversa) cancela o pedido: microfone aberto sem ninguém
  // olhando para a tela é exatamente o que ninguém quer. A FALA não para (08/10): o Zak
  // pediu para a Ely seguir falando ao trocar de aba — quem cala é a pílula "Ely falando".
  useEffect(() => () => { turnoRef.current = false; liberarMicrofone('gravar'); }, []);
  // Com as abas vivas o Chat não desmonta ao trocar de aba — fica escondido. Escondido no
  // meio da ESCUTA, o pedido é cancelado como antes; pensando ou falando, segue.
  const ativa = useAbaAtiva();
  useEffect(() => {
    if (ativa || faseVoz !== 'ouvindo') return;
    turnoRef.current = false;
    liberarMicrofone('gravar');
  }, [ativa, faseVoz]);

  // "Ely" ouvido (bloco 129): um pedido — o colado na palavra, ou o próximo que a pessoa
  // falar. Um respiro antes de gravar: o reconhecedor acabou de soltar o microfone.
  //
  // 🔴 07/10: o pedido ficava no estado do App para sempre, e o "já tratado" era um ref que
  // zera quando o Chat remonta — então TODA abertura do Chat depois de um "Ely" voltava a
  // gravar sozinha (e reenviava o pedido colado). Parecia a mão livre de volta. Agora o
  // pedido é consumido: `onPedidoVozTratado` limpa no App, como o `perguntaPendente`.
  const timerVozRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pedidoVoz) return;
    // Microfone ainda conferindo (Chat recém-aberto pelo atalho): espera, o efeito roda de
    // novo quando o status muda.
    if (micStatus === 'checking') return;
    const texto = pedidoVoz.texto.trim();
    onPedidoVozTratado?.();
    // Ocupado (respondendo, gravando, outro pedido): o "Ely" é descartado, não enfileirado.
    if (turnoRef.current || enviandoRef.current || recording || micStatus !== 'ready') return;
    timerVozRef.current = setTimeout(() => {
      timerVozRef.current = null;
      if (turnoRef.current || enviandoRef.current) return;
      haptica.medio();
      turnoDeVoz(texto || undefined);
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoVoz?.n, micStatus]);
  useEffect(() => () => { if (timerVozRef.current) clearTimeout(timerVozRef.current); }, []);

  return (
    // O espaço do teclado é reservado uma vez só, na raiz do app (App.tsx). Aqui havia
    // um KeyboardAvoidingView que, somado àquele padding, deslocava a conversa duas
    // vezes — e que de todo modo não funciona no edge-to-edge do Android.
    <View style={{ flex: 1 }}>
      {!semCabecalho && (
        <ScreenHeader
          title="ELYSIUM-M"
          right={
            <Pressable accessibilityLabel="Histórico" accessibilityRole="button" onPress={onOpenConversations} hitSlop={8}>
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
              {/* Bloco 130: a resposta vem em markdown no chat digitado; toque longo = ações. */}
              <Pressable onLongPress={() => acoesDaBolha(item)} delayLongPress={350}>
                {item.from === 'reply' ? <Markdown texto={item.text} cor={color} /> : (
                  <Text variant="body" color={color}>
                    {item.text}
                  </Text>
                )}
              </Pressable>
              {/* Fase 18: a nuvem falhou e o cérebro do PC respondeu — pode ser menos preciso. */}
              {item.local ? (
                <Text variant="caption" color={palette.textMuted} style={styles.selo} accessibilityLabel="Resposta do modo local: a nuvem não respondeu">MODO LOCAL</Text>
              ) : null}
              {/* Fontes da busca (bloco 131): um toque abre o site. */}
              {item.fontes?.length ? (
                <View style={styles.fontes}>
                  {item.fontes.map((f, i) => (
                    <Pressable key={f.url} onPress={() => { if (/^https?:\/\//i.test(f.url)) Linking.openURL(f.url).catch(() => {}); }}
                      style={[styles.fonte, { borderColor: palette.border, borderRadius: tokens.radii.lg }]}>
                      <Text variant="caption" color={palette.primary}>{i + 1}</Text>
                      <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{hostDe(f.url)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </BolhaEntrando>
          );
        }}
      />

      {sending && !escrevendoId && <BolhaPensando />}

      {/* Próximas perguntas (bloco 132): um toque pergunta. */}
      {sugestoes.length > 0 && !sending && (
        <View style={[styles.starters, { paddingHorizontal: tokens.spacing.md }]}>
          {sugestoes.slice(0, 6).map((t) => (
            <Pressable
              key={t}
              onPress={() => { haptica.leve(); handleSend(t); }}
              style={[styles.sugestao, { borderColor: palette.primary, backgroundColor: palette.primarySoft, borderRadius: tokens.radii.lg }]}
            >
              <Text variant="caption" color={palette.text}>{t}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Encostadas na barra de escrita, porque é de lá que a próxima mensagem sai. */}
      {/* "/" = comandos de IA (bloco 137): toque escolhe, depois escreva ou cole o texto. */}
      {barra !== null && !comandoEscolhido && (
        <View style={[styles.starters, { paddingHorizontal: tokens.spacing.md }]}>
          {(comandosIa ?? []).filter(c => c.nome.toLowerCase().includes(barra.trim())).map(c => (
            <Pressable key={c.id} onPress={() => setDraft(`/${c.nome} `)}
              style={[styles.sugestao, { borderColor: palette.primary, backgroundColor: palette.primarySoft, borderRadius: tokens.radii.lg }]}>
              <Text variant="caption" color={palette.text}>{c.nome}</Text>
            </Pressable>
          ))}
          {comandosIa === null && <Text variant="caption" color={palette.textMuted}>Buscando os comandos de IA…</Text>}
        </View>
      )}

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

      <VozAoVivo
        fase={ouvindoAgora ? 'ouvindo' : pensandoVoz || faseVoz === 'pensando' ? 'pensando' : null}
        nivel={nivelVoz}
        acima={faseVoz ? 128 : 86}
      />
      {faseVoz && (
        <View style={[styles.faixaVoz, { backgroundColor: palette.primarySoft, borderColor: palette.glassBorder }]}>
          <Feather name={faseVoz === 'pensando' ? 'loader' : 'mic'} size={15} color={palette.primary} />
          <Text variant="caption" color={palette.primary} style={{ flex: 1 }}>
            {faseVoz === 'pensando' ? 'Pensando…' : 'Pode falar o pedido.'}
          </Text>
          <Pressable onPress={cancelarTurno} hitSlop={10} accessibilityLabel="Cancelar pedido por voz">
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
        <GlassCircle size={40} onPress={() => setCameraOpen(true)} disabled={sending} accessibilityLabel="Perguntar sobre uma foto">
          <Feather name="camera" size={20} color={palette.primary} />
        </GlassCircle>
        {/* Anexar fica à esquerda, colado na câmera, nos DOIS lados do switch: são os dois
            botões que trazem algo de fora para a conversa. */}
        <GlassCircle size={40} onPress={handleAnexar} disabled={sending} accessibilityLabel="Anexar arquivo">
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
          // Fase 18: cresce até 5 linhas — mensagem longa ficava escondida numa linha só.
          // Enter continua enviando (submitBehavior); a quebra vem do texto colado.
          multiline
          submitBehavior="submit"
          maxLength={4000}
        />
        <GlassCircle
          size={40}
          ativo={recording}
          pulsando={recording}
          onPressIn={handleRecordStart}
          onPressOut={handleRecordStop}
          disabled={sending || micStatus !== 'ready' || faseVoz !== null}
          accessibilityLabel="Segure para falar"
        >
          <Feather
            name="mic"
            size={20}
            color={recording ? palette.error : micStatus !== 'ready' ? palette.textMuted : palette.primary}
          />
        </GlassCircle>
        {sending ? (
          <GlassCircle size={40} ativo onPress={pararResposta} accessibilityLabel="Parar a resposta">
            <Feather name="square" size={17} color={palette.error} />
          </GlassCircle>
        ) : (
          <GlassCircle size={40} ativo={!!draft.trim()} onPress={() => handleSend()} disabled={!draft.trim()} accessibilityLabel="Enviar">
            <Feather name="arrow-up" size={20} color={draft.trim() ? palette.primary : palette.textMuted} />
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
          lerRespostasEscritas().then((ler) => { if (ler) falar(answer, pairing); });
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

/** "economia.uol.com.br" de uma URL, para o chip da fonte. */
function hostDe(url: string): string {
  const m = /^https?:\/\/(?:www\.)?([^/]+)/.exec(url);
  return m ? m[1] : url;
}

const styles = StyleSheet.create({
  fontes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  selo: { marginTop: 4, fontSize: 10, letterSpacing: 1 },
  fonte: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, maxWidth: 180 },
  sugestao: { paddingHorizontal: 11, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
  faixaVoz: {
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
    // Até ~5 linhas; depois rola dentro do campo.
    maxHeight: 120,
  },

});




