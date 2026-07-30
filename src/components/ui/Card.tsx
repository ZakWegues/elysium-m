import { StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';

export function Card({ glass = false, style, children, ...rest }: ViewProps & { glass?: boolean }) {
  const { palette, tokens } = useTheme();

  return (
    <View
      style={[
        {
          borderRadius: tokens.radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: glass ? palette.glassBorder : palette.border,
          padding: tokens.spacing.lg,
          overflow: 'hidden',
        },
        !glass && { backgroundColor: palette.surface },
        style,
      ]}
      {...rest}
    >
      {glass && (
        <>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.glassSurface }]} />
        </>
      )}
      {children}
    </View>
  );
}
