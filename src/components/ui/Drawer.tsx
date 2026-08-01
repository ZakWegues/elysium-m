import { ReactNode, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Card } from './Card';
import { Text } from './Text';

// LayoutAnimation precisa deste opt-in explícito no Android da arquitetura antiga;
// é no-op quando já está habilitado ou na nova.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Seção recolhível. O conteúdo só é montado quando aberta — várias destas na mesma
 * tela consultariam o PC em paralelo se montassem todas de uma vez.
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

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

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
        <Feather
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={palette.textMuted}
        />
      </Pressable>

      {open && <View style={{ gap: tokens.spacing.md }}>{children}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
