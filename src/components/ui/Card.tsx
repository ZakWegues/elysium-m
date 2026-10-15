import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { CantosHud, CantosOrnamentados } from './Ornamentos';

/**
 * `glass` dá a tinta e a borda de vidro; `blur` — desligado por padrão — é que liga o
 * desfoque real. Ver o comentário de `GlassFill`: seis cards de vidro na mesma tela eram
 * seis recapturas por quadro de rolagem, e é isso que fazia a Início engasgar.
 */
export function Card({ glass = false, blur = false, style, children, ...rest }: ViewProps & { glass?: boolean; blur?: boolean }) {
  const { palette, tokens } = useTheme();
  // 13/10: na Renascença o card vira moldura dourada, de canto quase reto e volutas.
  const renascenca = palette.familia === 'renascenca';

  return (
    <View
      style={[
        {
          // Stark: canto mais reto, senão o arredondado engole as cantoneiras HUD.
          borderRadius: renascenca ? 5 : palette.familia === 'stark' ? 8 : tokens.radii.lg,
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
      {glass && <GlassFill intensity={45} blur={blur} />}
      {renascenca && <CantosOrnamentados cor={palette.primary} />}
      {palette.familia === 'stark' && <CantosHud cor={palette.primary} />}
      {children}
    </View>
  );
}
