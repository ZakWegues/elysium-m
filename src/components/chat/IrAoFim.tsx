import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { haptica } from '../../lib/haptica';
import { useTheme } from '../../theme';
import { Text, VIDRO_BOTAO } from '../ui';

/** 25/11: desce ao fim da conversa; "Novas" quando chegou algo enquanto ele lia lá em cima. */
export function IrAoFim({ visivel, novas, acima, aoTocar }: { visivel: boolean; novas: boolean; acima: number; aoTocar: () => void }) {
  const { palette } = useTheme();
  if (!visivel) return null;
  return (
    <Animated.View entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      pointerEvents="box-none" style={[styles.lugar, { bottom: acima }]}>
      <Pressable onPress={() => { haptica.leve(); aoTocar(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={novas ? 'Ver a mensagem nova' : 'Ir para o fim'}
        style={({ pressed }) => [styles.botao, VIDRO_BOTAO, { backgroundColor: palette.background, borderColor: novas ? palette.primary : palette.border, opacity: pressed ? 0.7 : 1 }]}>
        <Feather name="arrow-down" size={16} color={novas ? palette.primary : palette.textMuted} />
        {novas ? <View><Text variant="caption" color={palette.primary}>Novas</Text></View> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lugar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  botao: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minWidth: 38, height: 38, paddingHorizontal: 11, borderRadius: 19, borderWidth: 1 },
});
