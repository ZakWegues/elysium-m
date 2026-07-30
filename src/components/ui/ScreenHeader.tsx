import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
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
      <GlassFill intensity={60} strong edge={false} />
      <View
        style={[
          styles.row,
          {
            paddingTop: insets.top + tokens.spacing.sm,
            paddingHorizontal: tokens.spacing.lg,
            paddingBottom: tokens.spacing.md,
            borderBottomWidth: 1,
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
