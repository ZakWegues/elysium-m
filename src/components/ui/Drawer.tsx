import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate, runOnJS, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { CURVA_UI, LAYOUT, MOV, tempo } from '../../lib/motion';
import { useTheme } from '../../theme';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Seção recolhível. O conteúdo só é montado quando aberta — várias destas na mesma
 * tela consultariam o PC em paralelo se montassem todas de uma vez.
 *
 * A transição nunca pôde usar `LayoutAnimation`: na Nova Arquitetura (padrão desde o SDK
 * 54) o opt-in `setLayoutAnimationEnabledExperimental` é no-op e só rendia aviso no
 * console. O que era `Animated` do core agora é worklet — opacidade e rotação são
 * calculadas na thread de UI, e o `layout={LAYOUT}` do cartão interpola a altura que
 * aparecer, que é a parte que o `LayoutAnimation` prometia e não entregava.
 *
 * Os tempos são os do bloco 24 e não mudaram: 160 ms para abrir, 120 para fechar.
 */
export function Drawer({
  title,
  icon,
  subtitle,
  children,
  defaultOpen = false,
  onOpen,
  right,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Chamado quando abre — bom lugar pra disparar o primeiro carregamento. */
  onOpen?: () => void;
  right?: ReactNode;
}) {
  const { palette, tokens } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const anim = useSharedValue(defaultOpen ? 1 : 0);

  const fechar = () => setOpen(false);

  function toggle() {
    if (open) {
      // Desmonta só no fim, senão o conteúdo some antes de terminar de desaparecer.
      anim.value = tempo(0, MOV.micro, CURVA_UI, (fim?: boolean) => {
        'worklet';
        if (fim) runOnJS(fechar)();
      });
    } else {
      setOpen(true);
      onOpen?.();
      anim.value = tempo(1, 160, CURVA_UI);
    }
  }

  const seta = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(anim.value, [0, 1], [0, 180])}deg` }],
  }));
  const corpo = useAnimatedStyle(() => ({ opacity: anim.value }));

  return (
    <Card glass style={{ gap: open ? tokens.spacing.md : 0 }}>
      <Pressable onPress={toggle} style={styles.header}>
        <Feather name={icon} size={18} color={palette.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color={palette.textMuted}>{subtitle}</Text>
          ) : null}
        </View>
        {right}
        <Animated.View style={seta}>
          <Feather name="chevron-down" size={18} color={palette.textMuted} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View layout={LAYOUT} style={[{ gap: tokens.spacing.md }, corpo]}>
          {children}
        </Animated.View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
