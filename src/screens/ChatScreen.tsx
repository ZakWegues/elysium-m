import { AlturaAvisosContext, useFolgaDaBarra } from '../lib/folgaBarra';
import { CartaoErro, textoDoErro } from '../components/chat/CartaoErro';
import { telasSalvasMudaram } from '../lib/telasMandadas';
import { limiaresDaGravacao } from '../lib/silencio';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Linking, Pressable, ScrollView, Share, StyleProp, StyleSheet, TextInput, ToastAndroid, View, ViewStyle } from 'react-native';
import { TextoComLinks } from '../components/TextoComLinks';
import { aoChegarImagem, pegarImagemPendente } from '../lib/imagemParaEly';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHAVE_NOME, saudacao } from './inicio/tipos';
import AnimatedReanimated, {
  FadeInDown, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { abrirFalaAntecipada, falaAntecipadaLigada, falar, FalaAntecipada, lerRespostasEscritas, pararDeFalar } from '../lib/falar';
import { definirFaseDaBolota, nivelDaBolota } from '../lib/bolota';
import { CICLO_PENSANDO_MS } from '../lib/esferaLogica';
import { Esfera3D } from '../components/Esfera3D';
import { ehEntradaDoLive, ehSaidaDoLive, SILENCIO_LIVE_MS } from '../lib/live';
import { criarFatiador, restoParaFalar } from '../lib/fatiadorDeFrases';
import { criarAdiador, gravacaoCurta } from '../lib/adiador';
import { emFluxoExterno, marcarOcupado } from '../lib/atualizacaoOta';
import { useAbaAtiva, useAoReativar } from '../components/AbaViva';
import { liberarMicrofone, ocuparMicrofone } from '../lib/microfone';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MotivoParada, resumoRodada } from '../lib/vozDiag';
import { useAudioRecorder, RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError, pedidoDaTela, sendCommand } from '../lib/api';
import { TimeoutError } from '../lib/http';
import { enqueueCommand, removeFromQueue } from '../lib/commandQueue';
import { ConexaoNaoAbriu, EstadoConexao, novoIdDePedido, openVoiceConnection, VoiceConnection } from '../lib/stream';
import { callRpc } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import CameraAsk from './CameraAsk';
import { conversaParaContinuar, deriveTitle, Fonte, listSessions, saveSession, StoredMessage } from '../lib/chatHistoryStore';
import { syncChats } from '../lib/chatSync';
import { MOV } from '../lib/motion';
import { useTheme } from '../theme';
import { GlassCircle, GlassFill, GlassModal, ScreenHeader, Text, useFolgaDoTopo, VIDRO_BOTAO, FundoVidro } from '../components/ui';
import PresetsPopover from './PresetsPopover';
import { Markdown } from '../components/Markdown';
import { botoesDasRapidas, type Rapidas } from '../lib/respostasRapidas';
import { RespostasRapidas } from '../components/RespostasRapidas';
import { PreAquecerTelas, TelaNaBolha, type AcoesTela } from '../components/TelaNaBolha';
import { aplicarUi, telaVisivel } from '../lib/telas';
import { diagTela, ligarDiagTela } from '../lib/telaDiag';
import { mandarArquivoParaPc } from '../lib/shareIntent';
import { LIMITE_ENVIO_PARA_O_PC } from '../lib/anexos';
import { paraFala, textoPuro } from '../lib/markdown';
import * as Clipboard from 'expo-clipboard';
import { avisarTokenRecusado } from '../lib/erroRpc';
import { sincronizarModo, trocarModo, useModo } from '../lib/modo';
import type { ModoDaLista } from '../lib/rpc';


/** 31/10: 'pedir' = ainda não autorizado; o pedido do sistema só aparece ao tocar no microfone. */
type MicStatus = 'checking' | 'ready' | 'pedir' | 'denied';

/** 31/10: quanto tempo o "Desfazer" fica embaixo da resposta (o PC aceita por 5 min, pela voz). */
const DESFAZER_MS = 30_000;

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
  const folgaDaBarra = useFolgaDaBarra();
  const alturaAvisos = useContext(AlturaAvisosContext);
  const folgaTopo = useFolgaDoTopo();
  // 22.1: começa vazia — a esfera é a tela de boas-vindas (a bolha de texto era ruído).
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  // 31/10: o "Desfazer" some sozinho no prazo (e sai do histórico salvo).
  const prazoDesfazer = messages[messages.length - 1]?.desfazer?.ate;
  useEffect(() => {
    if (!prazoDesfazer) return;
    const t = setTimeout(() => setMessages((prev) => prev.map((m) => (m.desfazer ? { ...m, desfazer: undefined } : m))), Math.max(0, prazoDesfazer - Date.now()));
    return () => clearTimeout(t);
  }, [prazoDesfazer]);
  // Fase 23.1: o nome que a Início guardou, para a saudação sob a esfera.
  const [nomeDono, setNomeDono] = useState('');
  useEffect(() => { AsyncStorage.getItem(CHAVE_NOME).then(n => { if (n) setNomeDono(n); }).catch(() => {}); }, []);
  const [draft, setDraft] = useState('');
  // 21/10: o rascunho sobrevive se o Android fechar o app no fundo.
  const rascunhoLido = useRef(false);
  useEffect(() => { AsyncStorage.getItem('elysium_rascunho').then(r => { if (r) setDraft(d => d || r); }).catch(() => {}).finally(() => { rascunhoLido.current = true; }); }, []);
  useEffect(() => {
    if (!rascunhoLido.current) return;
    const t = setTimeout(() => { AsyncStorage.setItem('elysium_rascunho', draft).catch(() => {}); }, 400);
    return () => clearTimeout(t);
  }, [draft]);
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
  /**
   * Fase 20: o modo da Ely. O chip mostra o ligado; o "/" também lista os modos (um toque
   * liga). A troca feita no PC ou pela voz chega pelo WebSocket (`lib/modo.ts`).
   */
  const modo = useModo();
  const [modosLista, setModosLista] = useState<ModoDaLista[] | null>(null);
  useEffect(() => { void sincronizarModo(pairing); }, [pairing]);
  // A aba fica montada: voltar a ela confere o modo (expirou, ou mudou pela voz sem WS aberto).
  useAoReativar(() => { void sincronizarModo(pairing); });
  useEffect(() => {
    // Fechou o "/": a lista é buscada de novo na próxima vez (modo criado ou PC que voltou).
    if (barra === null) { if (modosLista) setModosLista(null); return; }
    if (modosLista) return;
    callRpc(pairing, 'modos.list').then(r => setModosLista(r.modos)).catch(() => setModosLista([]));
  }, [barra === null, modosLista, pairing]);
  async function escolherModo(id: string | null) {
    haptica.leve();
    setDraft('');
    try {
      const m = await trocarModo(pairing, id);
      ToastAndroid.show(m ? `Modo ${m.nome} ligado.` : 'Saí do modo.', ToastAndroid.SHORT);
    } catch (e) {
      ToastAndroid.show(`Não consegui trocar o modo: ${errMessage(e)}`, ToastAndroid.LONG);
    }
  }
  const [sending, setSendingEstado] = useState(false);
  /** 21/10: a conexão caiu no meio de uma resposta — mostra "Reconectando…" em vez de erro. */
  const [conexao, setConexao] = useState<EstadoConexao>('conectado');
  /** O pareamento ATUAL: a conexão reabre sempre no endereço que está valendo agora. */
  const pairingRef = useRef(pairing);
  pairingRef.current = pairing;
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
    marcarOcupado('chat', v);
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
  /** 31/10: o estado da tela vai ao PC com meio segundo de folga. */
  const timerEstado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<StoredMessage>>(null);
  // Começa SEMPRE em null, mesmo recebendo um sessionId. Inicializar com a prop fazia a
  // guarda do efeito de carregamento bater já na montagem: abrir uma conversa antiga
  // pulava a leitura do storage, a tela aparecia só com a saudação, e a primeira
  // mensagem nova gravava por cima do histórico inteiro.
  const sessionIdRef = useRef<string | null>(null);
  const favoriteRef = useRef(false);
  const createdAtRef = useRef(Date.now());

  // 31/10: grava aqui e já manda ao PC — "Continuar do celular" lá precisa da conversa de agora,
  // não da próxima sincronização. Sem PC por perto, a sincronização de sempre leva depois.
  const gravadorRef = useRef(criarAdiador<Parameters<typeof saveSession>[0]>((s) => {
    void saveSession(s);
    callRpc(pairingRef.current, 'chat.save', { session: s }).catch(() => {});
  }, 800, (s) => s.id));
  /** 31/10: a conversa que acabou de acontecer no PC ("Continuar do PC"), no chat vazio. */
  const [doPc, setDoPc] = useState<{ id: string; title: string } | null>(null);
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
            // 22.1: conversas antigas guardaram a bolha de boas-vindas — ela não volta.
            setMessages(found.messages.filter(m => m.id !== 'welcome'));
            return;
          }
        }
        sessionIdRef.current = null;
        favoriteRef.current = false;
        createdAtRef.current = Date.now();
        setMessages([]);
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

  // 31/10: chat vazio — sincroniza e vê se a conversa mais recente acabou de acontecer no PC.
  const chatVazio = messages.length === 0;
  useEffect(() => {
    if (!chatVazio) { setDoPc(null); return; }
    let vivo = true;
    void syncChats(pairingRef.current).then(() => listSessions()).then((ss) => {
      const c = conversaParaContinuar(ss, 'pc');
      if (vivo) setDoPc(c ? { id: c.id, title: c.title } : null);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [chatVazio, sessionId]);

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

  // 31/10: na abertura só CONFERE a permissão (o Chat abre sozinho logo depois de parear, e o
  // diálogo do sistema aparecia sem a pessoa ter pedido nada). Pedir fica para o toque no mic.
  const prepararMicrofone = useCallback(async (pedir: boolean, cancelado: () => boolean = () => false): Promise<boolean> => {
    let perm;
    try {
      perm = pedir ? await requestRecordingPermissionsAsync() : await getRecordingPermissionsAsync();
    } catch (err) {
      if (!cancelado()) { setMicStatus('denied'); pushError(`Falha na permissão: ${errMessage(err)}`); }
      return false;
    }
    if (cancelado()) return false;
    if (!perm.granted) { setMicStatus(perm.canAskAgain === false ? 'denied' : 'pedir'); return false; }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch (err) {
      if (!cancelado()) { setMicStatus('denied'); pushError(`Falha ao preparar o áudio: ${errMessage(err)}`); }
      return false;
    }
    if (!cancelado()) setMicStatus('ready');
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void prepararMicrofone(false, () => cancelled);
    return () => { cancelled = true; };
  }, [prepararMicrofone]);

  useEffect(() => {
    return () => {
      voiceConnRef.current?.close();
      voiceConnRef.current = null;
    };
  }, []);

  // 21/10: voltou para a frente ou o endereço do PC mudou (Wi-Fi ↔ túnel) — a conexão do chat
  // é refeita na hora, no endereço novo. Antes ela ficava presa ao socket morto.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const c = voiceConnRef.current;
      if (s === 'active' && c && !c.viva()) c.reconectar();
    });
    return () => sub.remove();
  }, []);
  const ipAnterior = useRef(pairing.activeIp);
  useEffect(() => {
    if (ipAnterior.current === pairing.activeIp) return;
    ipAnterior.current = pairing.activeIp;
    voiceConnRef.current?.reconectar();
  }, [pairing.activeIp]);

  async function ensureVoiceConnection(): Promise<VoiceConnection> {
    if (voiceConnRef.current) return voiceConnRef.current;
    const conn = openVoiceConnection(() => pairingRef.current, () => {
      if (voiceConnRef.current === conn) voiceConnRef.current = null;
    }, (sugestoes) => {
      // 22/10: as sugestões de continuação (bloco 132) entram na linha da última resposta.
      setMessages((prev) => {
        const ultima = prev[prev.length - 1];
        if (!ultima || ultima.from !== 'reply' || ultima.rapidas?.pergunta) return prev;
        return [...prev.slice(0, -1), { ...ultima, sugestoes }];
      });
    }, setConexao, (f) => {
      // 22/10 (Fase 4): a tela inteligente da resposta — acha a bolha pelo id do pedido.
      setMessages((prev) => {
        const novas = aplicarUi(prev, f);
        diagTela(`frame ui ${f.programa ? `programa ${f.programa.length} chars` : f.gerando ? 'gerando' : f.cancelada ? 'cancelada' : 'falhou'} ${novas === prev ? 'SEM BOLHA (id ' + f.id.slice(-6) + ')' : 'na bolha'}`);
        return novas;
      });
    });
    voiceConnRef.current = conn;
    try {
      await conn.ready;
    } catch (err) {
      // Nem abriu: encerra (senão ela ficaria tentando de novo no fundo) e quem chamou cai no HTTP.
      if (voiceConnRef.current === conn) voiceConnRef.current = null;
      conn.close();
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
  /** Onde a lista está (a roda do mouse em cima de uma tela, na prévia web, rola a partir daqui). */
  const deslocamento = useRef(0);
  useEffect(() => { ligarDiagTela(() => pairingRef.current); }, []);
  // 24/10: a conversa voltou com uma tela ainda "gerando" (o app fechou no meio): pede ao PC.
  const retomadaPedida = useRef<string | null>(null);
  useEffect(() => {
    const m = [...messages].reverse().find((x) => x.tela?.gerando && x.pedidoId && telaVisivel(x.tela, x.ts));
    if (!m?.pedidoId || retomadaPedida.current === m.pedidoId || voiceConnRef.current?.viva()) return;
    retomadaPedida.current = m.pedidoId;
    diagTela(`retomando tela …${m.pedidoId.slice(-6)}`);
    ensureVoiceConnection().then((c) => c.retomarTela(m.pedidoId!)).catch(() => {});
  }, [messages]);
  /** Quando ele mandou a última mensagem: a tela da resposta que cresce logo depois puxa a lista. */
  const ultimoEnvio = useRef(0);

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

  // Fase 23.2: imagem compartilhada de outro app → a Ely olha (mesmo caminho da câmera).
  useEffect(() => {
    const tratar = async () => {
      const img = pegarImagemPendente();
      if (!img) return;
      const ts = Date.now();
      setMessages((prev) => [...prev, { id: `me-${ts}`, from: 'me', text: `🖼️ ${img.pergunta}`, ts }]);
      setSending(true);
      try {
        const res = await callRpc(pairing, 'vision.ask', { imageBase64: img.base64, question: img.pergunta }, { timeoutMs: 90000 });
        setMessages((prev) => [...prev, { id: `reply-${ts + 1}`, from: 'reply', text: res.answer, ts: Date.now() }]);
        lerRespostasEscritas().then((ler) => { if (ler) falar(res.answer, pairing); });
      } catch (err) {
        setMessages((prev) => [...prev, { id: `err-${ts + 1}`, from: 'error', text: `Não consegui olhar a imagem: ${errMessage(err)}`, ts: Date.now() }]);
      } finally { setSending(false); }
    };
    void tratar();
    return aoChegarImagem(() => { void tratar(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  function bolhaEmPedacos(): { onChunk: (parcial: string) => void; fechar: (texto: string, fontes?: Fonte[], local?: boolean, rapidas?: Rapidas, pedidoId?: string, desfazer?: string, memoria?: string[], semCensura?: boolean) => void; comecou: () => boolean; parcial: () => string } {
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
    const fechar = (texto: string, fontes?: Fonte[], local?: boolean, rapidas?: Rapidas, pedidoId?: string, desfazer?: string, memoria?: string[], semCensura?: boolean) => {
      setEscrevendoId(null);
      const extra = { ...(fontes?.length ? { fontes } : {}), ...(local ? { local: true } : {}), ...(semCensura ? { semCensura: true } : {}), ...(rapidas ? { rapidas } : {}), ...(pedidoId ? { pedidoId } : {}), ...(desfazer ? { desfazer: { rotulo: desfazer, ate: Date.now() + DESFAZER_MS } } : {}), ...(memoria?.length ? { memoria } : {}) };
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
  const inputRef = useRef<TextInput>(null);
  /** Id da pergunta sendo editada (31/10); o próximo envio do campo a substitui. */
  const editandoRef = useRef<string | null>(null);
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

  /**
   * 23/10: "Ver como tela" e "Tentar de novo": o PC gera a tela desta resposta pelo WebSocket
   * (frames `ui` com um id novo, que a mensagem passa a carregar).
   */
  async function telaDaResposta(item: StoredMessage, pergunta?: string, resposta?: string) {
    const id = novoIdDePedido();
    // Pediu agora: a tela que vier puxa a lista até ela (como depois de mandar mensagem).
    ultimoEnvio.current = Date.now();
    coladoNoFim.current = true;
    const idx = messages.findIndex((m) => m.id === item.id);
    const perg = pergunta ?? [...messages.slice(0, Math.max(0, idx))].reverse().find((m) => m.from === 'me')?.text ?? '';
    const resp = resposta ?? item.text;
    setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, pedidoId: id, tela: { gerando: true, desde: Date.now() } } : m)));
    const conn = await ensureVoiceConnection().catch(() => null);
    if (!conn || !conn.pedirTela(id, perg, resp)) {
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, tela: { falhou: { pergunta: perg, resposta: resp } } } : m)));
    }
  }

  // 24/10: as ações das telas num objeto ESTÁVEL (lê o estado atual por ref): a TelaNaBolha é memo
  // e não redesenha (nem reenvia os 3 MB do renderer) a cada letra digitada ou pedaço de resposta.
  const atual = useRef({ handleSend, telaDaResposta, messages, aoCrescerConteudo });
  atual.current = { handleSend, telaDaResposta, messages, aoCrescerConteudo };
  const acoesTela = useMemo<AcoesTela>(() => {
    const semTela = (id: string) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, tela: undefined } : m)));
    return {
      perguntar: (t) => { void atual.current.handleSend(t); },
      estado: (id, vars) => {
        setMessages((prev) => prev.map((m) => (m.id === id && m.tela ? { ...m, tela: { ...m.tela, estado: vars } } : m)));
        // 31/10: o PC fica sabendo do que foi marcado/respondido (meio segundo de folga entre toques).
        const programa = atual.current.messages.find((m) => m.id === id)?.tela?.programa;
        if (timerEstado.current) clearTimeout(timerEstado.current);
        if (programa) timerEstado.current = setTimeout(() => voiceConnRef.current?.enviarEstadoTela(programa, vars), 500);
      },
      pedido: (rota, params) => pedidoDaTela(pairingRef.current, rota, params),
      // 31/10: guarda nas Telas salvas do PC, com o que já foi marcado/respondido.
      salvar: (id) => {
        const t = atual.current.messages.find((m) => m.id === id)?.tela;
        if (!t?.programa) return;
        callRpc(pairingRef.current, 'telas.salvas.salvar', { programa: t.programa, ...(t.estado ? { estado: t.estado } : {}) })
          .then((r) => { haptica.sucesso(); telasSalvasMudaram(); Alert.alert('Tela salva', `“${r.tela.titulo}” está no Hoje → Telas salvas (aqui e no PC).`); })
          .catch((e) => Alert.alert('Não consegui salvar', errMessage(e)));
      },
      falhou: semTela,
      cancelar: (id) => {
        const m = atual.current.messages.find((x) => x.id === id);
        if (m?.pedidoId) voiceConnRef.current?.cancelarTela(m.pedidoId);
        semTela(id);
      },
      tentar: (id) => {
        const m = atual.current.messages.find((x) => x.id === id);
        if (m) void atual.current.telaDaResposta(m, m.tela?.falhou?.pergunta, m.tela?.falhou?.resposta);
      },
      rolar: (dy) => listRef.current?.scrollToOffset({ offset: Math.max(0, deslocamento.current + dy), animated: false }),
      cresceu: (id) => {
        // A tela da última resposta, pedida há pouco: desce até ela mesmo no meio da rolagem.
        const lista = atual.current.messages;
        if (lista[lista.length - 1]?.id === id && Date.now() - ultimoEnvio.current < 60_000) listRef.current?.scrollToEnd({ animated: true });
        else atual.current.aoCrescerConteudo();
      },
    };
  }, []);

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
    // Fase 21: "modo live" digitado liga a conversa contínua pelo microfone do celular.
    if (ehEntradaDoLive(text) && micStatus === 'ready' && !turnoRef.current) {
      setDraft('');
      setLive(true);
      haptica.medio();
      turnoDeVoz();
      return;
    }
    // Comando de IA pela barra (bloco 137).
    if (texto === undefined && comandoEscolhido) {
      const alvo = text.slice(comandoEscolhido.nome.length + 1).trim();
      if (alvo) { rodarComandoIa(comandoEscolhido, alvo); return; }
    }
    setDraft('');
    // 31/10: "Editar" na última pergunta — ela troca de texto, o que veio depois sai e o PC
    // desfaz o turno antigo (o mesmo `refazer` do bloco 130).
    const editando = texto === undefined && !opcoes.refazer ? editandoRef.current : null;
    editandoRef.current = null;
    const iEditada = editando ? messages.findIndex((m) => m.id === editando) : -1;
    if (iEditada >= 0) {
      setMessages((prev) => [...prev.slice(0, iEditada), { ...prev[iEditada], text, ts: Date.now() }]);
      opcoes = { ...opcoes, refazer: true };
    }
    // Quem manda mensagem quer ver a resposta (e a tela que vier): a lista volta a seguir o fim.
    coladoNoFim.current = true;
    ultimoEnvio.current = Date.now();
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
      let semCensura = false;
      let rapidas: Rapidas | undefined;
      let pedidoId: string | undefined;
      let desfazer: string | undefined;
      let memoria: string[] | undefined;
      try {
        // Cinco segundos para o WS abrir. Com o PC fora do ar o handshake pode levar o
        // timeout do TCP inteiro; o HTTP abaixo já sabe lidar com isso (fila offline).
        // 26/10: o prazo é cancelado quando o WS abre (antes ficava pendurado em todo envio).
        let prazoWs: ReturnType<typeof setTimeout> | undefined;
        const conn = await Promise.race([
          ensureVoiceConnection(),
          new Promise<never>((_, rej) => { prazoWs = setTimeout(() => rej(new Error('WebSocket demorou a abrir')), 5000); }),
        ]).finally(() => clearTimeout(prazoWs));
        // Bloco 130: digitado = canal "texto" — resposta de chat, com markdown.
        const r = await conn.sendText(text, bolha.onChunk, { canal: 'texto', refazer: opcoes.refazer });
        reply = r.reply;
        fontes = r.fontes;
        local = r.local === true;
        semCensura = r.semCensura === true;
        rapidas = r.rapidas;
        pedidoId = r.id;
        desfazer = r.desfazer;
        memoria = r.memoria;
      } catch (wsErr) {
        // 21/10: só cai no HTTP se a conexão NEM ABRIU (o comando não chegou ao PC). Com o
        // comando já enviado, mandar de novo rodaria duas vezes — a retomada cuida da queda.
        const naoAbriu = wsErr instanceof ConexaoNaoAbriu || (wsErr instanceof Error && wsErr.message === 'WebSocket demorou a abrir');
        if (!naoAbriu || bolha.comecou() || paradoRef.current) throw wsErr;
        console.warn('[chat] WS indisponível, caindo no HTTP', errMessage(wsErr));
        diagTela(`chat: WS indisponível, foi pelo HTTP (${errMessage(wsErr).slice(0, 80)})`);
        reply = await sendCommand(pairing, text, 'texto');
      }
      if (paradoRef.current) return;
      bolha.fechar(reply, fontes, local, rapidas, pedidoId, desfazer, memoria, semCensura);
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
        const q = await enqueueCommand(text);
        setMessages((prev) => [
          ...prev,
          { id: `queued-${Date.now()}`, from: 'error', text: 'Guardei para mandar quando o PC voltar.', ts: Date.now(),
            erro: { titulo: 'Guardei para mandar depois', detalhe: 'O PC não respondeu. Mando sozinho assim que ele voltar.', acoes: ['cancelar'], filaId: q.id } },
        ]);
        return;
      }

      // 26/10: erro vira cartão com Refazer/Mandar depois (CartaoErro), não texto vermelho solto.
      const t = textoDoErro(errMessage(err));
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, from: 'error', text: t.titulo, ts: Date.now(),
        erro: { ...t, acoes: ['refazer', 'depois'], pergunta: text } }]);
    } finally {
      setSending(false);
      setConexao('conectado');
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
        // 22/10: até 500 MB, em stream (PC 2.15+); PC antigo recusa acima de 5 MB com aviso.
        const tamanho = asset.size ?? new File(asset.uri).size ?? 0;
        if (tamanho > LIMITE_ENVIO_PARA_O_PC) { grandes.push(asset.name); continue; }
        await mandarArquivoParaPc(pairing, { uri: asset.uri, nome: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', bytes: tamanho }, null);
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
      if (grandes.length) Alert.alert(grandes.length === 1 ? 'Arquivo grande demais' : 'Arquivos grandes demais', `Limite de ${Math.round(LIMITE_ENVIO_PARA_O_PC / 1024 / 1024)} MB por anexo — ficou de fora: ${grandes.join(', ')}.`);
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
    if (micStatus === 'pedir') { void prepararMicrofone(true); return; }
    if (micStatus !== 'ready') {
      Alert.alert('Microfone indisponível', 'A permissão de microfone foi negada. Libere nas configurações do Android para falar com a Ely.');
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
      const { reply, rapidas, id, desfazer, memoria } = await conn.sendAudio(uri, (parcial) => { setPensandoVoz(false); bolha.onChunk(parcial); ant.aoPedaco(parcial); }, (transcript) => {
        transcricao = transcript;
        setMessages((prev) => [...prev, { id: `transcript-${Date.now()}`, from: 'me', text: transcript, ts: Date.now() }]);
      });
      if (paradoRef.current) { fala?.abortar(); return null; }
      // Com o id, a tela que o PC mandar depois (pedido de tela por voz) acha esta bolha.
      bolha.fechar(reply, undefined, false, rapidas, id, desfazer, memoria);
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
    const puro = item.from === 'reply' ? textoPuro(item.text) : item.text;
    const copiar = { text: 'Copiar', onPress: () => { Clipboard.setStringAsync(puro).catch(() => {}); } };
    // Fase 23: compartilhar com qualquer app (folha do Android).
    const compartilhar = { text: 'Compartilhar', onPress: () => { Share.share({ message: puro }).catch(() => {}); } };
    if (item.from === 'me') {
      // Editar só a última pergunta digitada que já teve resposta (como o Refazer).
      const ultimaMinha = [...messages].reverse().find(m => m.from === 'me');
      const iItem = messages.findIndex(m => m.id === item.id);
      const podeEditar = ultimaMinha?.id === item.id && !sending && !item.text.startsWith('🎤') && !item.text.startsWith('📎')
        && messages.slice(iItem + 1).some(m => m.from === 'reply');
      const editar = { text: 'Editar', onPress: () => { editandoRef.current = item.id; setDraft(item.text); inputRef.current?.focus(); } };
      Alert.alert('Mensagem', undefined, podeEditar ? [copiar, compartilhar, editar] : [copiar, compartilhar], { cancelable: true });
      return;
    }
    const ouvir = { text: 'Ouvir', onPress: () => { falar(textoPuro(item.text), pairing); } };
    // Refazer só a última resposta, e só se a pergunta dela foi digitada (áudio não tem texto para reenviar).
    const ultima = [...messages].reverse().find(m => m.from === 'reply');
    const indice = messages.findIndex(m => m.id === item.id);
    const pergunta = [...messages.slice(0, indice)].reverse().find(m => m.from === 'me');
    const podeRefazer = ultima?.id === item.id && pergunta && !pergunta.text.startsWith('🎤') && !pergunta.text.startsWith('📎') && !sending;
    // O Alert do Android mostra até 3 botões: Copiar, Compartilhar e (Refazer | Ouvir).
    const botoes = podeRefazer
      ? [copiar, compartilhar, { text: 'Refazer', onPress: () => {
          setMessages(prev => prev.filter(m => m.id !== item.id));
          handleSend(pergunta!.text, { refazer: true });
        } }]
      : [copiar, compartilhar, ouvir];
    Alert.alert('Resposta', undefined, botoes, { cancelable: true });
  }

  // ── Pedido por voz depois do "Ely" (02/10) ────────────────────────────────
  // Era a conversa mão livre (bloco 89): gravava → respondia → voltava a ouvir, sem fim.
  // O dono pediu para tirar: agora "Ely" vale UM pedido — ouve, responde, fala e encerra.
  // Para continuar, diz "Ely" de novo ou segura o microfone.
  //
  // Nível em dBFS do expo-audio: fala perto do celular fica entre −30 e −10; um quarto
  // silencioso, abaixo de −50. Os dois limiares com folga entre si evitam que um ruído no
  // meio do caminho fique alternando "falou"/"calou".
  const SILENCIO_PARA_FECHAR_MS = 1300;
  // Depois do "Ely" a pessoa já está falando; 8 s sem voz é desistência, não pausa.
  const ESPERA_SEM_FALA_MS = 8_000;
  const TETO_GRAVACAO_MS = 30_000;

  /** Fase do pedido por voz, para a faixa acima do campo. `null` = nenhum em andamento. */
  const [faseVoz, setFaseVoz] = useState<'ouvindo' | 'pensando' | null>(null);
  // O medidor do gravador alimenta a animação enquanto ela ouve (segurando o mic ou depois do "Ely").
  const ouvindoAgora = recording || faseVoz === 'ouvindo';
  useEffect(() => {
    if (!ouvindoAgora) { nivelVoz.value = 0; nivelDaBolota.value = 0; return; }
    const t = setInterval(() => {
      try {
        // dBFS: fala perto do celular fica entre −30 e −10; silêncio, abaixo de −50.
        const db = recorder.getStatus().metering ?? -160;
        nivelVoz.value = Math.max(0, Math.min(1, (db + 55) / 45));
        nivelDaBolota.value = nivelVoz.value;
      } catch { /* gravador entre estados */ }
    }, 70);
    return () => clearInterval(t);
  }, [ouvindoAgora, recorder, nivelVoz]);

  // Fase 21: a bolota (no App, por cima das abas) acompanha: ciano ouvindo, âmbar pensando —
  // pela voz ou esperando a resposta de um pedido digitado.
  useEffect(() => {
    definirFaseDaBolota(ouvindoAgora ? 'ouvindo' : pensandoVoz || faseVoz === 'pensando' || sending ? 'pensando' : null);
  }, [ouvindoAgora, pensandoVoz, faseVoz, sending]);
  useEffect(() => () => definirFaseDaBolota(null), []);

  const turnoRef = useRef(false);
  // Fase 21: modo live — conversa contínua. O ref é o que os laços leem; o estado, a faixa.
  const liveRef = useRef(false);
  const [live, setLiveEstado] = useState(false);
  const setLive = (v: boolean) => {
    liveRef.current = v;
    marcarOcupado('live', v);
    setLiveEstado(v);
    // 21/10 (APK 2.4): com o live ligado, o microfone continua com o app minimizado — o Android
    // mostra o aviso fixo do serviço de gravação. Desligou o live, volta ao normal.
    setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: v }).catch(() => {});
  };

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
        // 26/10: limiares pelo ruído do ambiente (silencio.ts); os fixos eram o mínimo e nunca fechavam com ruído.
        const lim = limiaresDaGravacao(niveis);
        if (nivel > lim.fala) { if (!falou) primeiraFalaEm = agora; falou = true; ultimaVoz = agora; }
        else if (falou && nivel > lim.silencio) ultimaVoz = agora;
        if (falou && agora - ultimaVoz > SILENCIO_PARA_FECHAR_MS) { motivo = 'silencio'; break; }
        // No modo live, espera até um minuto pela fala (fase 21).
        if (!falou && agora - inicio > (liveRef.current ? SILENCIO_LIVE_MS : ESPERA_SEM_FALA_MS)) { motivo = 'sem_fala'; break; }
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
      const { reply, rapidas } = await conn.sendText(texto, (parcial) => { bolha.onChunk(parcial); ant.aoPedaco(parcial); });
      if (paradoRef.current) { fala?.abortar(); return null; }
      bolha.fechar(reply, undefined, false, rapidas);
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
    let dito = pedidoColado ?? '';
    let completo = false;
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
          if (liveRef.current) { setLive(false); pushError('Fiquei um minuto sem ouvir nada. Saí do modo live.'); }
          else pushError('Não ouvi nenhum pedido. Diga "Ely" de novo quando quiser.');
          return;
        }
        setFaseVoz('pensando');
        const r = await enviarAudio(g.uri);
        linha = resumoRodada({ numero: 1, ...g, caracteres: r ? r.transcricao.trim().length : null });
        resposta = r;
        dito = r?.transcricao ?? '';
      }
      // Fase 21: "tchau" sai do modo live; "modo live" falado liga (a resposta do PC já veio).
      if (liveRef.current && ehSaidaDoLive(dito)) setLive(false);
      else if (!liveRef.current && ehEntradaDoLive(dito)) setLive(true);
      setFaseVoz(null);
      liberarMicrofone('gravar');
      // A fala tem o botão "Interromper" do App (02/10); aqui só espera ela acabar.
      if (resposta && turnoRef.current) await falarResposta(resposta);
      else resposta?.fala?.abortar();
      completo = !!resposta && turnoRef.current;
    } catch (err) {
      // Minimizado sem a gravação no fundo (APK antigo, ou o Android recusou): o live para limpo,
      // com o porquê, em vez de um erro técnico.
      if (liveRef.current && AppState.currentState !== 'active') pushError('O Android não deixou ouvir com o app minimizado. Abra o app e diga "modo live" para continuar.');
      else pushError(`Voz: ${errMessage(err)}`);
    } finally {
      turnoRef.current = false;
      setFaseVoz(null);
      liberarMicrofone('gravar');
      // Modo live: a resposta terminou de falar — volta a ouvir. Turno cancelado ou com erro sai do live.
      if (liveRef.current) {
        if (completo) setTimeout(() => { if (liveRef.current && !turnoRef.current && !enviandoRef.current) turnoDeVoz(); }, 400);
        else setLive(false);
      }
      // Para o log do PC (bloco 116). Melhor esforço: sem PC, a calibragem só perde este pedido.
      if (linha) callRpc(pairing, 'diag.registrar', { origem: 'voz-ely', linhas: [linha] }).catch(() => {});
    }
  }

  function cancelarTurno() {
    setLive(false);
    turnoRef.current = false;
    pararDeFalar();
    haptica.leve();
  }

  // Sair da tela (ou trocar de conversa) cancela o pedido: microfone aberto sem ninguém
  // olhando para a tela é exatamente o que ninguém quer. A FALA não para (08/10): o dono
  // pediu para a Ely seguir falando ao trocar de aba — quem cala é a pílula "Ely falando".
  useEffect(() => () => { turnoRef.current = false; liberarMicrofone('gravar'); }, []);
  // Com as abas vivas o Chat não desmonta ao trocar de aba — fica escondido. Escondido no
  // meio da ESCUTA, o pedido é cancelado como antes; pensando ou falando, segue.
  const ativa = useAbaAtiva();
  useEffect(() => {
    if (ativa || faseVoz !== 'ouvindo') return;
    setLive(false);
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
    // 31/10: pedido de voz explícito (atalho, widget) sem permissão ainda: pede agora; o efeito
    // roda de novo quando o status virar 'ready'.
    if (micStatus === 'pedir') { void prepararMicrofone(true); return; }
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

  // Fase 22: o "+" (câmera, anexo, modos, presets) e o LIVE como botão.
  const [maisAberto, setMaisAberto] = useState(false);
  const [presetsAbertos, setPresetsAbertos] = useState(false);
  function alternarLive() {
    if (liveRef.current) { cancelarTurno(); return; }
    if (micStatus !== 'ready' || turnoRef.current || enviandoRef.current) return;
    haptica.medio();
    setLive(true);
    turnoDeVoz();
  }
  // Sobre o campo de texto, no máximo DUAS faixas — eram até sete empilhadas. Pela ordem de
  // importância: o "/" aberto, a voz em curso, o modo ligado. (22.1: sugestões e perguntas de
  // partida saíram — eram ruído e, num ScrollView horizontal sem flexGrow: 0, ficavam gigantes.)
  const faixas = ([
    barra !== null && !comandoEscolhido ? 'barra' : null,
    faseVoz ? 'voz' : null,
    modo && barra === null ? 'modo' : null,
  ].filter(Boolean) as string[]).slice(0, 2);

  return (
    // O espaço do teclado é reservado uma vez só, na raiz do app (App.tsx). Aqui havia
    // um KeyboardAvoidingView que, somado àquele padding, deslocava a conversa duas
    // vezes — e que de todo modo não funciona no edge-to-edge do Android.
    <View style={{ flex: 1 }}>
      {/* Fase 21: a esfera 3D no fundo da conversa — parada, gira e respira; com voz, se mexe.
          22.1: só fundo (sem toque). Chat vazio = ela sozinha no meio, como no PC. */}
      {/* 09/11: o aviso de conexão empurra o campo para cima; a esfera e a saudação sobem junto. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: alturaAvisos }]}>
        <Esfera3D vazio={messages.length === 0} titulo={nomeDono ? `${saudacao()}, ${nomeDono}.` : `${saudacao()}.`} dica="Pergunte, peça, mande abrir. Segure o microfone para falar." />
      </View>
      {/* 31/10: "Continuar do PC" — a conversa que acabou de acontecer lá, a um toque. */}
      {chatVazio && doPc && (
        <View style={styles.continuarPc} pointerEvents="box-none">
          <Pressable onPress={() => { haptica.leve(); onSessionChange(doPc.id); }} accessibilityRole="button" accessibilityLabel={`Continuar do PC: ${doPc.title}`}
            style={({ pressed }) => [styles.sugestao, VIDRO_BOTAO, { borderRadius: tokens.radii.full, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 }]}>
            <Feather name="monitor" size={14} color={palette.primary} />
            <Text variant="caption" color={palette.text} numberOfLines={1} style={{ maxWidth: 240 }}>Continuar do PC: {doPc.title}</Text>
          </Pressable>
        </View>
      )}
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

      {/* A WebView sobe cedo: a 1ª tela inteligente não espera o motor. */}
      <PreAquecerTelas />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingTop: semCabecalho ? folgaTopo : tokens.spacing.lg, gap: tokens.spacing.sm }}
        onContentSizeChange={aoCrescerConteudo}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          deslocamento.current = contentOffset.y;
          coladoNoFim.current =
            contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
        }}
        scrollEventThrottle={64}
        renderItem={({ item }) => {
          // Fase 23.1: as bolhas do PC. A minha é translúcida na cor do tema (18% + borda de
          // 35%), não um bloco sólido; a da Ely é a superfície com borda fina. Renascença: a
          // minha vai no pigmento, em itálico, e a da Ely ganha a moldura dourada.
          if (item.from === 'error' && item.erro) {
            const erro = item.erro;
            return (
              <CartaoErro titulo={erro.titulo} detalhe={erro.detalhe} acoes={erro.acoes} fila={!!erro.filaId}
                onAcao={(a) => {
                  // O cartão sai da conversa; a ação decide o que vem no lugar.
                  setMessages((prev) => prev.filter((m) => m.id !== item.id));
                  if (a === 'refazer' && erro.pergunta) void handleSend(erro.pergunta, { refazer: true });
                  else if (a === 'depois' && erro.pergunta) void enqueueCommand(erro.pergunta).then((q) => setMessages((prev) => [...prev, { id: `queued-${Date.now()}`, from: 'error', text: 'Guardado.', ts: Date.now(), erro: { titulo: 'Guardei para mandar depois', detalhe: 'Mando sozinho assim que o PC responder.', acoes: ['cancelar'], filaId: q.id } }]));
                  else if (a === 'cancelar' && erro.filaId) void removeFromQueue(erro.filaId);
                }} />
            );
          }
          const minha = item.from === 'me';
          const bg = minha ? palette.bolhaMinha : item.from === 'error' ? palette.errorSoft : palette.bolhaEla;
          const color = item.from === 'error' ? palette.error : palette.text;
          // 29/10: o rabinho das bolhas do design — canto de baixo menor do lado de quem fala.
          const raio = palette.familia === 'glass' ? 26 : palette.familia === 'dark' ? 20 : tokens.radii.lg;
          const ponta = palette.familia === 'glass' ? 8 : palette.familia === 'dark' ? 6 : tokens.radii.lg;
          return (
            <>
            <BolhaEntrando
              style={[
                styles.bubble,
                {
                  alignSelf: item.from === 'me' ? 'flex-end' : 'flex-start',
                  borderRadius: raio,
                  ...(minha ? { borderBottomRightRadius: ponta } : { borderBottomLeftRadius: ponta }),
                  paddingVertical: 12,
                  paddingHorizontal: 15,
                  backgroundColor: bg,
                  borderWidth: item.from === 'error' ? 0 : 1,
                  borderColor: minha ? palette.bolhaMinhaBorda : palette.bolhaElaBorda,
                },
              ]}
            >
              {/* Bloco 130: a resposta vem em markdown no chat digitado; toque longo = ações.
                  Fase 22: deslizar a bolha da Ely para a esquerda = ouvir de novo; toque duplo = copiar. */}
              <Pressable onLongPress={() => acoesDaBolha(item)} delayLongPress={350}>
                {item.from === 'reply' ? <Markdown texto={item.text} cor={color} /> : <TextoComLinks texto={item.text} cor={color} />}
              </Pressable>
              {/* Fase 18: a nuvem falhou e o cérebro do PC respondeu — pode ser menos preciso. */}
              {item.local ? (
                <Text variant="caption" color={palette.textMuted} style={styles.selo} accessibilityLabel="Resposta da reserva: o cérebro principal não respondeu a tempo">reserva</Text>
              ) : null}
              {/* 05/11: modo sem censura — quem escreveu foi o modelo do PC. */}
              {item.semCensura ? (
                <Text variant="caption" color={palette.textMuted} style={styles.selo} accessibilityLabel="Resposta do modo sem censura, escrita pelo modelo do PC">sem censura</Text>
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
            {/* 22/10 (Fase 4): a tela inteligente da resposta, embaixo da bolha. */}
            {item.from === 'reply' && telaVisivel(item.tela, item.ts) ? (
              <TelaNaBolha key={`tela-${item.id}`} tela={item.tela!} id={item.id} acoes={acoesTela} />
            ) : null}
            {/* 31/10: o que da memória do PC esta resposta usou. */}
            {item.from === 'reply' && item.memoria?.length ? (
              <Text variant="caption" color={palette.textMuted} numberOfLines={1} style={styles.lembrei}>
                Lembrei: {item.memoria.join(' · ')}
              </Text>
            ) : null}
            {/* 31/10: a resposta fez algo reversível — "Desfazer" por 30 s (manda "desfaz" ao PC). */}
            {item.from === 'reply' && item.desfazer && !sending && messages[messages.length - 1]?.id === item.id ? (
              <Pressable onPress={() => { haptica.leve(); void handleSend('desfaz'); }} accessibilityRole="button" accessibilityLabel={`Desfazer: ${item.desfazer.rotulo}`} hitSlop={6}
                style={({ pressed }) => [styles.verTela, { borderColor: palette.border, borderStyle: 'solid', opacity: pressed ? 0.7 : 1 }]}>
                <Feather name="corner-up-left" size={12} color={palette.textMuted} />
                <Text variant="caption" color={palette.textMuted}>Desfazer</Text>
              </Pressable>
            ) : null}
            {/* 23/10: "Ver como tela" na última resposta longa que ainda não tem tela (como no PC). */}
            {item.from === 'reply' && !item.tela && !sending && item.text.length > 80 && messages[messages.length - 1]?.id === item.id ? (
              <Pressable onPress={() => { haptica.leve(); void telaDaResposta(item); }} accessibilityRole="button" accessibilityLabel="Ver esta resposta como tela" hitSlop={6}
                style={({ pressed }) => [styles.verTela, { borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}>
                <Feather name="layout" size={12} color={palette.textMuted} />
                <Text variant="caption" color={palette.textMuted}>Ver como tela</Text>
              </Pressable>
            ) : null}
            {/* 22/10: respostas rápidas embaixo da última resposta (somem quando ele responde). */}
            {item.from === 'reply' && !sending && messages[messages.length - 1]?.id === item.id ? (
              <RespostasRapidas botoes={botoesDasRapidas(item.rapidas, item.sugestoes)} onEscolher={(t) => handleSend(t)} onOutra={() => inputRef.current?.focus()} />
            ) : null}
            </>
          );
        }}
      />

      {sending && !escrevendoId && <BolhaPensando />}
      {sending && conexao === 'reconectando' && (
        <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center', paddingBottom: 6 }}>Reconectando ao PC… a resposta continua de onde parou.</Text>
      )}

      {/* Encostadas na barra de escrita, porque é de lá que a próxima mensagem sai. */}
      {/* "/" = comandos de IA (bloco 137): toque escolhe, depois escreva ou cole o texto. */}
      {faixas.includes('barra') && barra !== null && (
        <View style={[styles.starters, { paddingHorizontal: tokens.spacing.md }]}>
          {(modosLista ?? []).filter(m => `modo ${m.nome}`.toLowerCase().includes(barra.trim())).map(m => (
            <Pressable key={`modo-${m.id}`} onPress={() => escolherModo(m.id)} accessibilityLabel={`Ligar o modo ${m.nome}`}
              style={[styles.sugestao, VIDRO_BOTAO, { borderRadius: tokens.radii.lg }, modo?.id === m.id && { borderColor: palette.primary }]}>
              <Text variant="caption" color={palette.text}>{m.icone} Modo {m.nome}</Text>
            </Pressable>
          ))}
          {(comandosIa ?? []).filter(c => c.nome.toLowerCase().includes(barra.trim())).map(c => (
            <Pressable key={c.id} onPress={() => setDraft(`/${c.nome} `)}
              style={[styles.sugestao, VIDRO_BOTAO, { borderRadius: tokens.radii.lg }]}>
              <Text variant="caption" color={palette.text}>{c.nome}</Text>
            </Pressable>
          ))}
          {comandosIa === null && <Text variant="caption" color={palette.textMuted}>Buscando os comandos de IA…</Text>}
        </View>
      )}

      {/* Fase 20: o modo ligado. O ✕ sai; tocar no nome abre a lista pelo "/". */}
      {modo && faixas.includes('modo') && (
        <View style={[styles.starters, { paddingHorizontal: tokens.spacing.md }]}>
          <View style={[styles.chipModo, VIDRO_BOTAO, { borderColor: palette.primary, borderRadius: tokens.radii.full }]}>
            <FundoVidro />
            <Pressable onPress={() => setDraft('/modo ')} accessibilityLabel={`Modo ${modo.nome} ligado. Toque para trocar`}>
              <Text variant="caption" color={palette.text}>{modo.icone}  Modo {modo.nome}</Text>
            </Pressable>
            <Pressable onPress={() => escolherModo(null)} hitSlop={10} accessibilityLabel="Sair do modo">
              <Feather name="x" size={14} color={palette.textMuted} />
            </Pressable>
          </View>
        </View>
      )}

      {faseVoz && faixas.includes('voz') && (
        <View style={[styles.faixaVoz, { backgroundColor: palette.primarySoft, borderColor: palette.glassBorder }]}>
          <Feather name={faseVoz === 'pensando' ? 'loader' : 'mic'} size={15} color={palette.primary} />
          <Text variant="caption" color={palette.primary} style={{ flex: 1 }}>
            {faseVoz === 'pensando' ? 'Pensando…' : live ? 'Pode falar. "Tchau" sai.' : 'Pode falar o pedido.'}
          </Text>
          <Pressable onPress={cancelarTurno} hitSlop={10} accessibilityLabel={live ? 'Sair do modo live' : 'Cancelar pedido por voz'}>
            <Feather name="x" size={16} color={palette.primary} />
          </Pressable>
        </View>
      )}

      {maisAberto && (
        <View style={[styles.menuMais, { paddingHorizontal: tokens.spacing.md }]}>
          {([
            { rotulo: 'Câmera', icone: 'camera', acao: () => setCameraOpen(true), off: sending },
            { rotulo: 'Anexo', icone: 'paperclip', acao: handleAnexar, off: sending },
            { rotulo: 'Modos', icone: 'layers', acao: () => setDraft('/modo '), off: false },
            { rotulo: 'Presets', icone: 'zap', acao: () => setPresetsAbertos(true), off: false },
          ] as const).map(o => (
            <Pressable key={o.rotulo} disabled={o.off} accessibilityLabel={o.rotulo}
              onPress={() => { haptica.leve(); setMaisAberto(false); o.acao(); }}
              style={[styles.itemMais, { borderColor: palette.glassBorder, borderRadius: tokens.radii.lg, backgroundColor: palette.primarySoft, opacity: o.off ? 0.4 : 1 }]}>
              <Feather name={o.icone} size={18} color={palette.primary} />
              <Text variant="caption" color={palette.primary}>{o.rotulo}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* A barra em si é tinta chapada: ela acompanha a lista, e desfocar uma faixa
          inteira por quadro é o custo que este bloco foi tirar da rolagem. Os BOTÕES é
          que viram vidro de verdade — são três regiões de 44 px, fixas. */}
      {/* 31/10: a faixa vai até o fim da tela; a barra de abas flutua por cima da folga. */}
      <View style={{ overflow: 'hidden', paddingBottom: folgaDaBarra }}>
        <GlassFill intensity={40} strong edge={false} blur={false} />
        <View
          style={[
            styles.inputRow,
            { padding: tokens.spacing.md, borderTopColor: palette.glassBorder },
          ]}
        >
        {/* Fase 22: câmera, anexo, modos e presets moram atrás do "+". */}
        <GlassCircle size={40} ativo={maisAberto} onPress={() => { haptica.leve(); setMaisAberto(v => !v); }} accessibilityLabel="Mais opções">
          <Feather name={maisAberto ? 'x' : 'plus'} size={20} color={palette.primary} />
        </GlassCircle>
        <TextInput
          ref={inputRef}
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
          onChangeText={(t) => { if (!t) editandoRef.current = null; setDraft(t); }}
          placeholder="Converse com a Ely…"
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
          disabled={sending || (micStatus !== 'ready' && micStatus !== 'pedir') || faseVoz !== null}
          accessibilityLabel={micStatus === 'pedir' ? 'Permitir o microfone' : 'Segure para falar'}
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
        ) : draft.trim() ? (
          <GlassCircle size={40} ativo onPress={() => handleSend()} accessibilityLabel="Enviar">
            <Feather name="arrow-up" size={20} color={palette.primary} />
          </GlassCircle>
        ) : (
          // Fase 22: o LIVE é um botão — aceso (com anel) enquanto a conversa contínua está ligada.
          <View style={[styles.anelLive, live && { borderColor: palette.primary }]}>
            <GlassCircle size={40} ativo={live} pulsando={live} onPress={alternarLive}
              disabled={micStatus !== 'ready'} accessibilityLabel={live ? 'Sair do modo live' : 'Modo live: conversa contínua'}>
              <Feather name="activity" size={19} color={live ? palette.primary : palette.textMuted} />
            </GlassCircle>
          </View>
        )}
        </View>
      </View>

      <GlassModal title="Presets" visible={presetsAbertos} onClose={() => setPresetsAbertos(false)}>
        {presetsAbertos && <PresetsPopover pairing={pairing} onFechar={() => setPresetsAbertos(false)} />}
      </GlassModal>

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
 * 22.1: o "acordando o cérebro…" depois de 6 s saiu — só os três pontos.
 */
function BolhaPensando() {
  const { palette, tokens } = useTheme();

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
      </AnimatedReanimated.View>
    </View>
  );
}

function Ponto({ atraso, cor }: { atraso: number; cor: string }) {
  const y = useSharedValue(0);
  // Fase 22: o ciclo é o mesmo do "pensando" da esfera (2π/4 s ≈ 1,57 s) — pulsam juntos.
  const quarto = Math.round(CICLO_PENSANDO_MS / 4);
  useEffect(() => {
    y.value = withDelay(atraso, withRepeat(
      withSequence(withTiming(-4, { duration: quarto }), withTiming(0, { duration: quarto }), withTiming(0, { duration: CICLO_PENSANDO_MS - 2 * quarto })),
      -1,
    ));
  }, [atraso, y, quarto]);
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <AnimatedReanimated.View style={[styles.ponto, { backgroundColor: cor }, estilo]} />;
}

/** "economia.uol.com.br" de uma URL, para o chip da fonte. */
function hostDe(url: string): string {
  const m = /^https?:\/\/(?:www\.)?([^/]+)/.exec(url);
  return m ? m[1] : url;
}

const styles = StyleSheet.create({
  verTela: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', marginTop: 2 },
lembrei: { alignSelf: 'flex-start', maxWidth: '88%', marginTop: 2, marginLeft: 4, fontSize: 11 },
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
  continuarPc: { position: 'absolute', top: '62%', left: 0, right: 0, alignItems: 'center' },
  menuMais: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  itemMais: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  anelLive: { borderRadius: 24, borderWidth: 1.5, borderColor: 'transparent', padding: 2 },
  lacre: {
    marginTop: 6, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#8c1c13', borderWidth: 1, borderColor: '#5a0e08',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  lacreTexto: { fontSize: 9, letterSpacing: 0.5, fontVariant: ['small-caps'] },
  chipModo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
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




