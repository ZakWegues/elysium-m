import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import PairingScreen from './src/screens/PairingScreen';
import ChatScreen from './src/screens/ChatScreen';
import TelemetryScreen from './src/screens/TelemetryScreen';
import PresetsScreen from './src/screens/PresetsScreen';
import { clearPairing, loadPairing, Pairing } from './src/lib/pairing';

type Screen = 'chat' | 'telemetry' | 'presets';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [screen, setScreen] = useState<Screen>('chat');

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
      <View style={styles.center}>
        <ActivityIndicator />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      {pairing ? (
        screen === 'telemetry' ? (
          <TelemetryScreen pairing={pairing} onBack={() => setScreen('chat')} />
        ) : screen === 'presets' ? (
          <PresetsScreen pairing={pairing} onBack={() => setScreen('chat')} />
        ) : (
          <ChatScreen
            pairing={pairing}
            onUnpair={handleUnpair}
            onOpenTelemetry={() => setScreen('telemetry')}
            onOpenPresets={() => setScreen('presets')}
          />
        )
      ) : (
        <PairingScreen onPaired={handlePaired} />
      )}
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
