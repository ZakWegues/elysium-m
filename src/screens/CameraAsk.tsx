import { useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { useKeyboard } from '../lib/useKeyboard';
import { useTheme } from '../theme';
import { Button, Text } from '../components/ui';

/**
 * Fotografar e perguntar.
 *
 * A foto vai para o PC, que a manda para o modelo de visão e devolve a resposta já
 * pronta para ser falada. Serve para ler placa, rótulo, recibo, mensagem de erro numa
 * outra tela — qualquer coisa que seja mais rápido mostrar do que descrever.
 */
export default function CameraAsk({
  pairing,
  visible,
  onClose,
  onAnswer,
}: {
  pairing: Pairing;
  visible: boolean;
  onClose: () => void;
  /** Recebe a pergunta e a resposta para virarem bolhas na conversa. */
  onAnswer: (question: string, answer: string) => void;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView | null>(null);
  const [shot, setShot] = useState<{ uri: string; base64: string } | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setShot(null);
    setQuestion('');
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function take() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Qualidade baixa de propósito: quem lê é um modelo, não o olho. Imagem grande
      // só engorda o upload e a chamada, sem melhorar a leitura.
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (photo?.base64) setShot({ uri: photo.uri, base64: photo.base64 });
      else setError('Não consegui capturar a foto.');
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!shot) return;
    const q = question.trim() || 'O que aparece nesta imagem?';
    setBusy(true);
    setError(null);
    try {
      const res = await callRpc(
        pairing,
        'vision.ask',
        { imageBase64: shot.base64, question: q },
        { timeoutMs: 90000 }
      );
      onAnswer(q, res.answer);
      close();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View
        style={[
          styles.root,
          {
            backgroundColor: palette.background,
            paddingTop: insets.top,
            paddingBottom: keyboard.visible ? keyboard.height : Math.max(insets.bottom, 8),
          },
        ]}
      >
        <View style={[styles.header, { paddingHorizontal: tokens.spacing.lg }]}>
          <Text variant="subheading">{shot ? 'Perguntar sobre a foto' : 'Fotografar'}</Text>
          <Pressable onPress={close} hitSlop={12}>
            <Feather name="x" size={24} color={palette.textMuted} />
          </Pressable>
        </View>

        {!permission?.granted ? (
          <View style={styles.center}>
            <Feather name="camera-off" size={28} color={palette.textMuted} />
            <Text variant="body" color={palette.textMuted} style={{ textAlign: 'center' }}>
              Preciso da câmera para fotografar e perguntar.
            </Text>
            <Button title="Permitir câmera" onPress={requestPermission} />
          </View>
        ) : shot ? (
          <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
            <Image
              source={{ uri: shot.uri }}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: tokens.radii.md }}
              resizeMode="cover"
            />

            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="O que você quer saber? (opcional)"
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                {
                  borderRadius: tokens.radii.md,
                  borderColor: palette.border,
                  color: palette.text,
                  backgroundColor: palette.surface,
                },
              ]}
            />

            {error && <Text variant="caption" color={palette.error}>{error}</Text>}

            <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Tirar outra" variant="secondary" onPress={reset} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Perguntar" onPress={ask} loading={busy} />
              </View>
            </View>
          </ScrollView>
        ) : (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
            {error && (
              <Text variant="caption" color={palette.error} style={{ padding: tokens.spacing.lg }}>
                {error}
              </Text>
            )}
            <View style={styles.shutterRow}>
              <Pressable
                onPress={take}
                disabled={busy}
                style={[styles.shutter, { borderColor: palette.primary }]}
              >
                {busy
                  ? <ActivityIndicator color={palette.primary} />
                  : <View style={[styles.shutterInner, { backgroundColor: palette.primary }]} />}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 12 },
  shutterRow: { alignItems: 'center', paddingVertical: 20 },
  shutter: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28 },
});
