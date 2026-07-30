import { ActivityIndicator, Pressable, PressableProps, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';
import { Text } from './Text';

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
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: backgrounds[variant],
          borderRadius: isGlass ? tokens.radii.full : tokens.radii.md,
          paddingVertical: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          overflow: 'hidden',
          borderWidth: isGlass ? StyleSheet.hairlineWidth : 0,
          borderColor: isGlass ? palette.glassBorder : 'transparent',
        },
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
      {isGlass && (
        <>
          <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.glassSurface }]} />
        </>
      )}
      {loading ? (
        <ActivityIndicator color={textColors[variant]} />
      ) : (
        <Text variant="label" color={textColors[variant]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
