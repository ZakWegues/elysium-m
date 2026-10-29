import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { CantosHud } from './Ornamentos';

/**
 * `glass` dá a tinta e a borda de vidro; `blur` — desligado por padrão — é que liga o
 * desfoque real. Ver o comentário de `GlassFill`: seis cards de vidro na mesma tela eram
 * seis recapturas por quadro de rolagem, e é isso que fazia a Início engasgar.
 *
 * 30/10: na Glass todo card é vidro; cantos de 16 (o Zak não quer arredondamento demais).
 */
export function Card({ glass = false, blur = false, style, children, ...rest }: ViewProps & { glass?: boolean; blur?: boolean }) {
  const { palette, tokens } = useTheme();
  const vidro = glass || palette.familia === 'glass';
  const stark = palette.familia === 'stark';

  return (
    <View
      style={[
        {
          // Stark: canto mais reto, senão o arredondado engole as cantoneiras HUD.
          borderRadius: stark ? 14 : 16,
          borderWidth: stark ? StyleSheet.hairlineWidth : 1,
          borderColor: vidro ? palette.glassBorder : palette.border,
          padding: tokens.spacing.lg,
          overflow: 'hidden',
        },
        !vidro && { backgroundColor: palette.surface },
        style,
      ]}
      {...rest}
    >
      {vidro && <GlassFill intensity={45} blur={blur} />}
      {stark && <CantosHud cor={palette.primary} />}
      {children}
    </View>
  );
}
