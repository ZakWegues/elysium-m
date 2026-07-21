import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import PairingScreen from './src/screens/PairingScreen';
import ChatScreen from './src/screens/ChatScreen';
import { clearPairing, loadPairing, Pairing } from './src/lib/pairing';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<Pairing | null>(null);

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
    clearPairing().then(() => setPairing(null));
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
        <ChatScreen pairing={pairing} onUnpair={handleUnpair} />
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
