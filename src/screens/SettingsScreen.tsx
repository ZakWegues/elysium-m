import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, PushCategory, PushPrefs } from '../lib/rpc';
import { pushAvailability, registerForPush } from '../lib/pushNotifications';
import { errMessage } from '../lib/errors';
import { useTheme, palettes, getPalette, ROTULO_FAMILIA, FamiliaEscolha, ThemeName } from '../theme';
import { Button, Card, Text } from '../components/ui';

/**
 * As duas famílias, mais "seguir o aparelho".
 *
 * Eram "Claro / Escuro / Sistema", o que descrevia o brilho e escondia a escolha real:
 * as duas famílias são desenhos diferentes, não o mesmo desenho com o brilho trocado.
 * Agora a pergunta é a mesma que o desktop faz, com o mesmo vocabulário.
 */
const FAMILIA_OPTIONS: { value: FamiliaEscolha; label: string; icon: keyof typeof Feather.glyphMap; nota: string }[] = [
  { value: 'lg', label: ROTULO_FAMILIA.lg, icon: 'droplet', nota: 'Vidro translúcido, fundo claro' },
  { value: 'ely', label: ROTULO_FAMILIA.ely, icon: 'moon', nota: 'Noite azul com luz dourada e feixes de luz' },
  { value: 'auto', label: 'Seguir o aparelho', icon: 'smartphone', nota: 'Vidro no modo claro, ELYSIUM no escuro' },
];

export default function SettingsScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { name, palette, tokens, familia, familiaResolvida, setTheme, setFamilia } = useTheme();

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
        <Text variant="subheading">Estilo</Text>
        <Text variant="caption" color={palette.textMuted}>
          As duas famílias visuais do ELYSIUM desktop.
        </Text>
        {FAMILIA_OPTIONS.map((opt) => {
          const selected = opt.value === familia;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setFamilia(opt.value)}
              style={[
                styles.familiaBtn,
                {
                  borderRadius: tokens.radii.md,
                  backgroundColor: selected ? palette.primarySoft : 'transparent',
                  borderColor: selected ? palette.primary : palette.border,
                },
              ]}
            >
              <Feather
                name={opt.icon}
                size={17}
                color={selected ? palette.primary : palette.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text variant="body" color={selected ? palette.primary : palette.text}>
                  {opt.label}
                </Text>
                <Text variant="caption" color={palette.textMuted}>{opt.nota}</Text>
              </View>
              {selected && <Feather name="check" size={16} color={palette.primary} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="subheading">Cor</Text>
        <Text variant="caption" color={palette.textMuted}>
          Três variações dentro da família {ROTULO_FAMILIA[familiaResolvida]}. São
          exatamente as seis do desktop: cada cor tem um nome próprio em cada família.
        </Text>
        <View style={styles.swatchRow}>
          {(Object.keys(palettes) as ThemeName[]).map((key) => {
            // Do modo ATUAL, não das paletas claras: as duas caras de um tema são bem
            // diferentes, e mostrar a clara no escuro faria a amostra mentir sobre o que
            // vai acontecer ao tocar nela.
            const p = getPalette(key, familiaResolvida);
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
                {/* O nome do desktop, não o interno: na família Vidro, "Elísio" chama-se
                    "Vidro — Âmbar", e mostrar o nome interno faria as duas telas do mesmo
                    ecossistema divergirem no vocabulário. */}
                <Text variant="label">{p.rotulo}</Text>
                {selected && <Feather name="check" size={16} color={p.primary} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <PushSection pairing={pairing} />

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="subheading">Sobre</Text>
        <Card style={{ gap: tokens.spacing.xs }}>
          <Text variant="body" color={palette.textMuted}>
            ELYSIUM-M é o companheiro mobile do assistente de voz ELYSIUM. Chat, voz,
            telemetria, presets e a caixa de recados falam com o servidor local do seu PC pela
            mesma rede Wi-Fi.
          </Text>
        </Card>
      </View>

      <Button title="Desparear" variant="destructive" onPress={onUnpair} />
    </View>
  );
}

const CATEGORY_LABEL: Record<PushCategory, string> = {
  reminder: 'Lembretes',
  anomaly: 'Alertas do PC',
  mailbox: 'Caixa de recados',
};

function PushSection({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const availability = pushAvailability();

  const load = useCallback(async () => {
    try {
      setPrefs(await callRpc(pairing, 'push.getPrefs'));
    } catch {
      // PC fora do ar não deve impedir o resto dos Ajustes de aparecer.
      setPrefs(null);
    }
  }, [pairing]);

  useEffect(() => { load(); }, [load]);

  async function enable() {
    setBusy(true);
    try {
      const result = await registerForPush(pairing);
      if (result.status === 'denied') {
        Alert.alert(
          'Permissão negada',
          'Libere as notificações do ELYSIUM-M nas configurações do Android para receber lembretes.'
        );
      } else if (result.status === 'unsupported') {
        Alert.alert('Não disponível', result.reason);
      } else {
        Alert.alert('Pronto', 'Este aparelho vai receber notificações do PC.');
        await load();
      }
    } catch (err) {
      Alert.alert('Falha ao registrar', errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(category: PushCategory) {
    if (!prefs) return;
    const muted = prefs.muted.includes(category)
      ? prefs.muted.filter(c => c !== category)
      : [...prefs.muted, category];
    try {
      setPrefs(await callRpc(pairing, 'push.setPrefs', { muted }));
    } catch (err) {
      Alert.alert('Falha ao salvar', errMessage(err));
    }
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="subheading">Notificações</Text>
      <Text variant="caption" color={palette.textMuted}>
        Chegam pela nuvem da Expo, então funcionam mesmo fora da sua rede.
      </Text>

      <Card glass style={{ gap: tokens.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <Feather name="bell" size={18} color={palette.primary} />
          <Text variant="body" style={{ flex: 1 }}>
            {prefs ? `${prefs.deviceCount} aparelho(s) registrado(s)` : 'PC indisponível'}
          </Text>
          {busy && <ActivityIndicator size="small" color={palette.primary} />}
        </View>

        {availability.available ? (
          <Button title="Registrar este aparelho" variant="secondary" onPress={enable} loading={busy} />
        ) : (
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'flex-start' }}>
            <Feather name="info" size={16} color={palette.textMuted} style={{ marginTop: 2 }} />
            <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>
              {availability.reason}
            </Text>
          </View>
        )}

        {prefs && (Object.keys(CATEGORY_LABEL) as PushCategory[]).map(category => {
          const on = !prefs.muted.includes(category);
          return (
            <Pressable
              key={category}
              onPress={() => toggleCategory(category)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}
            >
              <Feather
                name={on ? 'check-square' : 'square'}
                size={18}
                color={on ? palette.primary : palette.textMuted}
              />
              <Text variant="body" color={on ? palette.text : palette.textMuted}>
                {CATEGORY_LABEL[category]}
              </Text>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  familiaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 11, paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  schemeRow: { flexDirection: 'row', gap: 8 },
  schemeBtn: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
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
