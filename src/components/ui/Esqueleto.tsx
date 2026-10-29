import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { comAlfa, useTheme } from '../../theme';

/**
 * Barras de "carregando" no lugar do conteúdo (bloco 92).
 *
 * A Início abria com textos definitivos que ainda não eram verdade — "Defina a cidade nos
 * Ajustes do PC" no clima e "Nada de urgente por aqui" nas sugestões — só porque a primeira
 * leitura ainda não tinha voltado. O esqueleto diz "ainda não sei", que é o estado real.
 *
 * 31/10: no lugar do pulso, um brilho que passa (shimmer) da esquerda para a direita, na
 * thread de UI. Para com "reduzir movimento" do Android.
 */
const FAIXA = 90;

export function Esqueleto({ linhas = 2 }: { linhas?: number }) {
  const { palette } = useTheme();
  const [largura, setLargura] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false, undefined, ReduceMotion.System);
    return () => cancelAnimation(p);
  }, [p]);
  const brilho = useAnimatedStyle(() => ({ transform: [{ translateX: -FAIXA + p.value * (largura + FAIXA) }] }));
  const larguras = ['92%', '64%', '78%', '48%'] as const;
  return (
    <View style={{ gap: 8, paddingVertical: 2 }} accessibilityLabel="Carregando" onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      {Array.from({ length: linhas }, (_, i) => (
        <View key={i} style={{ height: 10, width: larguras[i % larguras.length], borderRadius: 5, backgroundColor: palette.primarySoft, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: FAIXA }, brilho]}>
            <LinearGradient
              colors={[comAlfa(palette.primary, 0), comAlfa(palette.primary, 0.28), comAlfa(palette.primary, 0)]}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      ))}
    </View>
  );
}
