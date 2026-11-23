import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JellyTabBarHeadless, pathIcon, type TabsItem } from 'react-native-jelly-tabs';
import { haptica } from '../lib/haptica';
import { mostrarRotulos, rotulos } from '../lib/barraRolagem';
import { useTheme } from '../theme';
import { GlassFill, useBlurDaBarra } from './ui';

/** Altura da barra aberta (pílula de 62 + 6 de folga em cima + 10 embaixo), sem a área segura. */
export const FOLGA_DA_BARRA = 78;

/** Ajustes não está aqui: virou gaveta, e gaveta não é destino de navegação. */
export type Screen = 'home' | 'chat' | 'hoje' | 'control' | 'conversations';

// Os desenhos (cheio na aba ativa, contorno nas outras) são do Material Design Icons (Apache 2.0);
// só estes, porque o pacote inteiro pesa 2,5 MB.
const INICIO = pathIcon('M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z', {
  inactivePath: 'M12 5.69L17 10.19V18H15V12H9V18H7V10.19L12 5.69M12 3L2 12H5V20H11V14H13V20H19V12H22',
});
const CHAT = pathIcon('M12,3C17.5,3 22,6.58 22,11C22,15.42 17.5,19 12,19C10.76,19 9.57,18.82 8.47,18.5C5.55,21 2,21 2,21C4.33,18.67 4.7,17.1 4.75,16.5C3.05,15.07 2,13.13 2,11C2,6.58 6.5,3 12,3Z', {
  inactivePath: 'M12,3C6.5,3 2,6.58 2,11C2.05,13.15 3.06,15.17 4.75,16.5C4.75,17.1 4.33,18.67 2,21C4.37,20.89 6.64,20 8.47,18.5C9.61,18.83 10.81,19 12,19C17.5,19 22,15.42 22,11C22,6.58 17.5,3 12,3M12,17C7.58,17 4,14.31 4,11C4,7.69 7.58,5 12,5C16.42,5 20,7.69 20,11C20,14.31 16.42,17 12,17Z',
});
const PC = pathIcon('M21,2H3C1.89,2 1,2.89 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16V4C23,2.89 22.1,2 21,2Z', {
  inactivePath: 'M21,16H3V4H21M21,2H3C1.89,2 1,2.89 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16V4C23,2.89 22.1,2 21,2Z',
});
const HOJE = pathIcon('M3.55 19.09L4.96 20.5L6.76 18.71L5.34 17.29M12 6C8.69 6 6 8.69 6 12S8.69 18 12 18 18 15.31 18 12C18 8.68 15.31 6 12 6M20 13H23V11H20M17.24 18.71L19.04 20.5L20.45 19.09L18.66 17.29M20.45 5L19.04 3.6L17.24 5.39L18.66 6.81M13 1H11V4H13M6.76 5.39L4.96 3.6L3.55 5L5.34 6.81L6.76 5.39M1 13H4V11H1M13 20H11V23H13', {
  inactivePath: 'M3.55 19.09L4.96 20.5L6.76 18.71L5.34 17.29M12 6C8.69 6 6 8.69 6 12S8.69 18 12 18 18 15.31 18 12C18 8.68 15.31 6 12 6M12 8A4 4 0 1 1 12 16A4 4 0 1 1 12 8M20 13H23V11H20M17.24 18.71L19.04 20.5L20.45 19.09L18.66 17.29M20.45 5L19.04 3.6L17.24 5.39L18.66 6.81M13 1H11V4H13M6.76 5.39L4.96 3.6L3.55 5L5.34 6.81L6.76 5.39M1 13H4V11H1M13 20H11V23H13',
});

/** Só destinos de verdade. Quatro, como o dono pediu: Início, Chat, PC e Hoje. */
const TABS: { screen: Screen; label: string; icone: ReturnType<typeof pathIcon> }[] = [
  { screen: 'home', label: 'Início', icone: INICIO },
  { screen: 'chat', label: 'Chat', icone: CHAT },
  { screen: 'control', label: 'PC', icone: PC },
  { screen: 'hoje', label: 'Hoje', icone: HOJE },
];

const CONFIG = { layout: { iconSize: 24, itemHeight: 52, trackHeight: 62 } };

/**
 * 23/11: a barra do ScrollYourBrain (react-native-jelly-tabs), com desfoque no lugar da cor cheia.
 * As molas, o toque e o desenho rodam em Kotlin, fora do JS e do Reanimated. A lente de antes
 * pesava e, com o seletor do JS e a gota do nativo andando separados, saía torta no aparelho.
 *
 * Rolando para baixo ela encolhe um pouco e desce; rolando para cima (ou trocando de aba) volta.
 */
export function TabBar({
  active,
  onNavigate,
  badges,
}: {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  badges?: Partial<Record<Screen, number>>;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const alvoDoDesfoque = useBlurDaBarra();
  // -1 quando a tela aberta não é aba nenhuma (Conversas): o seletor some.
  const indiceAtivo = TABS.findIndex((t) => t.screen === active);

  useEffect(() => { mostrarRotulos(); }, [indiceAtivo]);

  const fonte = palette.fontes?.texto;
  const itens = useMemo<TabsItem[]>(() => TABS.map((t) => {
    const n = badges?.[t.screen] ?? 0;
    return {
      key: t.screen,
      label: t.label,
      activeIcon: t.icone,
      inactiveIcon: t.icone,
      labelStyle: fonte ? { fontFamily: fonte[600], fontWeight: 'normal' } : undefined,
      accessibilityLabel: `${t.label}${n > 0 ? `, ${n} não lido${n === 1 ? '' : 's'}` : ''}`,
      ...(n > 0 ? { badge: n > 9 ? '9+' : n, badgeStyle: { backgroundColor: palette.error, color: '#fff' } } : {}),
    };
  }), [badges, fonte, palette.error]);

  const cores = useMemo(() => ({
    surface: '#16161a', selectedSurface: palette.primary, activeContent: palette.onPrimary, inactiveContent: palette.textMuted,
  }), [palette.primary, palette.onPrimary, palette.textMuted]);

  const aoTocar = useCallback(({ index }: { index: number }) => {
    const alvo = TABS[index];
    mostrarRotulos();
    if (alvo && alvo.screen !== active) { haptica.tique(); onNavigate(alvo.screen); }
  }, [active, onNavigate]);

  const estilo = useAnimatedStyle(() => ({
    opacity: 0.82 + 0.18 * rotulos.value,
    transform: [{ translateY: 10 * (1 - rotulos.value) }, { scale: 0.84 + 0.16 * rotulos.value }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.fora, { paddingBottom: insets.bottom + 10 }]}>
      <Animated.View pointerEvents="box-none" style={[styles.barra, estilo]}>
        <JellyTabBarHeadless
          items={itens}
          selectedIndex={indiceAtivo}
          onTabPress={aoTocar}
          maxWidth={400}
          colors={cores}
          opacity={{ surface: 0.6 }}
          backdrop={<GlassFill intensity={55} edge={false} tintColor="transparent" alvo={alvoDoDesfoque} />}
          touchFeedbackColor={palette.accent}
          config={CONFIG}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Por fora não há fundo: a barra flutua por cima das telas (App.tsx a põe numa camada
  // absoluta), e as telas ganham folga no fim (`FOLGA_DA_BARRA`).
  fora: { paddingTop: 6, paddingHorizontal: 24 },
  barra: { height: 62 },
});
