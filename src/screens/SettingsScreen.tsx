import { Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { useTheme, palettes, ThemeName } from '../theme';
import { Button, Card, Text } from '../components/ui';

export default function SettingsScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { name, palette, tokens, setTheme } = useTheme();

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <Card glass style={{ gap: tokens.spacing.md, flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={[
            styles.pairedIcon,
            { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.full },
          ]}
        >
          <Feather name="wifi" size={18} color={palette.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Pareado</Text>
          <Text variant="body" color={palette.textMuted}>
            {pairing.activeIp}:{pairing.port}
          </Text>
          {pairing.endpoints.length > 1 && (
            <Text variant="caption" color={palette.textMuted}>
              {pairing.endpoints.length} endereços conhecidos
              {pairing.hostname ? ` · ${pairing.hostname}` : ''}
            </Text>
          )}
        </View>
      </Card>

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="subheading">Tema</Text>
        <Text variant="caption" color={palette.textMuted}>
          Espelha os temas do NeuroAxis desktop.
        </Text>
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

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="subheading">Sobre</Text>
        <Card style={{ gap: tokens.spacing.xs }}>
          <Text variant="body" color={palette.textMuted}>
            NeuroAxis Portal é o companheiro mobile do assistente de voz NeuroAxis. Chat, voz,
            telemetria, presets e a caixa de recados falam com o servidor local do seu PC pela
            mesma rede Wi-Fi.
          </Text>
        </Card>
      </View>

      <Button title="Desparear" variant="destructive" onPress={onUnpair} />
    </View>
  );
}

const styles = StyleSheet.create({
  pairedIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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
