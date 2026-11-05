import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { VidroNativo, VIDRO_NATIVO } from '../vidro/VidroNativo';

/**
 * 04/11: o vidro líquido nativo como FUNDO de um chip ou pílula — o primeiro filho dela. Pouca
 * lente e pouco brilho (são muitos e pequenos); a forma é sempre pílula. `cor` tinge por cima
 * (o chip ligado), porque o vidro cobre o `backgroundColor` da própria pílula. Stark e
 * Android < 13: nada (fica o fundo de sempre do chip).
 */
export function FundoVidro({ cor }: { cor?: string }) {
  const { familiaResolvida } = useTheme();
  if (!VIDRO_NATIVO || familiaResolvida === 'stark') return null;
  return (
    <>
      <VidroNativo alvo={null} lente={4} brilho={0.25} reserva={null} />
      {cor && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: cor, borderRadius: 999 }]} />}
    </>
  );
}
