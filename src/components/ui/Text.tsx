import { Platform, Text as RNText, TextProps, TextStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

type Variant = 'display' | 'heading' | 'subheading' | 'body' | 'caption' | 'label';

type Peso = 400 | 500 | 600 | 700 | 800;

function pesoDe(w: TextStyle['fontWeight'], padrao: Peso): Peso {
  const n = typeof w === 'number' ? w : w === 'bold' ? 700 : w === 'normal' || w == null ? padrao : Number(w);
  if (!Number.isFinite(n)) return padrao;
  if (n >= 800) return 800;
  if (n >= 700) return 700;
  if (n >= 600) return 600;
  if (n >= 500) return 500;
  return 400;
}

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
  // Rótulo de seção: o `.dk-label` do design (versalete pequeno, espaçado, cor apagada).
  const rotuloDeSecao = variant === 'label' && color === palette.textMuted;

  let familia: TextStyle | null = null;
  const f = palette.fontes;
  if (f) {
    // 29/10: no Android o peso não escolhe arquivo dentro de uma fonte carregada; cada peso
    // é um nome próprio. O peso pedido (da variante ou do `style` de quem chama) vira o nome.
    const plano = StyleSheet.flatten(style) ?? {};
    if (!plano.fontFamily) {
      const titulo = variant === 'display' || variant === 'heading';
      const peso = pesoDe(plano.fontWeight ?? variantStyle.fontWeight, titulo ? 700 : 500);
      const nome = rotuloDeSecao && palette.familia === 'dark'
        ? f.mono[600]
        : titulo ? f.titulo[peso >= 800 ? 800 : peso >= 700 ? 700 : 600] : f.texto[peso];
      familia = {
        fontFamily: nome,
        // O peso já está no arquivo; manter `fontWeight` faria o Android engrossar de novo.
        fontWeight: 'normal',
        ...(titulo && plano.letterSpacing == null ? { letterSpacing: -0.4 } : {}),
        ...(rotuloDeSecao ? { textTransform: 'uppercase', letterSpacing: 0.9, ...(plano.fontSize ? {} : { fontSize: 11.5 }) } : {}),
      };
    }
  }
  // Fase 23.1: o Stark do PC escreve títulos e rótulos em Bahnschrift, rótulos em maiúsculas
  // espaçadas. No Android, a condensada do sistema faz o mesmo papel.
  const stark = palette.familia === 'stark';
  const tecnica = stark && (variant === 'display' || variant === 'heading' || variant === 'label')
    ? {
        fontFamily: Platform.OS === 'web' ? 'Bahnschrift, "Arial Narrow", sans-serif' : 'sans-serif-condensed',
        // Maiúsculas só no rótulo de seção (cor apagada), como no PC — botão continua normal.
        ...(variant === 'label' ? (rotuloDeSecao ? { textTransform: 'uppercase' as const, letterSpacing: 1.4 } : {}) : { fontWeight: '600' as const }),
      }
    : null;

  return (
    <RNText
      style={[styles.base, variantStyle, tecnica, { color: color ?? (rotuloDeSecao && f ? palette.textFaint : defaultColor) }, style, familia]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {},
});
