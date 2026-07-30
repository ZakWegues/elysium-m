import { StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Text } from './Text';

export function ScreenHeader({
  title,
  right,
  style,
  ...rest
}: ViewProps & { title: string; right?: React.ReactNode }) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ overflow: 'hidden' }}>
      <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.glassSurface }]} />
      <View
        style={[
          styles.row,
          {
            paddingTop: insets.top + tokens.spacing.sm,
            paddingHorizontal: tokens.spacing.lg,
            paddingBottom: tokens.spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.glassBorder,
          },
          style,
        ]}
        {...rest}
      >
        <Text variant="heading">{title}</Text>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
