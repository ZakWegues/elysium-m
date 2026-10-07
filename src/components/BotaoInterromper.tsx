import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Text } from './ui';
import { pararDeFalar, useFalando } from '../lib/falar';
import { haptica } from '../lib/haptica';

/**
 * "Interromper" enquanto a Ely fala (02/10).
 *
 * Com a mão livre, parar a fala era dizer "chega" ou tocar no X da faixa do Chat. A mão livre
 * saiu, e a fala também acontece fora do Chat (card da Início, Ouvir, foto respondida). Uma
 * pílula só, no topo, por cima de qualquer tela, enquanto houver fala — no topo porque embaixo
 * cobriria o campo de texto e a barra de abas; 64 px abaixo do topo para não tapar o cabeçalho
 * (o switch IA/PC do Chat ficava embaixo dela).
 */
export function BotaoInterromper() {
  const falando = useFalando();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  if (!falando) return null;
  return (
    <View pointerEvents="box-none" style={[styles.camada, { top: insets.top + 64 }]}>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)}>
        <Pressable
          onPress={() => { haptica.leve(); pararDeFalar(); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Interromper a fala da Ely"
          style={({ pressed }) => [
            styles.pilula,
            { backgroundColor: palette.surface, borderColor: palette.primary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="square" size={14} color={palette.primary} />
          <Text variant="caption" color={palette.primary}>Interromper</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50, elevation: 50 },
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
  },
});
