import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PairingScreen from './src/screens/PairingScreen';
import ChatHub from './src/screens/ChatHub';
import ControlScreen from './src/screens/ControlScreen';
import HomeScreen from './src/screens/HomeScreen';
import SpotifyPlayer from './src/screens/SpotifyPlayer';
import SettingsScreen from './src/screens/SettingsScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import { clearPairing, loadPairing, savePairing, Pairing } from './src/lib/pairing';
import { listMessages } from './src/lib/mailbox';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/theme';
import { TabBar, Screen } from './src/components/TabBar';
import { AjustesProvider, AppBackground, BlurTargetProvider, GlassModal, SobreposicaoContext } from './src/components/ui';
import { ConnectionBanner } from './src/components/ConnectionBanner';
import { useConnection } from './src/lib/useConnection';
import { useKeyboard } from './src/lib/useKeyboard';
import { flushQueue, listQueue } from './src/lib/commandQueue';
import { syncChats } from './src/lib/chatSync';
import { useShareIntent } from './src/lib/shareIntent';
import { MOV, tempo } from './src/lib/motion';

const MAILBOX_BADGE_POLL_MS = 45000;

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
  const [screen, setScreen] = useState<Screen>('home');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [mailboxUnread, setMailboxUnread] = useState(0);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  /** Em qual lado do switch o Chat abre — o compartilhamento do Android força o lado do PC. */
  const [modoChat, setModoChat] = useState<'ia' | 'pc'>('ia');
  /** Texto que a busca da Início mandou para o chat; o ChatScreen envia ao abrir e limpa. */
  const [perguntaPendente, setPerguntaPendente] = useState<string | null>(null);

  const [queued, setQueued] = useState(0);
  /** Gavetas abertas em qualquer tela. Com uma de pé, a TabBar sai — ver GlassModal.tsx. */
  const [sobreposicoes, setSobreposicoes] = useState(0);
  const sobreposicao = useMemo(() => ({
    mais: () => setSobreposicoes(n => n + 1),
    menos: () => setSobreposicoes(n => Math.max(0, n - 1)),
  }), []);

  useEffect(() => {
    loadPairing().then((p) => {
      setPairing(p);
      setLoading(false);
    });
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
        if (error) console.warn('[fila] falhou ao reenviar', item.text, error);
        else console.log('[fila] reenviado', item.text, '→', reply);
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
    if (!pairing) return;
    refreshMailboxBadge();
    const interval = setInterval(refreshMailboxBadge, MAILBOX_BADGE_POLL_MS);
    return () => clearInterval(interval);
  }, [pairing, refreshMailboxBadge]);

  // Reconsulta ao sair do Chat (o usuário pode ter lido recados no lado do PC) em vez de
  // esperar o poll de 45 s.
  useEffect(() => {
    if (screen !== 'chat') refreshMailboxBadge();
  }, [screen, refreshMailboxBadge]);

  // Conteúdo compartilhado de outro app do Android cai direto na Caixa do PC.
  const handleShared = useCallback((text: string, ok: boolean) => {
    Alert.alert(
      ok ? 'Enviado pro PC' : 'Não consegui enviar',
      ok ? text.slice(0, 120) : 'O PC está fora de alcance. Tente de novo quando ele voltar.'
    );
    if (!ok) return;
    refreshMailboxBadge();
    // A Caixa deixou de ser uma tela: abre o Chat já no lado do PC, que é onde o recado
    // compartilhado aparece. Sem isto o compartilhamento do Android apontaria para um
    // destino que não existe mais.
    setModoChat('pc');
    setScreen('chat');
  }, [refreshMailboxBadge]);

  useShareIntent(pairing, handleShared);

  const handlePaired = useCallback(() => {
    loadPairing().then(setPairing);
  }, []);

  const handleUnpair = useCallback(() => {
    clearPairing().then(() => {
      setPairing(null);
      setScreen('home');
      setSettingsModalVisible(false);
    });
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
      [{ text: 'Ler QR', onPress: handleUnpair }],
      { cancelable: false },
    );
  }, [status, handleUnpair]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!pairing) {
    return (
      <>
        <PairingScreen onPaired={handlePaired} />
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
    <View style={{ flex: 1, backgroundColor: palette.background, paddingBottom: keyboard.height }}>
      {/* Só o fundo entra no alvo de desfoque. Incluir as telas faria cada card de
          vidro tentar desfocar uma árvore que o contém. */}
      <BlurTargetProvider>
        <AppBackground />
      </BlurTargetProvider>
      <TelaAnimada chave={screen}>
        {screen === 'home' && (
          <HomeScreen
            pairing={pairing}
            onNavigate={setScreen}
            onOpenPlayer={() => setPlayerOpen(true)}
            onOpenConversation={(id) => { setActiveSessionId(id); setModoChat('ia'); setScreen('chat'); }}
            onPerguntar={(texto) => { setPerguntaPendente(texto); setModoChat('ia'); setScreen('chat'); }}
            onUnpair={handleUnpair}
          />
        )}
        {screen === 'control' && <ControlScreen pairing={pairing} onUnpair={handleUnpair} />}
        {screen === 'conversations' && (
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
        )}
        {/* Chat e Caixa moram no mesmo destino, escolhidos por um switch. Ver ChatHub. */}
        {screen === 'chat' && (
          <ChatHub
            pairing={pairing}
            onUnpair={handleUnpair}
            sessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onOpenConversations={() => setScreen('conversations')}
            naoLidos={mailboxUnread}
            modoInicial={modoChat}
            perguntaPendente={perguntaPendente}
            onPerguntaEnviada={() => setPerguntaPendente(null)}
          />
        )}
      </TelaAnimada>
      {/* Acima da TabBar de propósito: no topo brigaria com o inset de safe area
          que cada ScreenHeader já aplica. */}
      <ConnectionBanner
        status={status}
        queued={queued}
        scanning={scanning}
        scanProgress={scanProgress}
        hasTunnel={hasTunnel}
        onRetry={recheck}
        onScan={runScan}
      />
      {/* Sai de cena enquanto o usuário digita: com o teclado aberto sobra pouca
          altura, e a barra empurraria a caixa de texto pra fora da vista. */}
      {!keyboard.visible && sobreposicoes === 0 && (
        <TabBar active={screen} onNavigate={setScreen} badges={{ chat: mailboxUnread }} />
      )}
      <StatusBar style="auto" />

      <SpotifyPlayer pairing={pairing} visible={playerOpen} onClose={() => setPlayerOpen(false)} />

      {/* A gaveta é o ÚLTIMO irmão de propósito: sem o `Modal` nativo, quem a põe por cima
          da barra de abas é a ordem de desenho (mais o zIndex dela). */}
      <GlassModal title="Ajustes" visible={settingsModalVisible} onClose={() => setSettingsModalVisible(false)}>
        <SettingsScreen pairing={pairing} onUnpair={handleUnpair} />
      </GlassModal>
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

  useEffect(() => {
    opacidade.value = 0;
    deslocamento.value = 8;
    opacidade.value = tempo(1, MOV.base);
    deslocamento.value = tempo(0, MOV.base);
  }, [chave]);

  const estilo = useAnimatedStyle(() => ({
    opacity: opacidade.value,
    transform: [{ translateY: deslocamento.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, estilo]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
