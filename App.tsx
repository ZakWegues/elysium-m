import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, InteractionManager, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import PairingScreen from './src/screens/PairingScreen';
import ChatHub from './src/screens/ChatHub';
import ControlScreen from './src/screens/ControlScreen';
import RotinasScreen from './src/screens/RotinasScreen';
import HojeScreen from './src/screens/HojeScreen';
import HomeScreen from './src/screens/HomeScreen';
import SpotifyPlayer from './src/screens/SpotifyPlayer';
import SettingsScreen from './src/screens/SettingsScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import OnboardingScreen, { CHAVE_ONBOARDING } from './src/screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPairing, idDoPc, loadPairing, savePairing, trocarPc, Pairing } from './src/lib/pairing';
import { listMessages } from './src/lib/mailbox';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/theme';
import { TabBar, Screen } from './src/components/TabBar';
import { AjustesProvider, AppBackground, BlurTargetProvider, GlassModal, SobreposicaoContext } from './src/components/ui';
import { CamadaEstouros, registrarToque } from './src/components/Estouros';
import { ConnectionBanner } from './src/components/ConnectionBanner';
import { useConnection } from './src/lib/useConnection';
import { useKeyboard } from './src/lib/useKeyboard';
import { flushQueue, listQueue } from './src/lib/commandQueue';
import { syncChats } from './src/lib/chatSync';
import { useCompartilharDoAndroid, useShareIntent } from './src/lib/shareIntent';
import { FolhaCompartilhar } from './src/components/FolhaCompartilhar';
import { pedirSobreImagem } from './src/lib/imagemParaEly';
import { MOV, tempo } from './src/lib/motion';
import { ligarSincronizacaoEmPrimeiroPlano, ouvirAvisosDoPc, pedirPermissao } from './src/lib/notificacoes';
import { carregarEstadoPc, descreverEstadoPc, useEstadoPc } from './src/lib/estadoPc';
import { registrarTarefa } from './src/lib/tarefaSegundoPlano';
import { useDeepLinks } from './src/lib/deepLinks';
import { urlDoWidget } from './src/lib/chaveWidget';
import * as QuickActions from 'expo-quick-actions';
import * as SplashScreen from 'expo-splash-screen';
import { callRpc } from './src/lib/rpc';
import { errMessage } from './src/lib/errors';
import { falar } from './src/lib/falar';
import { aoMudarPalavra, DiagPalavra, palavraLigada, usePalavraNoCelular } from './src/lib/palavraNoCelular';
import { useMicrofoneLivre } from './src/lib/microfone';
import { ComandosIa } from './src/components/ComandosIa';
import { FalaFlutuante } from './src/components/FalaFlutuante';
import { AbaViva } from './src/components/AbaViva';
import { Aba, abasMontadas, mesmasAbas } from './src/lib/abas';
import { AvisoOta } from './src/components/AvisoOta';
import { useAtualizacaoOta } from './src/lib/atualizacaoOta';
import { atualizarWidgetEstado, atualizarWidgetsEstaticos } from './src/widgets/handler';

const MAILBOX_BADGE_POLL_MS = 45000;

// Fase 21: a splash era o placeholder do template do Expo (grade cinza esticada em fundo
// branco) e sumia em cima da tela de carregamento. Agora é a moeda do ícone no fundo do app, e
// fica até o pareamento ser lido — com uma trava de 5 s para nunca prender o app nela.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 250 });
setTimeout(() => SplashScreen.hide(), 5000);

export default function App() {
  return (
    <ErrorBoundary>
      {/*
        A raiz do gesture-handler precisa envolver TUDO — inclusive o que abre em `Modal`,
        que no Android é uma janela nativa separada. Sem ela, um `GestureDetector` lá dentro
        simplesmente nunca recebe o dedo, e sem erro nenhum no console.
      */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AppInner />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function AppInner() {
  const { palette } = useTheme();
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  /** Lendo o QR de um PC a mais (bloco 121) — o atual continua pareado até dar certo. */
  const [adicionandoPc, setAdicionandoPc] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  // 21/10: a aba sobrevive se o Android fechar o app no fundo — voltar não joga na Início.
  const abaLida = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem('elysium_aba').then((v) => {
      if (v === 'chat' || v === 'hoje' || v === 'control' || v === 'home') setScreen(v);
    }).catch(() => {}).finally(() => { abaLida.current = true; });
  }, []);
  useEffect(() => {
    if (abaLida.current && screen !== 'conversations') AsyncStorage.setItem('elysium_aba', screen).catch(() => {});
  }, [screen]);
  // 21/10: tocar no aviso "A Ely te mandou um arquivo" abre a Caixa (o lado PC do Chat).
  useEffect(() => {
    let tirar: (() => void) | undefined;
    const abrirCaixa = (dados: unknown) => {
      if ((dados as { tipo?: unknown } | null)?.tipo !== 'caixa') return;
      setScreen('chat');
      setPedidoModo(p => ({ modo: 'pc', n: p.n + 1 }));
    };
    import('expo-notifications').then((N) => {
      N.getLastNotificationResponseAsync().then(r => { if (r) abrirCaixa(r.notification.request.content.data); }).catch(() => {});
      const sub = N.addNotificationResponseReceivedListener(r => abrirCaixa(r.notification.request.content.data));
      tirar = () => sub.remove();
    }).catch(() => { /* sem notificações nesta build */ });
    return () => tirar?.();
  }, []);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [mailboxUnread, setMailboxUnread] = useState(0);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  /** Em qual lado do switch o Chat abre — o compartilhamento do Android força o lado do PC. */
  // Com o Chat vivo (08/10) o lado não pode vir só da montagem: cada pedido é um `n` novo, e o
  // ChatHub troca de lado ao ver o número mudar — mesmo que o lado pedido seja o mesmo de antes.
  const [pedidoModo, setPedidoModo] = useState<{ modo: 'ia' | 'pc'; n: number }>({ modo: 'ia', n: 0 });
  const setModoChat = useCallback((modo: 'ia' | 'pc') => setPedidoModo(p => ({ modo, n: p.n + 1 })), []);
  /** Texto que a busca da Início mandou para o chat; o ChatScreen envia ao abrir e limpa. */
  const [perguntaPendente, setPerguntaPendente] = useState<string | null>(null);
  // Fase 19 (bloco 191): "A Ely quer saber" — a pergunta dela abre o Chat como fala da Ely.
  const [falaDaEly, setFalaDaEly] = useState<string | null>(null);
  /** "Elysium" ouvido (bloco 129): cada disparo é um `n` novo para o Chat ouvir um pedido. */
  const [pedidoVoz, setPedidoVoz] = useState<{ n: number; texto: string } | null>(null);
  // Atualização pelo ar que chega (07/10): procura, baixa e oferece reiniciar.
  const ota = useAtualizacaoOta();
  const [palavraOn, setPalavraOn] = useState(false);
  const [appNaFrente, setAppNaFrente] = useState(AppState.currentState === 'active');
  // Fase 20: o widget Falar só liga o microfone com a chave. Widget posto antes dela (ou
  // depois de uma atualização só de JS) ainda tem o link sem chave: redesenha ao abrir.
  useEffect(() => { void atualizarWidgetsEstaticos(); }, []);
  useEffect(() => {
    palavraLigada().then(setPalavraOn);
    const sub = AppState.addEventListener('change', (s) => {
      setAppNaFrente(s === 'active');
      // Voltou ao app: relê o ajuste (pode ter mudado em Ajustes → Voz).
      if (s === 'active') palavraLigada().then(setPalavraOn);
    });
    const tirar = aoMudarPalavra(setPalavraOn);
    return () => { sub.remove(); tirar(); };
  }, []);
  // Abas vivas (08/10): cada aba monta na primeira visita e fica montada — ver lib/abas.ts.
  const [montadas, setMontadas] = useState<Set<Aba>>(() => new Set<Aba>(['home']));
  useEffect(() => {
    setMontadas(m => { const n = abasMontadas(m, screen); return mesmasAbas(m, n) ? m : n; });
  }, [screen]);
  // As de uso diário montam logo depois do primeiro quadro: a primeira visita ao Hoje e ao
  // Chat também é instantânea, sem disputar o arranque com a Início.
  useEffect(() => {
    if (!pairing) return;
    const h = InteractionManager.runAfterInteractions(() => {
      setMontadas(m => { const n = abasMontadas(m, screen, true); return mesmasAbas(m, n) ? m : n; });
    });
    return () => h.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing]);

  /** Fase 18: cada incremento abre as Tarefas em tela cheia (widget e elysium://tarefas). */
  const [pedidoTarefas, setPedidoTarefas] = useState(0);
  /** Fase 22: Rotinas virou gaveta (do Hoje, do card de atalhos, do link antigo). */
  const [rotinasAbertas, setRotinasAbertas] = useState(false);
  /** Fase 22: cada incremento abre o trackpad (atalho do ícone). */
  const [pedidoTrackpad, setPedidoTrackpad] = useState(0);
  /** Contador: cada incremento abre a lupa da Início (widget Busca, bloco 73). */
  const [pedidoBusca, setPedidoBusca] = useState(0);

  const [queued, setQueued] = useState(0);
  /** Gavetas abertas em qualquer tela. Com uma de pé, a TabBar sai — ver GlassModal.tsx. */
  const [sobreposicoes, setSobreposicoes] = useState(0);
  const sobreposicao = useMemo(() => ({
    mais: () => setSobreposicoes(n => n + 1),
    menos: () => setSobreposicoes(n => Math.max(0, n - 1)),
  }), []);

  /** null = ainda não leu; true = mostrar as três telas de boas-vindas. */
  const [onboarding, setOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([loadPairing(), AsyncStorage.getItem(CHAVE_ONBOARDING).catch(() => '1')]).then(([p, visto]) => {
      setPairing(p);
      setOnboarding(!visto);
      setLoading(false);
    }).finally(() => requestAnimationFrame(() => SplashScreen.hide()));
  }, []);

  // O hook troca de endereço sozinho quando o IP do PC muda; persistimos a escolha
  // para a próxima abertura já começar pelo endereço certo.
  const handlePairingUpdate = useCallback((updated: Pairing) => {
    setPairing(updated);
    savePairing(updated).catch((err) => console.warn('[pairing] falha ao persistir', err));
  }, []);

  const { status, recheck, scanning, scanProgress, runScan, hasTunnel } =
    useConnection(pairing, handlePairingUpdate);
  const keyboard = useKeyboard();
  const insets = useSafeAreaInsets();

  const refreshQueueCount = useCallback(async () => {
    setQueued((await listQueue()).length);
  }, []);

  useEffect(() => {
    refreshQueueCount();
  }, [refreshQueueCount, screen]);

  // PC voltou: esvazia a fila de comandos que ficaram presos offline.
  useEffect(() => {
    if (status !== 'online' || !pairing) return;
    let cancelled = false;
    (async () => {
      const pending = await listQueue();
      if (cancelled || pending.length === 0) return;
      setQueued(pending.length);
      await flushQueue(pairing, (item, reply, error) => {
        if (error) console.warn('[fila] falhou ao reenviar', error);
        // Texto do pedido só no log de dev (08/10): o logcat do aparelho não guarda conversa.
        else if (__DEV__) console.log('[fila] reenviado', item.text, '→', reply);
      });
      if (!cancelled) refreshQueueCount();
    })();
    return () => { cancelled = true; };
  }, [status, pairing, refreshQueueCount]);

  // Concilia as conversas quando o PC volta a ficar acessível. Sem isso, o que foi
  // escrito no celular offline só apareceria no PC quando alguém abrisse a lista.
  useEffect(() => {
    if (status !== 'online' || !pairing) return;
    syncChats(pairing);
  }, [status, pairing]);

  // Notificações locais (bloco 72): permissão uma vez, a tarefa de segundo plano
  // registrada, e a sincronização de primeiro plano (ao voltar ao app e a cada 60 s).
  useEffect(() => {
    if (!pairing) return;
    pedirPermissao().catch(() => {});
    registrarTarefa().catch(() => {});
    // O widget Estado ganha dados frescos toda vez que o app volta ao primeiro plano.
    atualizarWidgetEstado(pairing).catch(() => {});
    return ligarSincronizacaoEmPrimeiroPlano(pairing);
  }, [pairing]);

  // Em que pé está o ELYSIUM do PC (08/10): o gravado deste PC e os avisos que chegaram por
  // push ("fechado", "desligando") enquanto o app estava fechado.
  const idPc = pairing ? idDoPc(pairing) : null;
  useEffect(() => {
    if (!idPc) return;
    carregarEstadoPc(true).catch(() => {});
    return ouvirAvisosDoPc();
  }, [idPc]);
  const estadoPc = useEstadoPc();

  const refreshMailboxBadge = useCallback(async () => {
    if (!pairing) return;
    try {
      const items = await listMessages(pairing);
      setMailboxUnread(items.filter((item) => item.from === 'pc' && !item.readAt).length);
    } catch (err) {
      console.warn('[mailbox-badge] falha ao consultar thread', err);
    }
  }, [pairing]);

  useEffect(() => {
    // 24/10: só com o app na frente — no fundo o badge ninguém vê, e a volta já reconsulta.
    if (!pairing || !appNaFrente) return;
    refreshMailboxBadge();
    const interval = setInterval(refreshMailboxBadge, MAILBOX_BADGE_POLL_MS);
    return () => clearInterval(interval);
  }, [pairing, refreshMailboxBadge, appNaFrente]);

  // Reconsulta ao sair do Chat (o usuário pode ter lido recados no lado do PC) em vez de
  // esperar o poll de 45 s.
  useEffect(() => {
    if (screen !== 'chat') refreshMailboxBadge();
  }, [screen, refreshMailboxBadge]);

  // Conteúdo compartilhado de outro app do Android cai direto na Caixa do PC.
  // Bloco 137: o que foi compartilhado pode passar por um comando de IA (ou "Resumir a página").
  const [textoParaIa, setTextoParaIa] = useState<string | null>(null);

  // 22/10: o aviso de enviado/erro mora na própria folha de compartilhar.
  const handleShared = useCallback((_text: string, ok: boolean) => {
    if (!ok) return;
    refreshMailboxBadge();
    // A Caixa deixou de ser uma tela: abre o Chat já no lado do PC, que é onde o recado
    // compartilhado aparece. Sem isto o compartilhamento do Android apontaria para um
    // destino que não existe mais.
    setModoChat('pc');
    setScreen('chat');
  }, [refreshMailboxBadge]);

  useShareIntent(pairing, handleShared);

  // Fase 23: o "Compartilhar" de qualquer app → Ely (vira pergunta no chat) ou PC (Caixa).
  const compartilhadoParaEly = useCallback((texto: string) => {
    setPerguntaPendente(texto); setModoChat('ia'); setScreen('chat');
  }, []);
  const imagemParaEly = useCallback((base64: string, pergunta: string) => {
    pedirSobreImagem(base64, pergunta); setModoChat('ia'); setScreen('chat');
  }, []);
  useCompartilharDoAndroid(pairing, compartilhadoParaEly, handleShared, imagemParaEly);

  // Atalhos do ícone (toque longo, bloco 123). Não uso o useQuickActionCallback da lib: ele
  // refaz o efeito a cada callback novo e dispararia o atalho inicial de novo a cada troca de
  // pareamento. O pareamento vai num ref; o atalho que abriu o app frio espera ele carregar.
  const pairingRef = useRef<Pairing | null>(null);
  pairingRef.current = pairing;
  const atalhoPendente = useRef<QuickActions.Action | null>(QuickActions.initial ?? null);
  const atalho = useCallback(async (a: QuickActions.Action) => {
    const destino = String(a.params?.destino ?? a.id);
    if (destino === 'foco') {
      const p = pairingRef.current;
      if (!p) { atalhoPendente.current = a; return; }
      try {
        const f = await callRpc(p, 'foco.start', { minutos: 25 });
        Alert.alert('Modo foco', `${f.minutos ?? 25} minutos. Discord, Steam e afins viram aviso no PC.`);
      } catch (e) { Alert.alert('Modo foco', errMessage(e)); }
      return;
    }
    if (destino === 'hoje') {
      const p = pairingRef.current;
      if (!p) { atalhoPendente.current = a; return; }
      try {
        const { texto } = await callRpc(p, 'resumo.dia', {}, { timeoutMs: 15000 });
        Alert.alert('Hoje', texto, [{ text: 'Ouvir', onPress: () => { void falar(texto, p); } }, { text: 'OK' }]);
      } catch (e) { Alert.alert('Hoje', errMessage(e)); }
      return;
    }
    if (destino === 'busca') { setScreen('home'); setPedidoBusca(n => n + 1); }
    // Fase 22: o trackpad direto do ícone.
    else if (destino === 'trackpad') { setScreen('control'); setPedidoTrackpad(n => n + 1); }
    // Modo live: o mesmo caminho de dizer "modo live" — o Chat liga a conversa contínua.
    else if (destino === 'live') { setModoChat('ia'); setScreen('chat'); setPedidoVoz(prev => ({ n: (prev?.n ?? 0) + 1, texto: 'modo live' })); }
    // "Falar com a Ely" já abre ouvindo um pedido, como se tivesse dito "Ely" (02/10).
    else if (destino === 'chat') { setModoChat('ia'); setScreen('chat'); setPedidoVoz(prev => ({ n: (prev?.n ?? 0) + 1, texto: '' })); }
  }, []);
  useEffect(() => {
    // Fase 22: trackpad e modo live no lugar de foco e busca (os destinos antigos continuam
    // tratados acima, para atalho já fixado na tela inicial).
    QuickActions.setItems([
      { id: 'chat', title: 'Falar com a Ely', params: { destino: 'chat' } },
      { id: 'trackpad', title: 'Trackpad', params: { destino: 'trackpad' } },
      { id: 'live', title: 'Modo live', params: { destino: 'live' } },
      { id: 'hoje', title: 'Resumo do dia', params: { destino: 'hoje' } },
    ]).catch(() => { /* launcher sem suporte a atalhos */ });
    const sub = QuickActions.addListener((a) => { void atalho(a); });
    return () => sub.remove();
  }, [atalho]);
  useEffect(() => {
    if (!pairing || !atalhoPendente.current) return;
    const a = atalhoPendente.current;
    atalhoPendente.current = null;
    void atalho(a);
  }, [pairing, atalho]);

  // Bloco 129: ouvir "Elysium" só com o app na frente, na Início ou no Chat, com o microfone
  // livre (sem pedido por voz, gravação ou fala em curso) e sem Ajustes aberto por cima.
  const micLivre = useMicrofoneLivre();
  // Teclado aberto também pausa: digitando, não há por que ouvir — e o microfone aberto
  // brigava com o teclado do Android (02/10, "o teclado tá bugado").
  const condicoesPalavra = {
    pareado: Boolean(pairing), ligada: palavraOn, naFrente: appNaFrente, microfoneLivre: micLivre,
    semAjustes: !settingsModalVisible, telaCerta: screen === 'home' || screen === 'chat', semTeclado: !keyboard.visible,
  };
  const palavraAtiva = Object.values(condicoesPalavra).every(Boolean);
  // Por que pausou (para o log do PC): só quando muda.
  const motivoPausaAnterior = useRef('');
  useEffect(() => {
    const motivo = Object.entries(condicoesPalavra).filter(([, v]) => !v).map(([k]) => k).join(', ');
    if (motivo === motivoPausaAnterior.current) return;
    motivoPausaAnterior.current = motivo;
    const p = pairingRef.current;
    if (p && palavraOn) callRpc(p, 'diag.registrar', { origem: 'palavra-cel', linhas: [motivo ? `pausada: ${motivo}` : 'ativa'] }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palavraAtiva, ...Object.values(condicoesPalavra)]);
  usePalavraNoCelular({
    ativo: palavraAtiva,
    aoOuvir: useCallback((resto: string) => {
      setModoChat('ia');
      setScreen('chat');
      setPedidoVoz(prev => ({ n: (prev?.n ?? 0) + 1, texto: resto }));
    }, []),
    aoDesligar: useCallback((d: DiagPalavra) => {
      const p = pairingRef.current;
      if (!p) return;
      const erros = Object.entries(d.erros).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhum';
      callRpc(p, 'diag.registrar', { origem: 'palavra-cel', linhas: [`sessões ${d.sessoes}, disparos ${d.disparos}, erros: ${erros}`] }).catch(() => {});
    }, []),
    // Falha de arranque e serviço escolhido vão na hora — antes o arranque falhava calado.
    aoDiagnostico: useCallback((linha: string) => {
      const p = pairingRef.current;
      if (p) callRpc(p, 'diag.registrar', { origem: 'palavra-cel', linhas: [linha] }).catch(() => {});
    }, []),
  });

  // Deep links dos widgets: elysium://busca, elysium://chat, elysium://pc, elysium://rotinas.
  useDeepLinks(useCallback((destino, url) => {
    if (destino === 'busca') { setScreen('home'); setPedidoBusca(n => n + 1); }
    else if (destino === 'chat') { setModoChat('ia'); setScreen('chat'); }
    else if (destino === 'pc') setScreen('control');
    // Fase 22: Rotinas não é mais aba — o link antigo abre o Hoje com a gaveta.
    else if (destino === 'rotinas') { setScreen('hoje'); setRotinasAbertas(true); }
    else if (destino === 'hoje') setScreen('hoje');
    else if (destino === 'tarefas') { setScreen('hoje'); setPedidoTarefas(n => n + 1); }
    // Widget "Falar com a Ely" (fase 16): o mesmo pedido de voz do "Ely" e do atalho.
    // Fase 20: só o NOSSO widget (com a chave) abre já ouvindo; um link de qualquer outro
    // lugar só abre o Chat — site nenhum liga o microfone sozinho.
    else if (destino === 'falar') {
      setModoChat('ia'); setScreen('chat');
      void urlDoWidget(url).then((nosso) => { if (nosso) setPedidoVoz(prev => ({ n: (prev?.n ?? 0) + 1, texto: '' })); });
    }
    else if (destino === 'inicio') setScreen('home');
  }, []));

  const handlePaired = useCallback(() => {
    setAdicionandoPc(false);
    loadPairing().then(setPairing);
  }, []);

  // "Desparear" esquece o PC ATIVO; se houver outro pareado, ele assume (bloco 121).
  const handleUnpair = useCallback(() => {
    clearPairing().then(loadPairing).then((proximo) => {
      setPairing(proximo);
      setScreen('home');
      setSettingsModalVisible(false);
    });
  }, []);

  const handleTrocarPc = useCallback((id: string) => {
    trocarPc(id).then((p) => {
      if (!p) return;
      setPairing(p);
      setScreen('home');
      setSettingsModalVisible(false);
    });
  }, []);

  const handleAdicionarPc = useCallback(() => {
    setSettingsModalVisible(false);
    setAdicionandoPc(true);
  }, []);

  // 401 na sonda é o único caso em que a rede está boa e o app não tem como se recuperar
  // sozinho: o token foi regenerado no PC. Antes isso aparecia como "PC fora do ar", que
  // mandava a pessoa investigar Wi-Fi e túnel à toa (§15, pendência 4). O hook já parou de
  // sondar; aqui só resta explicar e oferecer o QR.
  useEffect(() => {
    if (status !== 'unauthorized') return;
    Alert.alert(
      'Pareamento inválido',
      'O PC respondeu, mas recusou o token deste celular. Isso acontece quando o QR é regenerado no ELYSIUM. Leia o QR novo para voltar.',
      [{ text: 'Ler QR', onPress: () => setAdicionandoPc(true) }],
      { cancelable: false },
    );
  }, [status]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!pairing || adicionandoPc) {
    return (
      <>
        <PairingScreen onPaired={handlePaired} onCancel={pairing ? () => setAdicionandoPc(false) : undefined} />
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    // O padding do teclado fica aqui, num lugar só, em vez de espalhado por cada tela.
    // `KeyboardAvoidingView` não serve: no edge-to-edge do Android (padrão do Expo
    // desde o SDK 54) o sistema não redimensiona mais a janela, e a caixa de texto
    // simplesmente ficava debaixo do teclado.
    // A engrenagem de Ajustes vive no canto superior direito de todo ScreenHeader, e
    // recebe daqui o que abrir. Ver o comentário em ScreenHeader.tsx: ela saiu da barra
    // de abas porque gaveta não é destino de navegação.
    <AjustesProvider abrir={() => setSettingsModalVisible(true)}>
    <SobreposicaoContext.Provider value={sobreposicao}>
    <View style={{ flex: 1, backgroundColor: palette.background, paddingBottom: keyboard.height }}
      onTouchStart={(e) => registrarToque(e.nativeEvent.pageX, e.nativeEvent.pageY)}>
      {/* Só o fundo entra no alvo de desfoque. Incluir as telas faria cada card de
          vidro tentar desfocar uma árvore que o contém. */}
      <BlurTargetProvider>
        <AppBackground />
      </BlurTargetProvider>
      <TelaAnimada key={idDoPc(pairing)} chave={screen}>
        {montadas.has('home') && (
          <AbaViva ativa={screen === 'home'}>
            <HomeScreen
              pairing={pairing}
              onNavigate={(s) => { if (s === 'rotinas') setRotinasAbertas(true); else setScreen(s); }}
              onOpenPlayer={() => setPlayerOpen(true)}
              onOpenConversation={(id) => { setActiveSessionId(id); setModoChat('ia'); setScreen('chat'); }}
              onPerguntar={(texto) => { setPerguntaPendente(texto); setModoChat('ia'); setScreen('chat'); }}
              onAbrirCaixa={() => { setModoChat('pc'); setScreen('chat'); }}
              onUnpair={handleUnpair}
              pedidoBusca={pedidoBusca}
            />
          </AbaViva>
        )}
        {montadas.has('control') && <AbaViva ativa={screen === 'control'}><ControlScreen pairing={pairing} onUnpair={handleUnpair} pedidoTrackpad={pedidoTrackpad} /></AbaViva>}
        {montadas.has('hoje') && <AbaViva ativa={screen === 'hoje'}><HojeScreen pairing={pairing} pedidoTarefas={pedidoTarefas} onAbrirRotinas={() => setRotinasAbertas(true)} onResponder={(pergunta) => { setFalaDaEly(pergunta); setModoChat('ia'); setScreen('chat'); }} /></AbaViva>}
        {screen === 'conversations' && (
          <AbaViva ativa>
            <ConversationsScreen
              pairing={pairing}
              onSelect={(id) => {
                setActiveSessionId(id);
                setScreen('chat');
              }}
              onNew={() => {
                setActiveSessionId(null);
                setScreen('chat');
              }}
              onBack={() => setScreen('chat')}
            />
          </AbaViva>
        )}
        {/* Chat e Caixa moram no mesmo destino, escolhidos por um switch. Ver ChatHub. */}
        {montadas.has('chat') && (
          <AbaViva ativa={screen === 'chat'}>
            <ChatHub
              pairing={pairing}
              onUnpair={handleUnpair}
              sessionId={activeSessionId}
              onSessionChange={setActiveSessionId}
              onOpenConversations={() => setScreen('conversations')}
              naoLidos={mailboxUnread}
              modoInicial={pedidoModo.modo}
              pedidoModo={pedidoModo.n}
              perguntaPendente={perguntaPendente}
              onPerguntaEnviada={() => setPerguntaPendente(null)}
              falaDaEly={falaDaEly}
              onFalaDaElyMostrada={() => setFalaDaEly(null)}
              pedidoVoz={pedidoVoz}
              onPedidoVozTratado={() => setPedidoVoz(null)}
            />
          </AbaViva>
        )}
      </TelaAnimada>
      {/* Acima da TabBar de propósito: no topo brigaria com o inset de safe area
          que cada ScreenHeader já aplica. */}
      {/* Sem a barra de abas (gaveta aberta), os avisos ficavam debaixo da barra de gestos do
          Android: o recuo da área segura entra só nesse caso (08/10). */}
      <View style={{ paddingBottom: !keyboard.visible && sobreposicoes > 0 ? insets.bottom : 0 }}>
      <ConnectionBanner
        status={status}
        queued={queued}
        scanning={scanning}
        scanProgress={scanProgress}
        hasTunnel={hasTunnel}
        motivo={status === 'offline' || estadoPc.online === false ? descreverEstadoPc(estadoPc) : null}
        onRetry={recheck}
        onScan={runScan}
      />
      <AvisoOta pendente={ota.pendente} />
      </View>
      {/* Sai de cena enquanto o usuário digita: com o teclado aberto sobra pouca
          altura, e a barra empurraria a caixa de texto pra fora da vista. */}
      {!keyboard.visible && sobreposicoes === 0 && (
        <TabBar active={screen} onNavigate={setScreen} badges={{ chat: mailboxUnread }} />
      )}
      {/* Fase 22: no Chat a esfera já mostra a fala — a pílula só aparece nas outras abas. */}
      {screen !== 'chat' && <FalaFlutuante />}
      <StatusBar style="auto" />

      <SpotifyPlayer pairing={pairing} visible={playerOpen} onClose={() => setPlayerOpen(false)} />

      {/* Boas-vindas, uma vez, depois do primeiro pareamento. Por cima de tudo. */}
      {onboarding && <OnboardingScreen onDone={() => setOnboarding(false)} />}

      {/* A gaveta é o ÚLTIMO irmão de propósito: sem o `Modal` nativo, quem a põe por cima
          da barra de abas é a ordem de desenho (mais o zIndex dela). */}
      <GlassModal title="Comandos de IA" visible={textoParaIa !== null} onClose={() => setTextoParaIa(null)}>
        {textoParaIa !== null && <ComandosIa texto={textoParaIa} pairing={pairing} />}
      </GlassModal>
      <GlassModal title="Rotinas" visible={rotinasAbertas} onClose={() => setRotinasAbertas(false)} altura="cheia" semRolagem>
        {rotinasAbertas && <RotinasScreen pairing={pairing} onUnpair={handleUnpair} naGaveta />}
      </GlassModal>
      <GlassModal title="Ajustes" visible={settingsModalVisible} onClose={() => setSettingsModalVisible(false)}>
        <SettingsScreen pairing={pairing} onUnpair={handleUnpair} onTrocarPc={handleTrocarPc} onAdicionarPc={handleAdicionarPc} />
      </GlassModal>
      {/* Fase 23.1: estouros e fogos por cima de tudo (micro-detalhes do PC). */}
      <CamadaEstouros />
      {/* 22/10: a folha de compartilhar própria, por cima até das gavetas. */}
      <FolhaCompartilhar />
    </View>
    </SobreposicaoContext.Provider>
    </AjustesProvider>
  );
}

/**
 * Troca de tela com fade e um deslocamento curto. A navegação daqui é um `if/else` puro —
 * sem biblioteca de navegação, o app trocava de tela de um quadro para o outro, o que lê
 * como travamento e não como transição.
 *
 * 🔴 POR QUE ISTO SAIU DO `Animated` DO CORE. `useNativeDriver: true` tira a interpolação
 * da thread de JS, mas não tira a PARTIDA: quem monta a animação e a entrega para o lado
 * nativo ainda é o JS, e aqui ela começa no mesmo quadro em que a tela nova monta e dispara
 * os RPCs dela. O primeiro quadro da transição competia com exatamente o trabalho que a
 * transição existe para esconder. Com valores compartilhados, a animação já nasce do outro
 * lado — 220 ms, mesma curva, mesmo deslocamento de 8 px.
 */
function TelaAnimada({ chave, children }: { chave: string; children: React.ReactNode }) {
  const opacidade = useSharedValue(1);
  const deslocamento = useSharedValue(0);
  const escala = useSharedValue(1);

  useEffect(() => {
    opacidade.value = 0;
    deslocamento.value = 8;
    escala.value = 0.985;
    // Fase 22: 180 ms — a troca de aba tem que parecer instantânea, só com direção.
    opacidade.value = tempo(1, 180);
    deslocamento.value = tempo(0, 180);
    // Um toque de escala junto com o deslocamento (bloco 74) — a tela "chega", em vez de
    // só aparecer. É o mesmo 0,985 → 1 da troca de aba do desktop.
    escala.value = tempo(1, 180);
  }, [chave]);

  const estilo = useAnimatedStyle(() => ({
    opacity: opacidade.value,
    transform: [{ translateY: deslocamento.value }, { scale: escala.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, estilo]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
