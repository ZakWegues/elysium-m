import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

type Variant = 'display' | 'heading' | 'subheading' | 'body' | 'caption' | 'label';

export function Text({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  const { palette, tokens } = useTheme();

  const variantStyle = {
    display: { fontSize: tokens.fontSize.display, fontWeight: tokens.fontWeight.bold as '700' },
    heading: { fontSize: tokens.fontSize.xl, fontWeight: tokens.fontWeight.bold as '700' },
    subheading: { fontSize: tokens.fontSize.lg, fontWeight: tokens.fontWeight.semibold as '600' },
    body: { fontSize: tokens.fontSize.base, fontWeight: tokens.fontWeight.regular as '400' },
    caption: { fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.regular as '400' },
    label: { fontSize: tokens.fontSize.sm, fontWeight: tokens.fontWeight.semibold as '600' },
  }[variant];

  const defaultColor = variant === 'caption' ? palette.textMuted : palette.text;

  return (
    <RNText
      style={[styles.base, variantStyle, { color: color ?? defaultColor }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {},
});
