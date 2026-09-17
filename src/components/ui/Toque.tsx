import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { haptica } from '../../lib/haptica';
import { tempo, MOV, CURVA_UI } from '../../lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Um `Pressable` que responde ao dedo: encolhe 3% ao apertar e volta ao soltar, na
 * thread de UI, com um tique háptico opcional.
 *
 * É a resposta ao toque que o iOS dá de graça e o Android não. Sem ela um card de vidro
 * parece imagem — o dedo aperta, nada acontece até a tela seguinte abrir, e nesse vão a
 * pessoa aperta de novo. O encolhimento é a assinatura do app para "recebi", e por isso
 * mora num componente só: escala e tempo iguais em todo lugar, como manda o bloco 24.
 */
export function Toque({
  haptico = 'leve',
  escala = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  /** Qual resposta tátil dar ao toque. `null` desliga. */
  haptico?: 'leve' | 'medio' | 'tique' | null;
  escala?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const s = useSharedValue(1);
  const estilo = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <AnimatedPressable
      style={[style, estilo]}
      onPressIn={(e) => {
        s.value = tempo(escala, MOV.micro, CURVA_UI);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = tempo(1, MOV.micro, CURVA_UI);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptico) haptica[haptico]();
        onPress?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
