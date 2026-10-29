import { useCallback, useEffect, useMemo } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { reduzirUI } from '../lib/motion';
import { haptica } from '../lib/haptica';
import { mostrarRotulos, rotulos } from '../lib/barraRolagem';
import { comAlfa, useTheme } from '../theme';
import { GlassFill, Text, useBlurDaBarra } from './ui';

/** Altura da barra aberta (pílula de 64 + 6 de folga em cima + 8 embaixo), sem a área segura. */
export const FOLGA_DA_BARRA = 78;

/** Ajustes não está aqui: virou gaveta, e gaveta não é destino de navegação. */
export type Screen = 'home' | 'chat' | 'hoje' | 'control' | 'conversations';

/** Só destinos de verdade. Quatro, como o Zak pediu: Início, Chat, PC e Hoje. */
const TABS: { screen: Screen; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { screen: 'home', label: 'Início', icon: 'home' },
  { screen: 'chat', label: 'Chat', icon: 'message-circle' },
  { screen: 'control', label: 'PC', icon: 'monitor' },
  { screen: 'hoje', label: 'Hoje', icon: 'sun' },
];

/**
 * Resistência elástica nas duas pontas: além da primeira e da última aba o seletor ainda
 * anda, mas só 35% do que o dedo andou.
 */
function comElastico(v: number, maximo: number): number {
  'worklet';
  // Literal dentro do worklet: worklet não enxerga constante de módulo.
  const resistencia = 0.35;
  if (v < 0) return v * resistencia;
  if (v > maximo) return maximo + (v - maximo) * resistencia;
  return v;
}

/**
 * 30/10 — a barra do Nuvio (lida no código dele, `FloatingNavigationBar`, e refeita aqui):
 *
 * · pílula escura flutuante (#1C1C1E a 72% sobre desfoque), no máximo 400 de largura, com
 *   28 de folga dos lados; 64 de altura com os nomes, 48 só com ícones;
 * · o seletor é uma "gelatina": anda de mola até a aba, ESTICA na direção do movimento e
 *   volta tremendo um pouco; segurar faz ele (e a barra) crescer, e arrastar leva ele junto
 *   com o dedo — o destino é a aba mais perto ao soltar;
 * · os nomes somem ao rolar para baixo e voltam ao rolar para cima (`barraRolagem.ts`);
 * · a aba sob o dedo acende aos poucos (camada acesa por proximidade do seletor).
 *
 * Tudo na thread de UI (Reanimated + Gesture Handler).
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

  const progresso = useSharedValue(Math.max(0, indiceAtivo));
  const larguraTab = useSharedValue(0);
  const inicio = useSharedValue(0);
  const visivel = useSharedValue(indiceAtivo < 0 ? 0 : 1);
  const ativoVivo = useSharedValue(Math.max(0, indiceAtivo));
  const maximo = useSharedValue(TABS.length - 1);
  /** 0 solto, 1 segurando: a barra e o seletor crescem. */
  const aperto = useSharedValue(0);
  /** O esticão da gelatina: 1 parado, maior quando o seletor anda rápido. */
  const estica = useSharedValue(1);

  const MOLA = { damping: 15, stiffness: 190, mass: 0.9 } as const;

  useEffect(() => {
    visivel.value = withTiming(indiceAtivo < 0 ? 0 : 1, { duration: 160 });
    if (indiceAtivo >= 0) {
      ativoVivo.value = indiceAtivo;
      progresso.value = reduzirUI.value ? withTiming(indiceAtivo, { duration: 140 }) : withSpring(indiceAtivo, MOLA);
    }
    mostrarRotulos();
  }, [indiceAtivo]);

  // A gelatina: quanto mais o seletor andou neste quadro, mais ele estica; parado, volta
  // com uma mola frouxa (o tremidinho do Nuvio).
  useAnimatedReaction(
    () => progresso.value,
    (agora, antes) => {
      if (antes == null || reduzirUI.value) return;
      const alvo = 1 + Math.min(0.5, Math.abs(agora - antes) * 9);
      if (alvo > estica.value) {
        estica.value = withSequence(withTiming(alvo, { duration: 16 }), withSpring(1, { damping: 7, stiffness: 160, mass: 0.7 }));
      }
    },
  );

  const navegar = useCallback((i: number) => {
    const alvo = TABS[i];
    if (alvo && alvo.screen !== active) { haptica.tique(); onNavigate(alvo.screen); }
  }, [active, onNavigate]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Toque curto é da aba; acima de 8 px na horizontal é arrasto do seletor.
        .activeOffsetX([-8, 8])
        .failOffsetY([-24, 24])
        .onBegin(() => {
          inicio.value = progresso.value;
          aperto.value = withSpring(1, { damping: 11, stiffness: 190, mass: 0.9 });
        })
        .onUpdate((e) => {
          if (larguraTab.value <= 0) return;
          progresso.value = comElastico(inicio.value + e.translationX / larguraTab.value, maximo.value);
        })
        .onEnd((e, sucesso) => {
          if (larguraTab.value <= 0) return;
          if (!sucesso) {
            progresso.value = withSpring(ativoVivo.value, { damping: 15, stiffness: 190, mass: 0.9 });
            return;
          }
          // 0,12 s de projeção do impulso: um empurrão rápido passa para a aba seguinte.
          const projetado = progresso.value + (e.velocityX / larguraTab.value) * 0.12;
          const destino = Math.min(maximo.value, Math.max(0, Math.round(projetado)));
          progresso.value = withSpring(destino, { damping: 15, stiffness: 190, mass: 0.9 });
          runOnJS(navegar)(destino);
        })
        .onFinalize(() => {
          aperto.value = withSpring(0, { damping: 11, stiffness: 190, mass: 0.9 });
        }),
    [navegar],
  );

  function medir(e: LayoutChangeEvent) {
    larguraTab.value = e.nativeEvent.layout.width / TABS.length;
  }

  // A pílula encolhe dos lados e baixa a altura quando os nomes somem; segurar faz crescer.
  const estiloFolga = useAnimatedStyle(() => ({ paddingHorizontal: 28 + 30 * (1 - rotulos.value) }));
  const estiloPilula = useAnimatedStyle(() => ({
    height: 48 + 16 * rotulos.value,
    transform: [{ scale: 1 + 0.03 * aperto.value }],
  }));

  const estiloSeletor = useAnimatedStyle(() => ({
    width: Math.max(0, larguraTab.value - 8),
    opacity: visivel.value,
    transform: [
      { translateX: progresso.value * larguraTab.value + 4 },
      { scaleX: estica.value + 0.1 * aperto.value },
      { scaleY: (1 + 0.14 * aperto.value) / Math.sqrt(estica.value) },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fora, { paddingBottom: insets.bottom + 8 }, estiloFolga]}>
        <Animated.View style={[styles.pilula, estiloPilula]}>
          {/* Desfoca as telas que passam por baixo (alvo da barra), com tinta escura translúcida. */}
          <GlassFill intensity={55} edge={false} tintColor="rgba(22,22,26,0.5)" alvo={alvoDoDesfoque} />
          <View style={styles.linha} onLayout={medir}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.seletor,
                { backgroundColor: comAlfa(palette.primary, 0.18), borderColor: comAlfa(palette.primary, 0.32), shadowColor: palette.primary },
                estiloSeletor,
              ]}
            />
            {TABS.map((tab, i) => (
              <Aba
                key={tab.screen}
                tab={tab}
                indice={i}
                progresso={progresso}
                badge={badges?.[tab.screen] ?? 0}
                ativo={tab.screen === active}
                onPress={() => { if (tab.screen !== active) haptica.tique(); onNavigate(tab.screen); }}
              />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Uma aba, em duas camadas: a apagada por baixo e a acesa por cima, com a opacidade presa à
 * distância até o seletor — a aba acende enquanto o seletor passa por ela. Apertar (ou o
 * mouse por cima, na web) clareia o fundo dela de leve.
 */
function Aba({
  tab, indice, progresso, badge, ativo, onPress,
}: {
  tab: (typeof TABS)[number];
  indice: number;
  progresso: SharedValue<number>;
  badge: number;
  ativo?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  const aceso = useAnimatedStyle(() => {
    const perto = Math.max(0, 1 - Math.abs(progresso.value - indice));
    return { opacity: perto };
  });
  const nome = useAnimatedStyle(() => ({ opacity: rotulos.value, height: 16 * rotulos.value, marginTop: 3 * rotulos.value }));

  const conteudo = (cor: string, peso: '400' | '600') => (
    <>
      <Feather name={tab.icon} size={22} color={cor} />
      <Animated.View style={[styles.nomeCaixa, nome]}>
        <Text variant="caption" color={cor} style={[styles.label, { fontWeight: peso }]} maxFontSizeMultiplier={1.2} numberOfLines={1}>
          {tab.label}
        </Text>
      </Animated.View>
    </>
  );

  return (
    <Pressable
      style={(estado) => {
        const { pressed } = estado;
        const hovered = (estado as { hovered?: boolean }).hovered;
        return [styles.tab, !ativo && (pressed || hovered) && styles.tabRealce];
      }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!ativo }}
      accessibilityLabel={`${tab.label}${badge > 0 ? `, ${badge} não lido${badge === 1 ? '' : 's'}` : ''}`}
    >
      <View style={styles.camada}>{conteudo(palette.textMuted, '400')}</View>
      <Animated.View style={[styles.camada, styles.camadaAcesa, aceso]}>{conteudo(palette.primary, '600')}</Animated.View>
      {badge > 0 && (
        <View style={[styles.badge, { backgroundColor: palette.error }]}>
          <Text variant="caption" color="#fff" style={styles.badgeText}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Por fora não há fundo: só a folga do rodapé. A altura reservada é a da pílula aberta,
  // para o conteúdo não pular quando os nomes somem.
  // Por fora não há fundo nenhum: a barra flutua por cima das telas (App.tsx a põe numa
  // camada absoluta), e as telas ganham folga no fim (`FOLGA_DA_BARRA`).
  fora: { alignItems: 'center', justifyContent: 'flex-end', paddingTop: 6 },
  pilula: {
    maxWidth: 400, width: '100%', borderRadius: 999, overflow: 'hidden', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  linha: { flexDirection: 'row', alignItems: 'stretch', flex: 1, paddingHorizontal: 6, paddingVertical: 6 },
  seletor: {
    position: 'absolute', left: 0, top: 6, bottom: 6, borderRadius: 999, borderWidth: 1,
    shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  tabRealce: { backgroundColor: 'rgba(255,255,255,0.07)' },
  camada: { alignItems: 'center', justifyContent: 'center' },
  camadaAcesa: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  nomeCaixa: { overflow: 'hidden', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14 },
  badge: {
    position: 'absolute', top: 4, right: '22%', minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
});
