import { useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import { haptica } from '../lib/haptica';
import { MOV } from '../lib/motion';
import { useTheme } from '../theme';
import { Button, GlassFill, Text } from '../components/ui';

/**
 * Três telas depois do primeiro pareamento, uma vez só.
 *
 * O app caía direto na Início com cards ainda vazios — a primeira impressão era "e
 * agora?". Cada tela é UMA ideia: falar, controlar, fora de casa. Pular está sempre à
 * vista, e a marca fica gravada ao terminar OU ao pular: quem pulou não quer ver de novo.
 *
 * Chave nova (`elysium_onboarding_v1`) — criar chave é seguro por OTA, renomear não (§18).
 */
export const CHAVE_ONBOARDING = 'elysium_onboarding_v1';

const PAGINAS: { icone: keyof typeof Feather.glyphMap; titulo: string; texto: string }[] = [
  {
    icone: 'mic',
    titulo: 'Fale com o PC',
    texto: 'No Chat, segure o microfone e fale — ou escreva. O ELYSIUM entende, faz e responde. “Abre o Chrome”, “quanto de RAM?”, “me lembra às 14h”.',
  },
  {
    icone: 'monitor',
    titulo: 'Controle de longe',
    texto: 'Na aba PC: espelho da tela ao vivo, trackpad e teclado, programas abertos, energia e área de transferência. Tudo sem passar pela IA.',
  },
  {
    icone: 'wifi',
    titulo: 'Fora de casa também',
    texto: 'Com o Tailscale ligado nos dois, o app acha o PC em qualquer rede. Ative as notificações nos Ajustes para receber os lembretes onde estiver.',
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const largura = Dimensions.get('window').width;
  const [pagina, setPagina] = useState(0);
  const rolagem = useRef<ScrollView>(null);
  const ultima = pagina === PAGINAS.length - 1;

  async function terminar() {
    haptica.sucesso();
    try { await AsyncStorage.setItem(CHAVE_ONBOARDING, '1'); } catch { /* best-effort */ }
    onDone();
  }

  function avancar() {
    if (ultima) { terminar(); return; }
    haptica.tique();
    rolagem.current?.scrollTo({ x: largura * (pagina + 1), animated: true });
  }

  function aoRolar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const p = Math.round(e.nativeEvent.contentOffset.x / largura);
    if (p !== pagina) { setPagina(p); haptica.tique(); }
  }

  return (
    <Animated.View
      entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)}
      style={[StyleSheet.absoluteFill, { zIndex: 40, paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <GlassFill intensity={100} tintColor={palette.glassSheet} edge={false} />

      <View style={[styles.topo, { paddingHorizontal: tokens.spacing.lg }]}>
        <Text variant="label" color={palette.textMuted}>ELYSIUM-M</Text>
        <Pressable onPress={terminar} hitSlop={10}>
          <Text variant="label" color={palette.primary}>Pular</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={rolagem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={aoRolar}
        style={{ flex: 1 }}
      >
        {PAGINAS.map((p, i) => (
          <View key={i} style={[styles.pagina, { width: largura, paddingHorizontal: tokens.spacing['2xl'] }]}>
            <View style={[styles.icone, { backgroundColor: palette.primarySoft, borderColor: palette.glassBorder }]}>
              <Feather name={p.icone} size={40} color={palette.primary} />
            </View>
            <Text variant="display" style={{ textAlign: 'center' }}>{p.titulo}</Text>
            <Text variant="body" color={palette.textMuted} style={{ textAlign: 'center', lineHeight: 24 }}>{p.texto}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.rodape, { paddingHorizontal: tokens.spacing.xl, gap: tokens.spacing.lg }]}>
        <View style={styles.pontos}>
          {PAGINAS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.ponto,
                { backgroundColor: i === pagina ? palette.primary : palette.border, width: i === pagina ? 22 : 8 },
              ]}
            />
          ))}
        </View>
        <Button title={ultima ? 'Começar' : 'Próximo'} onPress={avancar} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  pagina: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  icone: { width: 96, height: 96, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  rodape: { paddingBottom: 24 },
  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ponto: { height: 8, borderRadius: 4 },
});
