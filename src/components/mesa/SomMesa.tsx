import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import SliderVolume from '../SliderVolume';
import { haptica } from '../../lib/haptica';
import { callRpc } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { nomeCurto, type SomMesa as Som } from '../../lib/mesa';

type Saida = { id: string; nome: string; padrao: boolean };


/** Volume do PC, mudo e para onde o som vai (fone, caixa, TV). */
export function SomDaMesa({ pairing, som, aoErro }: { pairing: Pairing; som: Som | null; aoErro: (e: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const [saidas, setSaidas] = useState<Saida[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const padrao = saidas?.find((s) => s.padrao);

  async function abrirSaidas() {
    void haptica.leve();
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    try { setSaidas((await callRpc(pairing, 'saida.listar', {}, { timeoutMs: 10000 })).saidas); } catch (e) { setAberto(false); aoErro(e); }
  }
  async function usar(s: Saida) {
    if (s.padrao) { setAberto(false); return; }
    setTrocando(s.id);
    try {
      await callRpc(pairing, 'saida.usar', { id: s.id }, { timeoutMs: 10000 });
      void haptica.sucesso();
      setSaidas((l) => l?.map((x) => ({ ...x, padrao: x.id === s.id })) ?? null);
      setAberto(false);
    } catch (e) { aoErro(e); } finally { setTrocando(null); }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.linha}>
        <Pressable onPress={() => { void haptica.medio(); callRpc(pairing, 'volume.set', { level: som?.mudo ? 'unmute' : 'mute' }).catch(aoErro); }}
          accessibilityRole="button" accessibilityLabel={som?.mudo ? 'Tirar do mudo' : 'Mudo'} hitSlop={8}
          style={[styles.mudo, { backgroundColor: som?.mudo ? palette.errorSoft : 'rgba(255,255,255,0.06)' }]}>
          <Feather name={som?.mudo ? 'volume-x' : 'volume-2'} size={20} color={som?.mudo ? palette.error : palette.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <SliderVolume nivel={som?.volume ?? 0} mudo={som?.mudo ?? false}
            aoMudar={(v, final) => { callRpc(pairing, 'volume.set', { level: v }).catch((e) => { if (final) aoErro(e); }); }} />
        </View>
        <Pressable onPress={abrirSaidas} accessibilityRole="button" accessibilityLabel="Trocar a saída de som" hitSlop={8}
          style={[styles.saida, { backgroundColor: aberto ? palette.primarySoft : 'rgba(255,255,255,0.06)', borderRadius: tokens.radii.full }]}>
          <Feather name="speaker" size={16} color={aberto ? palette.primary : palette.text} />
          <Text variant="caption" numberOfLines={1} style={{ maxWidth: 90 }}>{padrao ? nomeCurto(padrao.nome) : 'Saída'}</Text>
        </Pressable>
      </View>
      {aberto && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ gap: 6 }}>
          {saidas === null ? <ActivityIndicator color={palette.primary} /> : saidas.map((s) => (
            <Pressable key={s.id} onPress={() => usar(s)} accessibilityRole="button" accessibilityState={{ selected: s.padrao }}
              style={[styles.opcao, { borderRadius: tokens.radii.md, backgroundColor: s.padrao ? palette.primarySoft : 'rgba(255,255,255,0.05)' }]}>
              <Feather name={/fone|head|airpod|buds/i.test(s.nome) ? 'headphones' : /tv|samsung|lg|hdmi/i.test(s.nome) ? 'tv' : 'speaker'} size={16} color={s.padrao ? palette.primary : palette.textMuted} />
              <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>{nomeCurto(s.nome)}</Text>
              {trocando === s.id ? <ActivityIndicator size="small" color={palette.primary} /> : s.padrao ? <Feather name="check" size={16} color={palette.primary} /> : null}
            </Pressable>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mudo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saida: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 46 },
});
