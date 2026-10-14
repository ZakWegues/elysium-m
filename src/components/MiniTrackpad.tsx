import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { CanalInput } from '../lib/inputCanal';
import { acelerar, SENSIBILIDADE_PADRAO } from '../lib/trackpad';
import { haptica } from '../lib/haptica';
import { useTheme } from '../theme';
import { Card, Text } from './ui';

/**
 * O trackpad na própria aba PC (fase 22): um botão grande que abre a tela cheia e, ao lado,
 * uma faixa de toque que já move o cursor ali mesmo (arrastar move, toque clica). O canal só
 * abre no primeiro toque e fecha depois de 30 s parado — a aba PC não segura um WebSocket à toa.
 */
export function MiniTrackpad({ pairing, onAbrir }: { pairing: Pairing; onAbrir: () => void }) {
  const { palette, tokens } = useTheme();
  const canal = useRef<CanalInput | null>(null);
  const ocioso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef(0);

  const garantirCanal = () => {
    if (!canal.current) { canal.current = new CanalInput(pairing); canal.current.abrir(); }
    if (ocioso.current) clearTimeout(ocioso.current);
    ocioso.current = setTimeout(() => { canal.current?.fechar(); canal.current = null; }, 30_000);
    return canal.current;
  };
  useEffect(() => () => {
    if (ocioso.current) clearTimeout(ocioso.current);
    canal.current?.fechar();
    canal.current = null;
  }, [pairing]);

  const mover = Gesture.Pan().runOnJS(true).maxPointers(1).minDistance(4)
    .onBegin(() => { garantirCanal(); ultimo.current = 0; })
    .onChange((e) => {
      const agora = Date.now();
      const dt = ultimo.current ? Math.min(100, agora - ultimo.current) : 16;
      ultimo.current = agora;
      const [x, y] = acelerar(e.changeX, e.changeY, dt, SENSIBILIDADE_PADRAO);
      garantirCanal().enviar(['m', x, y]);
    });
  const clicar = Gesture.Tap().runOnJS(true).maxDuration(250).maxDistance(10)
    .onEnd((_e, ok) => { if (ok) { void haptica.leve(); garantirCanal().enviar(['c', 'left']); } });

  return (
    <Card glass style={styles.cartao}>
      <Pressable onPress={() => { void haptica.medio(); onAbrir(); }} accessibilityLabel="Abrir o trackpad em tela cheia"
        style={[styles.botao, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
        <Feather name="move" size={26} color={palette.primary} />
        <Text variant="label" color={palette.primary}>Trackpad</Text>
        <Feather name="maximize-2" size={13} color={palette.textMuted} />
      </Pressable>
      <GestureDetector gesture={Gesture.Race(mover, clicar)}>
        <View style={[styles.faixa, { borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}>
          <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center' }} pointerEvents="none">
            arraste aqui para mover{'\n'}toque para clicar
          </Text>
        </View>
      </GestureDetector>
    </Card>
  );
}

const styles = StyleSheet.create({
  cartao: { flexDirection: 'row', gap: 10, padding: 10 },
  botao: { width: 110, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14 },
  faixa: { flex: 1, minHeight: 96, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
