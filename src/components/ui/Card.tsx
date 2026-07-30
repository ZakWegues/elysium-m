import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme';

export function Card({ style, ...rest }: ViewProps) {
  const { palette, tokens } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: palette.surface,
          borderRadius: tokens.radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.border,
          padding: tokens.spacing.lg,
        },
        style,
      ]}
      {...rest}
    />
  );
}
