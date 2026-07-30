import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';

export function Card({ glass = false, style, children, ...rest }: ViewProps & { glass?: boolean }) {
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
      {glass && <GlassFill intensity={45} />}
      {children}
    </View>
  );
}
