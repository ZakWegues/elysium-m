import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../../theme';

/**
 * Barras de "carregando" no lugar do conteúdo (bloco 92).
 *
 * A Início abria com textos definitivos que ainda não eram verdade — "Defina a cidade nos
 * Ajustes do PC" no clima e "Nada de urgente por aqui" nas sugestões — só porque a primeira
 * leitura ainda não tinha voltado. O esqueleto diz "ainda não sei", que é o estado real.
 * Pulsa só a opacidade, na thread de UI, e para com "reduzir movimento" do Android.
 */
export function Esqueleto({ linhas = 2 }: { linhas?: number }) {
  const { palette } = useTheme();
  const brilho = useSharedValue(0.35);
  useEffect(() => {
    brilho.value = withRepeat(withTiming(0.75, { duration: 800, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, true, undefined, ReduceMotion.System);
  }, [brilho]);
  const estilo = useAnimatedStyle(() => ({ opacity: brilho.value }));
  const larguras = ['92%', '64%', '78%', '48%'] as const;
  return (
    <Animated.View style={[{ gap: 8, paddingVertical: 2 }, estilo]} accessibilityLabel="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <View key={i} style={{ height: 10, width: larguras[i % larguras.length], borderRadius: 5, backgroundColor: palette.primarySoft }} />
      ))}
    </Animated.View>
  );
}
