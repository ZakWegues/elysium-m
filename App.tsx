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
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/theme';
import { TabBar, Screen } from './src/components/TabBar';

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

  useEffect(() => {
    loadPairing().then((p) => {
      setPairing(p);
      setLoading(false);
    });
  }, []);

  const handlePaired = useCallback(() => {
    loadPairing().then(setPairing);
  }, []);

  const handleUnpair = useCallback(() => {
    clearPairing().then(() => {
      setPairing(null);
      setScreen('chat');
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
        {screen === 'presets' && <PresetsScreen pairing={pairing} onUnpair={handleUnpair} />}
        {screen === 'mailbox' && <MailboxScreen pairing={pairing} onUnpair={handleUnpair} />}
        {screen === 'settings' && <SettingsScreen pairing={pairing} onUnpair={handleUnpair} />}
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
      <TabBar active={screen} onNavigate={setScreen} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
