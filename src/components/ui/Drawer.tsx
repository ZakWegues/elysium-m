import { ReactNode, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Seção recolhível. O conteúdo só é montado quando aberta — várias destas na mesma
 * tela consultariam o PC em paralelo se montassem todas de uma vez.
 *
 * A transição usa `Animated` do core em vez de `LayoutAnimation`: na Nova Arquitetura
 * (padrão desde o SDK 54) o opt-in `setLayoutAnimationEnabledExperimental` virou no-op
 * e só rendia aviso no console. Opacidade e rotação rodam na thread nativa, então não
 * dependem do trabalho de layout.
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
  const anim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  function toggle() {
    if (open) {
      // Desmonta só no fim, senão o conteúdo some antes de terminar de desaparecer.
      Animated.timing(anim, { toValue: 0, duration: 120, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setOpen(false); });
    } else {
      setOpen(true);
      onOpen?.();
      Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    }
  }

  const chevronRotation = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

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
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Feather name="chevron-down" size={18} color={palette.textMuted} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View style={{ opacity: anim, gap: tokens.spacing.md }}>
          {children}
        </Animated.View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
