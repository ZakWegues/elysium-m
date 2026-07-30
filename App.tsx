import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PairingScreen from './src/screens/PairingScreen';
import ChatScreen from './src/screens/ChatScreen';
import TelemetryScreen from './src/screens/TelemetryScreen';
import PresetsScreen from './src/screens/PresetsScreen';
import MailboxScreen from './src/screens/MailboxScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import { clearPairing, loadPairing, Pairing } from './src/lib/pairing';
import { listMessages } from './src/lib/mailbox';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/theme';
import { TabBar, Screen } from './src/components/TabBar';
import { GlassModal } from './src/components/ui';

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
  const [screen, setScreen] = useState<Screen>('chat');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [mailboxUnread, setMailboxUnread] = useState(0);
  const [presetsModalVisible, setPresetsModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  useEffect(() => {
    loadPairing().then((p) => {
      setPairing(p);
      setLoading(false);
    });
  }, []);

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
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1 }}>
        {screen === 'telemetry' && <TelemetryScreen pairing={pairing} />}
        {screen === 'mailbox' && <MailboxScreen pairing={pairing} onUnpair={handleUnpair} />}
        {screen === 'conversations' && (
          <ConversationsScreen
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
      <TabBar
        active={screen}
        onNavigate={setScreen}
        onOpenModal={(target) => (target === 'presets' ? setPresetsModalVisible(true) : setSettingsModalVisible(true))}
        badges={{ mailbox: mailboxUnread }}
      />
      <StatusBar style="auto" />

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
