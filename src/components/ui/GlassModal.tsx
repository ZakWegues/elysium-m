import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { Text } from './Text';
import { useAbaAtiva } from '../AbaViva';


/**
 * Quantas gavetas estão abertas agora. O `App` lê isto para esconder a TabBar: a gaveta
 * é uma camada absoluta DENTRO da tela que a abriu, então não tem como cobrir a barra —
 * que fica visível e clicável por baixo do véu. Sem a barra, a tela cresce até o rodapé e
 * o véu cobre tudo, que é o que uma gaveta modal promete.
 */
export const SobreposicaoContext = createContext<{ mais: () => void; menos: () => void } | null>(null);

/**
 * A gaveta — e por que ela deixou de ser um `Modal` do RN.
 *
 * 🔴 Dentro de um `Modal` o Android abre uma JANELA NATIVA SEPARADA, e nenhuma
 * `BlurView` lá dentro enxerga o app que ficou atrás (§14). A gaveta ficava com tinta
 * chapada e desfoque zero, o que é exatamente a queixa de "quase transparente demais":
 * sem desfoque, translúcido não lê como vidro, lê como janela. Agora ela é uma camada
 * absoluta dentro da árvore do app, e o `blurTarget` do fundo volta a funcionar.
 *
 * AQUI O ALFA SOBE E O RAIO SOBE JUNTO — ao contrário do resto do bloco. Card e popover
 * querem revelar o fundo; a gaveta quer esconder a tela de trás sem apagá-la. São pedidos
 * opostos, e por isso ela tem um token próprio (`glassSheet`).
 *
 * O botão físico de voltar era responsabilidade do `Modal` (`onRequestClose`). Sem ele,
 * o `BackHandler` assume — senão voltar com a gaveta aberta sairia do app.
 */

export function GlassModal({
  visible,
  onClose,
  title,
  children,
  altura = 'auto',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * 'auto' (padrão): cresce com o conteúdo até 85% da tela. 'cheia': ocupa a tela toda desde
   * o começo (editor de tarefa). Nas duas, arrastar a alça para cima expande para a tela cheia
   * e para baixo fecha (08/10 — antes a alça era só enfeite e a lista ficava cortada em 85%).
   */
  altura?: 'auto' | 'cheia';
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  // Fora da tela de verdade: com 700 fixo, num aparelho alto a gaveta "nascia" já visível.
  const { height: alturaJanela } = useWindowDimensions();
  const SHEET_OFFSCREEN_Y = alturaJanela + 40;
  const translateY = useRef(new Animated.Value(SHEET_OFFSCREEN_Y)).current;
  const [expandida, setExpandida] = useState(altura === 'cheia');
  useEffect(() => { if (visible) setExpandida(altura === 'cheia'); }, [visible, altura]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const arrasto = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
    onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 90 || g.vy > 1.2) { onCloseRef.current(); return; }
      if (g.dy < -40) setExpandida(true);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 220 }).start();
    },
  })).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  /** Continua montada durante a saída; sem isto a gaveta sumiria de um quadro pro outro. */
  const [montada, setMontada] = useState(visible);
  const sobreposicao = useContext(SobreposicaoContext);
  // Abas vivas (08/10): a aba que tem a gaveta aberta pode ser escondida por fora (o "Ely"
  // leva ao Chat, um widget abre outra aba). Gaveta aberta numa aba escondida deixava a barra
  // de abas sumida em todas — então ela fecha junto.
  const abaAtiva = useAbaAtiva();
  useEffect(() => { if (!abaAtiva && visible) onClose(); }, [abaAtiva]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !sobreposicao) return;
    sobreposicao.mais();
    return () => sobreposicao.menos();
  }, [visible, sobreposicao]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) {
      setMontada(true);
      translateY.setValue(SHEET_OFFSCREEN_Y);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          mass: 0.9,
          stiffness: 200,
        }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_OFFSCREEN_Y, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMontada(false);
      });
    }
  }, [visible, translateY, backdropOpacity]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!montada) return null;

  return (
    <View style={styles.camada}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.glassBackdrop }]} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          expandida && { top: insets.top + 8, maxHeight: undefined },
          {
            borderTopLeftRadius: tokens.radii['2xl'],
            borderTopRightRadius: tokens.radii['2xl'],
            borderTopWidth: 1,
            borderColor: palette.glassBorder,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Raio alto e tinta própria — ver `glassSheet` em palettes.ts. */}
        <GlassFill intensity={100} tintColor={palette.glassSheet} />
        {/* Brilho reflexivo na aresta de cima, como o topo curvo de uma placa de vidro */}
        <LinearGradient
          // Da paleta, não literal: 70% de branco é reflexo no vidro claro e mancha no escuro.
          colors={palette.glassSheen}
          locations={[0, 1]}
          pointerEvents="none"
          style={styles.topSheen}
        />

        {/* A alça agora arrasta: para cima expande, para baixo fecha. */}
        <View {...arrasto.panHandlers} style={styles.alcaArea} accessibilityRole="adjustable" accessibilityLabel="Arraste para expandir ou fechar">
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={expandida ? { flex: 1 } : undefined}
          contentContainerStyle={{
            paddingBottom: insets.bottom + tokens.spacing.lg,
            paddingHorizontal: tokens.spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {title && (
            <Text variant="heading" style={{ marginBottom: tokens.spacing.md }}>
              {title}
            </Text>
          )}
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cobre a tela inteira por cima de tudo, inclusive da barra de abas — o mesmo alcance
  // que a janela do Modal dava, agora dentro da árvore.
  camada: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  alcaArea: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(120,120,128,0.36)',
  },
});
