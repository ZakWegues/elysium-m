import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme';
import { Text } from './ui';
import { useAbaAtiva } from './AbaViva';

/**
 * O "reator" (fase 16, tema Stark): anel de progresso no centro, um anel tracejado girando
 * devagar por fora e um fino no sentido contrário. `vivo` acelera — é o mesmo sinal que o
 * desktop usa quando ela ouve, pensa ou fala. Com redução de movimento ligada no aparelho,
 * os anéis param (o Reanimated respeita `ReduceMotion.System`).
 */
export function Reator({ tamanho = 84, fracao, rotulo, sub, vivo = false }: {
  tamanho?: number;
  /** 0–1: quanto do anel acende. */
  fracao: number;
  rotulo?: string;
  sub?: string;
  vivo?: boolean;
}) {
  const { palette } = useTheme();
  const giro = useSharedValue(0);
  // 31/10: com a aba escondida (abas vivas), o anel para de girar — custava bateria à toa.
  const ativa = useAbaAtiva();
  useEffect(() => {
    cancelAnimation(giro);
    if (!ativa) return;
    giro.value = 0;
    giro.value = withRepeat(withTiming(360, { duration: vivo ? 3000 : 14000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    return () => cancelAnimation(giro);
  }, [vivo, giro, ativa]);
  const externo = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value}deg` }] }));
  const interno = useAnimatedStyle(() => ({ transform: [{ rotate: `${-giro.value * 2}deg` }] }));

  const r = tamanho / 2 - 8;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fracao));
  return (
    <View style={{ width: tamanho, height: tamanho }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}>
      <Animated.View style={[StyleSheet.absoluteFill, externo]}>
        <Svg width={tamanho} height={tamanho}>
          <Circle cx={tamanho / 2} cy={tamanho / 2} r={tamanho / 2 - 1.5} stroke={palette.primary} strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="4 6" fill="none" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, interno]}>
        <Svg width={tamanho} height={tamanho}>
          <Circle cx={tamanho / 2} cy={tamanho / 2} r={r + 4} stroke={palette.primary} strokeOpacity={0.35} strokeWidth={1} strokeDasharray={`${c / 6} ${c / 12}`} fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={tamanho} height={tamanho} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={tamanho / 2} cy={tamanho / 2} r={r} stroke={palette.primary} strokeOpacity={0.15} strokeWidth={5} fill="none" />
        <Circle cx={tamanho / 2} cy={tamanho / 2} r={r} stroke={palette.primary} strokeWidth={5} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
      </Svg>
      {rotulo !== undefined && (
        <View style={[StyleSheet.absoluteFill, styles.centro]} pointerEvents="none">
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>{rotulo}</Text>
          {sub ? <Text variant="caption" color={palette.textMuted}>{sub}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', justifyContent: 'center' },
});
