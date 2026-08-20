import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { Text } from './Text';

export function ScreenHeader({
  title,
  left,
  center,
  right,
  style,
  ...rest
}: ViewProps & {
  title?: string;
  /** Ocupa o lugar do título — usado pelo switch IA ↔ PC no Chat. */
  center?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
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
        {left}
        {center ?? <Text variant="heading">{title}</Text>}
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
