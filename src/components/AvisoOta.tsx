import { Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeInUp, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { GlassFill, Text } from './ui';
import { MOV } from '../lib/motion';
import { aplicarOta } from '../lib/atualizacaoOta';
import { haptica } from '../lib/haptica';

/**
 * "Atualização pronta — Reiniciar agora" (07/10). Mesma faixa fina da conexão, acima da
 * barra de abas. Só aparece com um OTA já BAIXADO: reiniciar é instantâneo e não perde
 * nada além da tela em que se está.
 */
export function AvisoOta({ pendente }: { pendente: boolean }) {
  const { palette, tokens } = useTheme();
  if (!pendente) return null;
  return (
    <Animated.View
      entering={FadeInUp.withInitialValues({ transform: [{ translateY: -8 }] }).duration(MOV.base).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System)}
      style={[styles.bar, { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm, gap: tokens.spacing.sm }]}
    >
      <GlassFill intensity={35} tintColor={palette.primarySoft} edge={false} />
      <Feather name="download-cloud" size={14} color={palette.primary} />
      <Text variant="caption" color={palette.primary} style={{ flex: 1 }}>Atualização pronta</Text>
      <Pressable
        onPress={() => { haptica.medio(); aplicarOta(); }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Reiniciar o app para atualizar"
      >
        <Text variant="label" color={palette.primary}>Reiniciar agora</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
});
