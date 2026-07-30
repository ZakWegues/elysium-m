import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parsePairingQr, savePairing } from '../lib/pairing';
import { checkHealth } from '../lib/api';

export default function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);

  async function handleScan(data: string) {
    if (scanned || busy) return;
    setScanned(true);
    setBusy(true);

    const pairing = parsePairingQr(data);
    if (!pairing) {
      Alert.alert('QR inválido', 'Esse QR code não é do NeuroAxis.');
      setBusy(false);
      setScanned(false);
      return;
    }

    const ok = await checkHealth(pairing);
    if (!ok) {
      Alert.alert('Falha ao conectar', 'Não deu pra falar com o NeuroAxis nesse IP/porta. Confere se o PC tá na mesma rede.');
      setBusy(false);
      setScanned(false);
      return;
    }

    await savePairing(pairing);
    setBusy(false);
    onPaired();
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    if (!permission.canAskAgain) {
      return (
        <View style={styles.center}>
          <Text style={styles.text}>
            Câmera bloqueada pro app. Precisa liberar manualmente nas configurações do celular.
          </Text>
          <Text style={styles.link} onPress={() => Linking.openSettings()}>
            Abrir configurações
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Precisamos da câmera pra escanear o QR de pareamento.</Text>
        <Text style={styles.link} onPress={requestPermission}>
          Permitir câmera
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(result) => handleScan(result.data)}
      />
      <View style={styles.overlay}>
        <Text style={styles.text}>
          {busy ? 'Conectando...' : 'Aponte pro QR code de pareamento do NeuroAxis'}
        </Text>
        {busy && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  overlay: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  text: { color: '#fff', textAlign: 'center', fontSize: 16 },
  link: { color: '#4da3ff', fontSize: 16, marginTop: 8, textDecorationLine: 'underline' },
});
