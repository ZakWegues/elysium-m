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
  // 13/10: a Renascença escreve em serifa (Noto Serif no Android), com títulos em itálico.
  const renascenca = palette.familia === 'renascenca';
  const serifa = renascenca ? { fontFamily: 'serif', ...(variant === 'display' || variant === 'heading' ? { fontStyle: 'italic' as const } : {}) } : null;

  return (
    <RNText
      style={[styles.base, variantStyle, serifa, { color: color ?? defaultColor }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {},
});
