import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';

/**
 * `glass` dá a tinta e a borda de vidro; `blur` — desligado por padrão — é que liga o
 * desfoque real. Ver o comentário de `GlassFill`: seis cards de vidro na mesma tela eram
 * seis recapturas por quadro de rolagem, e é isso que fazia a Início engasgar.
 */
export function Card({ glass = false, blur = false, style, children, ...rest }: ViewProps & { glass?: boolean; blur?: boolean }) {
  const { palette, tokens } = useTheme();

  return (
    <View
      style={[
        {
          borderRadius: tokens.radii.lg,
          borderWidth: glass ? 1 : StyleSheet.hairlineWidth,
          borderColor: glass ? palette.glassBorder : palette.border,
          padding: tokens.spacing.lg,
          overflow: 'hidden',
        },
        !glass && { backgroundColor: palette.surface },
        style,
      ]}
      {...rest}
    >
      {glass && <GlassFill intensity={22} blur={blur} />}
      {children}
    </View>
  );
}
