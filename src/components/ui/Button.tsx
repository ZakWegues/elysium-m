import { useState } from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { FundoVidro } from './FundoVidro';
import { useAperto } from './aperto';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'glass';

export function Button({
  title,
  variant = 'primary',
  loading = false,
  style,
  disabled,
  ...rest
}: PressableProps & { title: string; variant?: Variant; loading?: boolean }) {
  const { palette, tokens } = useTheme();
  const isDisabled = disabled || loading;
  const isGlass = variant === 'glass';
  // 04/11: glass e secondary são pílulas de vidro líquido (a secondary com a tinta do tema).
  const deVidro = isGlass || variant === 'secondary';
  const [largura, setLargura] = useState(120);
  const aperto = useAperto(largura);
  const estiloAperto = useAnimatedStyle(() => ({ transform: [{ scale: 1 + aperto.cresce * aperto.p.value }] }));

  const backgrounds: Record<Variant, string> = {
    primary: palette.primary,
    secondary: palette.primarySoft,
    destructive: palette.errorSoft,
    ghost: 'transparent',
    glass: 'transparent',
  };
  const textColors: Record<Variant, string> = {
    primary: palette.onPrimary,
    secondary: palette.primary,
    destructive: palette.error,
    ghost: palette.primary,
    glass: palette.primary,
  };

  return (
    <AnimatedPressable
      disabled={isDisabled}
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      // Fase 18: o leitor de tela anuncia "botão" e "indisponível"; ocupado também conta.
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={title}
      style={[
        styles.base,
        {
          backgroundColor: backgrounds[variant],
          borderRadius: deVidro ? tokens.radii.full : tokens.radii.md,
          paddingVertical: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.lg,
          opacity: isDisabled ? 0.5 : 1,
          overflow: 'hidden',
          borderWidth: isGlass ? 1 : 0,
          borderColor: isGlass ? palette.glassBorder : 'transparent',
        },
        typeof style === 'function' ? undefined : style,
        estiloAperto,
      ]}
      {...rest}
      onPressIn={(e) => { aperto.apertar(); rest.onPressIn?.(e); }}
      onPressOut={(e) => { aperto.soltar(); rest.onPressOut?.(e); }}
    >
      {isGlass && <GlassFill intensity={55} />}
      {deVidro && <FundoVidro cor={variant === 'secondary' ? palette.primarySoft : undefined} />}
      {loading ? (
        <ActivityIndicator color={textColors[variant]} />
      ) : (
        <Text variant="label" color={textColors[variant]}>
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
});
