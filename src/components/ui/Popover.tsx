import { useEffect } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { CURVA_UI, MOV, mola, movimentoReduzido, tempo } from '../../lib/motion';

/**
 * Popover ancorado, estilo iOS.
 *
 * POR QUE NÃO O `GlassModal`
 *
 * O `GlassModal` é uma bottom sheet: sobe do rodapé e ocupa a largura toda. Serve para um
 * formulário, não para um menu que sai de um botão. Aqui a caixa **escala a partir do
 * canto onde o botão está**, com uma careta apontando para ele — é isso que faz o popover
 * parecer preso ao botão em vez de flutuar solto.
 *
 * 🔴 POR QUE ELE NÃO É MAIS UM `Modal` DO RN. Dentro de um `Modal` o Android abre uma
 * janela nativa separada, e nenhuma `BlurView` lá dentro consegue amostrar o app que
 * está atrás — o painel ficava com tinta chapada e nenhum desfoque, sem erro nenhum que
 * denunciasse. Agora ele é uma camada absoluta DENTRO da árvore da tela, que é a única
 * forma de o vidro funcionar no Android (§14).
 *
 * A âncora continua vindo de `measureInWindow`: a camada cobre a tela toda a partir da
 * raiz da tela do Chat, então coordenada de janela e coordenada daqui coincidem.
 *
 * É o único lugar do app que usa mola. O resto segue a escala do `motion.ts`; mola em tudo
 * seria o "bounce em todo hover" que denuncia interface gerada. A rigidez continua sendo
 * 380, o número do bloco 24 — o que mudou foi só de que lado da ponte ela é calculada.
 */
export default function Popover({
  visible,
  onClose,
  /** Onde o botão que abriu está, em coordenadas de tela. */
  anchor,
  children,
  width = 300,
}: {
  visible: boolean;
  onClose: () => void;
  anchor: { x: number; y: number; width: number; height: number } | null;
  children: React.ReactNode;
  width?: number;
}) {
  const { palette, tokens } = useTheme();
  const { width: telaW, height: telaH } = useWindowDimensions();
  const escala = useSharedValue(0.9);
  const opacidade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacidade.value = 0;
      escala.value = movimentoReduzido() ? 1 : 0.9;
      escala.value = mola(1);
      opacidade.value = tempo(1, MOV.micro, CURVA_UI);
    } else {
      // Saída mais rápida que a entrada, como manda a escala.
      opacidade.value = tempo(0, MOV.saida, CURVA_UI);
    }
  }, [visible]);

  const caixaAnimada = useAnimatedStyle(() => ({
    opacity: opacidade.value,
    transform: [{ scale: escala.value }],
  }));

  if (!anchor) return null;

  // Ancorado pela direita do botão e logo abaixo dele, preso dentro da tela. Sem o
  // `Math.max`, um botão perto da borda esquerda empurraria o popover para fora.
  const direita = Math.max(8, telaW - (anchor.x + anchor.width));
  const topo = Math.min(anchor.y + anchor.height + 10, telaH - 120);
  const caretaDireita = Math.max(10, Math.min(anchor.width / 2 - 6, width - 22));

  if (!visible) return null;

  return (
    // O toque no fundo fecha; o toque dentro da caixa não sobe até aqui.
    <Pressable style={styles.fundo} onPress={onClose}>
        <Animated.View
          style={[
            styles.caixa,
            {
              width,
              top: topo,
              right: direita,
              borderRadius: tokens.radii.lg,
              borderColor: palette.glassBorder,
            },
            caixaAnimada,
          ]}
        >
          {/* A careta: um quadrado girado com a mesma cor e borda da caixa. A metade de
              baixo fica escondida atrás dela, e o que sobra é o bico. */}
          <View
            style={[
              styles.careta,
              { right: caretaDireita, backgroundColor: palette.glassSurfaceStrong, borderColor: palette.glassBorder },
            ]}
          />
          {/* O vidro mora numa camada própria com `overflow: hidden`: a caixa precisa
              ficar visível para a careta escapar dela, e sem este recorte o desfoque
              vazaria pelos cantos quadrados. Raio baixo e tinta baixa — translúcido e
              LEVEMENTE borrado, não uma placa leitosa. */}
          <View style={[StyleSheet.absoluteFill, { borderRadius: tokens.radii.lg, overflow: 'hidden' }]}>
            <GlassFill intensity={20} edge={false} />
            <LinearGradient
              colors={palette.glassSheen}
              pointerEvents="none"
              style={styles.brilho}
            />
          </View>
          <Pressable onPress={() => {}} style={{ padding: tokens.spacing.md }}>
            {children}
          </Pressable>
        </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Absoluto, não `flex: 1`: agora ele é uma camada por cima da tela, não a raiz de uma
  // janela. Escurecimento mais fraco — com o painel translúcido, um véu forte por baixo
  // reapareceria dentro do próprio vidro.
  fundo: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)', zIndex: 20,
  },
  caixa: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
    // Sombra própria: o popover flutua sobre a tela inteira, e sem ela a borda de vidro
    // some contra um fundo claro.
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  careta: {
    position: 'absolute', top: -6, width: 12, height: 12,
    transform: [{ rotate: '45deg' }],
    borderLeftWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth,
  },
  brilho: { position: 'absolute', top: 0, left: 0, right: 0, height: 40 },
});
