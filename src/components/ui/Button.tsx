import { ActivityIndicator, Pressable, PressableProps, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';

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

  const backgrounds: Record<Variant, string> = {
    primary: palette.primary,
    secondary: palette.primarySoft,
    destructive: palette.errorSoft,
    ghost: 'transparent',
  };
  const textColors: Record<Variant, string> = {
    primary: palette.onPrimary,
    secondary: palette.primary,
    destructive: palette.error,
    ghost: palette.primary,
  };

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: backgrounds[variant],
          borderRadius: tokens.radii.md,
          paddingVertical: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
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
