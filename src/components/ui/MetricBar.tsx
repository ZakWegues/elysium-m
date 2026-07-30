import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Text } from './Text';

export function MetricBar({
  icon,
  label,
  percent,
  detail,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  percent: number;
  detail?: string;
}) {
  const { palette, tokens } = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [clamped, width]);

  const barColor = clamped >= 90 ? palette.error : clamped >= 70 ? palette.accent : palette.primary;

  return (
    <View style={{ gap: tokens.spacing.xs }}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <Feather name={icon} size={16} color={palette.textMuted} />
          <Text variant="label">{label}</Text>
        </View>
        <Text variant="label" color={palette.textMuted}>
          {detail ?? `${Math.round(clamped)}%`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: palette.border, borderRadius: tokens.radii.full }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: barColor,
              borderRadius: tokens.radii.full,
              width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: { height: 8, overflow: 'hidden' },
  fill: { height: 8 },
});
