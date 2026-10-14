import { useCallback, useEffect, useMemo } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { CURVA_UI, MOV, tempo } from '../lib/motion';
import { haptica } from '../lib/haptica';
import { useTheme } from '../theme';
import { GlassFill, Text } from './ui';

/** Ajustes não está aqui: virou gaveta, e gaveta não é destino de navegação. */
export type Screen = 'home' | 'chat' | 'hoje' | 'control' | 'conversations';

/**
 * Só destinos de verdade.
 *
 * 🔴 AJUSTES SAIU DAQUI. Ele ocupava um dos quatro lugares sem ser uma página: abre uma
 * gaveta por cima da tela, e sair dela não é navegar para lugar nenhum. Com ele fora, some
 * junto toda a maquinaria de "aba que não é aba" — a régua do indicador volta a ser a
 * lista inteira, sem buraco. O acionador foi para o canto superior direito do
 * `ScreenHeader`, como o desktop resolveu no bloco 36.
 */
const TABS: { screen: Screen; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  // O app abria direto no chat, o que fazia sentido quando conversar era quase tudo
  // que ele fazia. Com controle remoto, lembretes e player, chat virou uma aba entre
  // outras — e nada mostrava de imediato se o PC estava de pé.
  { screen: 'home', label: 'Início', icon: 'home' },
  // A Caixa deixou de ser destino: virou o lado direito do switch dentro do Chat, que é
  // como o desktop sempre tratou os dois — um par de modos da mesma conversa, não duas
  // telas. E os Presets viraram um popover ancorado no botão do topo.
  { screen: 'chat', label: 'Chat', icon: 'message-circle' },
  // Guia única de controle do PC: espelho da tela aparente ao entrar, e todo o resto
  // (trackpad, monitor, processos, programas, energia, transferência, mídia) em
  // gavetas. Antes eram duas abas separadas, Sistema e Remoto.
  { screen: 'control', label: 'PC', icon: 'monitor' },
  // Fase 16: o briefing do dia, hábitos e metas — a mesma aba Hoje do desktop.
  { screen: 'hoje', label: 'Hoje', icon: 'sun' },
  // Fase 22: Rotinas saiu da barra — virou gaveta dentro do Hoje (e do card de atalhos).
  // Quatro destinos, como o Zak pediu: Início, Chat, PC e Hoje.
];

const MAX_INDICE = TABS.length - 1;

/**
 * Quanto do impulso do dedo conta na escolha do destino, em segundos de projeção. Com 0,12
 * um empurrão rápido passa para a aba seguinte mesmo soltando antes da metade do caminho —
 * que é o que a mão espera de um controle que responde ao arremesso, e não só à posição.
 */
const PROJECAO = 0.12;
// A amarra com o literal de dentro do worklet: mudar um sem o outro para de compilar.
const conferenciaDaProjecao: 0.12 = PROJECAO;
void conferenciaDaProjecao;

/**
 * Resistência elástica nas duas pontas: além da primeira e da última aba o indicador ainda
 * anda, mas só 35% do que o dedo andou. Travar seco lê como app quebrado; deixar solto lê
 * como se houvesse uma aba a mais escondida ali.
 */
const RESISTENCIA = 0.35;

function comElastico(v: number, maximo: number): number {
  'worklet';
  // O teto e a resistência ENTRAM COMO LITERAL/ARGUMENTO em vez de virem do módulo: worklet
  // não enxerga escopo de módulo, só o que o Babel captura do corpo. Ver o comentário do
  // `tempo()` em motion.ts — foi assim que o app morreu ao soltar o dedo aqui.
  const resistencia = 0.35;
  if (v < 0) return v * resistencia;
  if (v > maximo) return maximo + (v - maximo) * resistencia;
  return v;
}

/**
 * A barra inferior, com indicador contínuo e arrasto.
 *
 * ANTES: a aba ativa era só uma cor diferente, trocada de um quadro para o outro. Sem nada
 * ligando origem e destino, o olho não lê "mudou de lugar", lê "piscou" — e o app parecia
 * saltar de tela em vez de navegar.
 *
 * AGORA a posição da barra é um número contínuo (`progresso`), não um índice. Um toque
 * anima esse número até a aba tocada; um arrasto amarra o número ao dedo, quadro a quadro,
 * e o destino só é decidido ao soltar, pelo mais próximo com projeção de velocidade.
 *
 * 🔴 ISTO PRECISA RODAR NA THREAD DE UI, e é o motivo de as duas dependências nativas terem
 * entrado. Com `PanResponder` + `Animated`, cada movimento do dedo dava uma volta pela
 * thread de JS — a mesma que está ocupada com RPC, telemetria por WebSocket e o re-sorteio
 * das bolhas da Início. O indicador andava a solavancos exatamente quando o app está mais
 * ocupado, que é quando se troca de aba.
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
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();

  // -1 quando a tela aberta não é aba nenhuma (Conversas, por exemplo). Aí o indicador
  // some em vez de apontar para uma aba que não é a que está na frente.
  const indiceAtivo = TABS.findIndex((t) => t.screen === active);

  const progresso = useSharedValue(Math.max(0, indiceAtivo));
  const larguraTab = useSharedValue(0);
  const inicio = useSharedValue(0);
  const visivel = useSharedValue(indiceAtivo < 0 ? 0 : 1);
  /** A aba que está de fato na frente, legível de dentro do gesto. */
  const ativoVivo = useSharedValue(Math.max(0, indiceAtivo));
  /** O teto da régua, num valor compartilhado — worklet não lê constante de módulo. */
  const maximo = useSharedValue(MAX_INDICE);

  useEffect(() => {
    visivel.value = tempo(indiceAtivo < 0 ? 0 : 1, MOV.micro, CURVA_UI);
    if (indiceAtivo >= 0) {
      ativoVivo.value = indiceAtivo;
      progresso.value = tempo(indiceAtivo, MOV.base);
    }
  }, [indiceAtivo]);

  const navegar = useCallback((i: number) => {
    const alvo = TABS[i];
    if (alvo && alvo.screen !== active) { haptica.tique(); onNavigate(alvo.screen); }
  }, [active, onNavigate]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Só assume o dedo depois de 8 px na horizontal: abaixo disso é toque, e o toque
        // pertence ao `Pressable` de cada aba. E desiste em 24 px na vertical, senão um
        // gesto de subir a tela seria capturado pela barra.
        .activeOffsetX([-8, 8])
        .failOffsetY([-24, 24])
        .onBegin(() => {
          inicio.value = progresso.value;
        })
        .onUpdate((e) => {
          if (larguraTab.value <= 0) return;
          progresso.value = comElastico(inicio.value + e.translationX / larguraTab.value, maximo.value);
        })
        // O segundo argumento é falso quando o gesto foi CANCELADO — app indo para segundo
        // plano, outro handler tomando o dedo. Cancelamento não escolhe destino nenhum: o
        // indicador volta para a aba que está na frente, e nada navega.
        .onEnd((e, sucesso) => {
          if (larguraTab.value <= 0) return;
          if (!sucesso) {
            progresso.value = tempo(ativoVivo.value);
            return;
          }
          // 0,12 s de projeção, literal pelo mesmo motivo do resto: constante de módulo não
          // existe na thread de UI. O valor e o porquê estão em PROJECAO, logo acima.
          const projetado = progresso.value + (e.velocityX / larguraTab.value) * 0.12;
          const destino = Math.min(maximo.value, Math.max(0, Math.round(projetado)));
          progresso.value = tempo(destino);
          runOnJS(navegar)(destino);
        }),
    [navegar],
  );

  function medir(e: LayoutChangeEvent) {
    larguraTab.value = e.nativeEvent.layout.width / TABS.length;
  }

  const estiloIndicador = useAnimatedStyle(() => ({
    width: Math.max(0, larguraTab.value - 16),
    opacity: visivel.value,
    transform: [{ translateX: progresso.value * larguraTab.value + 8 }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={{ overflow: 'hidden' }}>
        {/* O outro desfoque REAL do app (o primeiro é o ScreenHeader). Mesma moderação:
            os rótulos das abas já liam bem antes. */}
        <GlassFill intensity={45} strong edge={false} />
        <View
          onLayout={medir}
          style={[
            styles.row,
            {
              paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
              borderTopColor: palette.glassBorder,
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicador,
              palette.familia === 'renascenca'
                ? { backgroundColor: 'transparent', borderBottomWidth: 1.5, borderBottomColor: palette.primary, borderRadius: 0 }
                : { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md },
              estiloIndicador,
            ]}
          >
            {/* Fase 22: o fleurão da aba ativa, como no PC. */}
            {palette.familia === 'renascenca' && (
              <Text variant="caption" color={palette.primary} style={styles.fleurao}>❦</Text>
            )}
          </Animated.View>
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
      </View>
    </GestureDetector>
  );
}

/**
 * Uma aba, em duas camadas sobrepostas: a apagada sempre visível por baixo, a acesa por
 * cima com a opacidade amarrada à distância até o indicador.
 *
 * POR QUE DUAS CAMADAS EM VEZ DE INTERPOLAR A COR. O `Feather` é um texto de fonte de
 * ícones, e a prop `color` dele não é animável pela thread de UI. Duas camadas trocando de
 * opacidade dão o mesmo resultado visual e rodam onde precisam rodar — que é o que faz a
 * aba acender aos poucos enquanto o dedo passa por cima dela, em vez de acender no fim.
 */
function Aba({
  tab, indice, progresso, badge,
  ativo, onPress,
}: {
  tab: (typeof TABS)[number];
  indice: number;
  progresso: SharedValue<number>;
  badge: number;
  /** Fase 18: para o leitor de tela anunciar "selecionada". */
  ativo?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  const aceso = useAnimatedStyle(() => {
    const perto = Math.max(0, 1 - Math.abs(progresso.value - indice));
    return { opacity: perto, transform: [{ scale: 0.96 + 0.04 * perto }] };
  });

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!ativo }}
      accessibilityLabel={`${tab.label}${badge > 0 ? `, ${badge} não lido${badge === 1 ? '' : 's'}` : ''}`}
    >
      <View style={styles.camadas}>
        <View style={styles.camada}>
          <Feather name={tab.icon} size={22} color={palette.textMuted} />
          <Text variant="caption" color={palette.textMuted} style={styles.label} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {tab.label}
          </Text>
        </View>
        <Animated.View style={[styles.camada, styles.camadaAcesa, aceso]}>
          <Feather name={tab.icon} size={22} color={palette.primary} />
          <Text variant="caption" color={palette.primary} style={styles.label} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {tab.label}
          </Text>
        </Animated.View>
      </View>
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
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  camadas: {
    alignItems: 'center',
  },
  camada: {
    alignItems: 'center',
    gap: 2,
  },
  // A camada acesa fica exatamente sobre a apagada: mesma métrica, sem reflow ao acender.
  camadaAcesa: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-start',
  },
  // O polegar que desliza. Absoluto dentro da linha, e por isso não empurra nada quando
  // anda — só `transform`, como manda a escala do bloco 24.
  // Altura fixa em vez de `bottom`: a linha cresce com o inset da barra de gestos do
  // Android, e um polegar preso ao rodapé escorregaria para dentro dessa faixa vazia.
  indicador: {
    position: 'absolute',
    left: 0,
    top: 4,
    height: 44,
  },
  label: {
    fontSize: 11,
  },
  fleurao: { position: 'absolute', bottom: -9, alignSelf: 'center', fontSize: 11, lineHeight: 12 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
});
