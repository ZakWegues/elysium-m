import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { useTheme, palettes, ThemeName } from '../theme';
import { Button, Card, ScreenHeader, Text } from '../components/ui';

export default function SettingsScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { name, palette, tokens, setTheme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Ajustes" />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.lg }}>
        <Card style={{ gap: tokens.spacing.md }}>
          <Text variant="subheading">Pareado com</Text>
          <Text variant="body" color={palette.textMuted}>
            {pairing.ip}:{pairing.port}
          </Text>
        </Card>

        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="subheading">Tema</Text>
          <View style={styles.swatchRow}>
            {(Object.keys(palettes) as ThemeName[]).map((key) => {
              const p = palettes[key];
              const selected = key === name;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTheme(key)}
                  style={[
                    styles.swatch,
                    {
                      borderRadius: tokens.radii.lg,
                      borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      borderColor: selected ? p.primary : palette.border,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <View style={styles.swatchDots}>
                    <View style={[styles.dot, { backgroundColor: p.primary }]} />
                    <View style={[styles.dot, { backgroundColor: p.accent }]} />
                  </View>
                  <Text variant="label">{p.label}</Text>
                  {selected && <Feather name="check" size={16} color={p.primary} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button title="Desparear" variant="destructive" onPress={onUnpair} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: '47%',
    padding: 14,
    gap: 8,
    alignItems: 'flex-start',
  },
  swatchDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
