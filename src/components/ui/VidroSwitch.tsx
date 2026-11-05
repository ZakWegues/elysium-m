import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { haptica } from '../../lib/haptica';
import { VidroNativo, VIDRO_NATIVO } from '../vidro/VidroNativo';
import { MOLA_APERTO, MOLA_SOLTA } from './aperto';

const LARGURA = 52, ALTURA = 28, POLEGAR = 24, FOLGA = 2;
// Segurado, o polegar cresce (como o da Glisse) e vira lente.
const SEGURADO_L = 34, SEGURADO_A = 30;

/**
 * 04/11: o interruptor no jeito da Glisse (github.com/0kzh/glisse, MIT). Trilha de vidro
 * rebaixado, polegar branco. Segurado, o polegar cresce, fica transparente e vira lente (o
 * vidro nativo, perfil "lente": squircle e refração de Snell); a troca de lado vai de mola, e
 * passa um pouco do ponto antes de assentar. Substitui o `Switch` do sistema: mesma API.
 */
export function VidroSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange?: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { palette, familiaResolvida } = useTheme();
  const lente = VIDRO_NATIVO && familiaResolvida !== 'stark';
  const [segurado, setSegurado] = useState(false);
  const lado = useSharedValue(value ? 1 : 0);
  const pega = useSharedValue(0);

  useEffect(() => { lado.value = withSpring(value ? 1 : 0, MOLA_SOLTA); }, [value, lado]);

  const estiloPolegar = useAnimatedStyle(() => {
    const w = POLEGAR + (SEGURADO_L - POLEGAR) * pega.value;
    const h = POLEGAR + (SEGURADO_A - POLEGAR) * pega.value;
    return {
      width: w,
      height: h,
      top: (ALTURA - h) / 2,
      transform: [{ translateX: FOLGA + (LARGURA - 2 * FOLGA - w) * lado.value }],
    };
  });
  const estiloBranco = useAnimatedStyle(() => ({ opacity: 1 - 0.85 * pega.value }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => { haptica.tique(); onValueChange?.(!value); }}
      onPressIn={() => { pega.value = withSpring(1, MOLA_APERTO); setSegurado(true); }}
      onPressOut={() => { pega.value = withSpring(0, MOLA_SOLTA); setSegurado(false); }}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={{ width: LARGURA, height: ALTURA, opacity: disabled ? 0.45 : 1 }}
    >
      <View style={[styles.trilha, { backgroundColor: value ? palette.primary : 'rgba(0,0,0,0.28)' }]} />
      <Animated.View pointerEvents="none" style={[styles.polegar, estiloPolegar]}>
        {lente && segurado && <VidroNativo alvo={null} lente={22} perfil={1} brilho={0.6} tinta={[1, 1, 1, 0.06]} reserva={null} />}
        <Animated.View style={[StyleSheet.absoluteFill, styles.branco, estiloBranco]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trilha: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: ALTURA / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  polegar: {
    position: 'absolute',
    left: 0,
    borderRadius: 999,
    overflow: 'hidden',
    elevation: 3,
  },
  branco: { backgroundColor: '#fff', borderRadius: 999 },
});
