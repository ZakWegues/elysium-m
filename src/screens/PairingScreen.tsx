import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Feather from '@expo/vector-icons/Feather';
import { parsePairingQr, resolveActiveEndpoint, savePairing, UnauthorizedError } from '../lib/pairing';
import { useTheme } from '../theme';
import { Button, Text } from '../components/ui';

export default function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const { palette, tokens } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);

  async function handleScan(data: string) {
    if (scanned || busy) return;
    setScanned(true);
    setBusy(true);

    const pairing = parsePairingQr(data);
    if (!pairing) {
      Alert.alert('QR inválido', 'Esse QR code não é do ELYSIUM.');
      setBusy(false);
      setScanned(false);
      return;
    }

    // Corre TODOS os endereços do QR, igual à reconexão faz. Testar só o primeiro
    // era o bug: o QR traz o IP da rede local e o do túnel, e a lista começa pelo
    // local — com o celular fora de casa, ou com o caminho local indisponível por
    // qualquer motivo, o pareamento falhava mesmo com o túnel funcionando.
    let resolved;
    try {
      resolved = await resolveActiveEndpoint(pairing);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        Alert.alert(
          'Acesso negado',
          'O QR code foi reconhecido, mas o token é inválido. Gere um novo QR code no ELYSIUM e tente de novo.'
        );
      } else {
        Alert.alert('Erro interno', 'Ocorreu um erro ao verificar a conexão.');
      }
      setBusy(false);
      setScanned(false);
      return;
    }

    if (!resolved) {
      Alert.alert(
        'Falha ao conectar',
        'Não consegui falar com o ELYSIUM em nenhum dos endereços do QR.\n\n' +
        'Confira se o app está aberto no PC. Se você não está na rede de casa, ' +
        'o Tailscale precisa estar ligado nos dois aparelhos.'
      );
      setBusy(false);
      setScanned(false);
      return;
    }

    // `resolveActiveEndpoint` já grava, mas só quando troca de endereço — no caminho
    // em que o primeiro responde, nada foi salvo ainda.
    await savePairing(resolved);
    setBusy(false);
    onPaired();
  }

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    if (!permission.canAskAgain) {
      return (
        <View style={[styles.center, { backgroundColor: palette.background, padding: tokens.spacing.xl, gap: tokens.spacing.md }]}>
          <Feather name="camera-off" size={32} color={palette.textMuted} />
          <Text variant="subheading" style={{ textAlign: 'center' }}>
            Câmera bloqueada pro app
          </Text>
          <Text variant="body" color={palette.textMuted} style={{ textAlign: 'center' }}>
            Precisa liberar manualmente nas configurações do celular.
          </Text>
          <Button title="Abrir configurações" onPress={() => Linking.openSettings()} />
        </View>
      );
    }
    return (
      <View style={[styles.center, { backgroundColor: palette.background, padding: tokens.spacing.xl, gap: tokens.spacing.md }]}>
        <Feather name="camera" size={32} color={palette.primary} />
        <Text variant="subheading" style={{ textAlign: 'center' }}>
          Precisamos da câmera
        </Text>
        <Text variant="body" color={palette.textMuted} style={{ textAlign: 'center' }}>
          Pra escanear o QR de pareamento do ELYSIUM.
        </Text>
        <Button title="Permitir câmera" onPress={requestPermission} />
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
      <View style={[styles.frame, { borderColor: palette.accent }]} />
      <View
        style={[
          styles.overlay,
          { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: tokens.radii.lg, padding: tokens.spacing.lg },
        ]}
      >
        <Text variant="body" color="#fff" style={{ textAlign: 'center' }}>
          {busy ? 'Conectando...' : 'Aponte pro QR code de pareamento do ELYSIUM'}
        </Text>
        {busy && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    right: '15%',
    bottom: '40%',
    borderWidth: 2,
    borderRadius: 24,
  },
  overlay: {
    position: 'absolute',
    bottom: 56,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
});
