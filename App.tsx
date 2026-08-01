import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PairingScreen from './src/screens/PairingScreen';
import ChatScreen from './src/screens/ChatScreen';
import ControlScreen from './src/screens/ControlScreen';
import HomeScreen from './src/screens/HomeScreen';
import SpotifyPlayer from './src/screens/SpotifyPlayer';
import PresetsScreen from './src/screens/PresetsScreen';
import MailboxScreen from './src/screens/MailboxScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import { clearPairing, loadPairing, savePairing, Pairing } from './src/lib/pairing';
import { listMessages } from './src/lib/mailbox';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/theme';
import { TabBar, Screen } from './src/components/TabBar';
import { AppBackground, BlurTargetProvider, GlassModal } from './src/components/ui';
import { ConnectionBanner } from './src/components/ConnectionBanner';
import { useConnection } from './src/lib/useConnection';
import { useKeyboard } from './src/lib/useKeyboard';
import { flushQueue, listQueue } from './src/lib/commandQueue';
import { syncChats } from './src/lib/chatSync';
import { useShareIntent } from './src/lib/shareIntent';

const MAILBOX_BADGE_POLL_MS = 45000;

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </SafeAreaProvider>
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
  const [presetsModalVisible, setPresetsModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [queued, setQueued] = useState(0);

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

  // Reconsulta ao sair da Caixa (usuário pode ter lido itens lá) em vez de esperar o poll.
  useEffect(() => {
    if (screen !== 'mailbox') refreshMailboxBadge();
  }, [screen, refreshMailboxBadge]);

  // Conteúdo compartilhado de outro app do Android cai direto na Caixa do PC.
  const handleShared = useCallback((text: string, ok: boolean) => {
    Alert.alert(
      ok ? 'Enviado pro PC' : 'Não consegui enviar',
      ok ? text.slice(0, 120) : 'O PC está fora de alcance. Tente de novo quando ele voltar.'
    );
    if (ok) refreshMailboxBadge();
  }, [refreshMailboxBadge]);

  useShareIntent(pairing, handleShared);

  const handlePaired = useCallback(() => {
    loadPairing().then(setPairing);
  }, []);

  const handleUnpair = useCallback(() => {
    clearPairing().then(() => {
      setPairing(null);
      setScreen('chat');
      setPresetsModalVisible(false);
      setSettingsModalVisible(false);
    });
  }, []);

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
    <View style={{ flex: 1, backgroundColor: palette.background, paddingBottom: keyboard.height }}>
      {/* Só o fundo entra no alvo de desfoque. Incluir as telas faria cada card de
          vidro tentar desfocar uma árvore que o contém. */}
      <BlurTargetProvider>
        <AppBackground />
      </BlurTargetProvider>
      <View style={{ flex: 1 }}>
        {screen === 'home' && (
          <HomeScreen
            pairing={pairing}
            onNavigate={setScreen}
            onOpenPlayer={() => setPlayerOpen(true)}
            onUnpair={handleUnpair}
          />
        )}
        {screen === 'control' && <ControlScreen pairing={pairing} onUnpair={handleUnpair} />}
        {screen === 'mailbox' && <MailboxScreen pairing={pairing} onUnpair={handleUnpair} />}
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
        {screen === 'chat' && (
          <ChatScreen
            pairing={pairing}
            onUnpair={handleUnpair}
            sessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onOpenConversations={() => setScreen('conversations')}
          />
        )}
      </View>
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
      {!keyboard.visible && (
        <TabBar
          active={screen}
          onNavigate={setScreen}
          onOpenModal={(target) => (target === 'presets' ? setPresetsModalVisible(true) : setSettingsModalVisible(true))}
          badges={{ mailbox: mailboxUnread }}
        />
      )}
      <StatusBar style="auto" />

      <SpotifyPlayer pairing={pairing} visible={playerOpen} onClose={() => setPlayerOpen(false)} />

      <GlassModal title="Presets" visible={presetsModalVisible} onClose={() => setPresetsModalVisible(false)}>
        <PresetsScreen pairing={pairing} onUnpair={handleUnpair} />
      </GlassModal>

      <GlassModal title="Ajustes" visible={settingsModalVisible} onClose={() => setSettingsModalVisible(false)}>
        <SettingsScreen pairing={pairing} onUnpair={handleUnpair} />
      </GlassModal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
