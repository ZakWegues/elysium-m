import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { GlassFill } from './GlassSurface';
import { MOLA, MOV, anima, movimentoReduzido } from '../../lib/motion';

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
 * É o único lugar do app que usa mola. O resto segue a escala do `motion.ts`; mola em tudo
 * seria o "bounce em todo hover" que denuncia interface gerada.
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
  const escala = useRef(new Animated.Value(0.9)).current;
  const opacidade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      opacidade.setValue(0);
      escala.setValue(movimentoReduzido() ? 1 : 0.9);
      Animated.parallel([
        Animated.spring(escala, { toValue: 1, ...MOLA }),
        anima(opacidade, 1, MOV.micro),
      ]).start();
    } else {
      // Saída mais rápida que a entrada, como manda a escala.
      anima(opacidade, 0, MOV.saida).start();
    }
  }, [visible]);

  if (!anchor) return null;

  // Ancorado pela direita do botão e logo abaixo dele, preso dentro da tela. Sem o
  // `Math.max`, um botão perto da borda esquerda empurraria o popover para fora.
  const direita = Math.max(8, telaW - (anchor.x + anchor.width));
  const topo = Math.min(anchor.y + anchor.height + 10, telaH - 120);
  const caretaDireita = Math.max(10, Math.min(anchor.width / 2 - 6, width - 22));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* O toque no fundo fecha; o toque dentro da caixa não sobe até aqui. */}
      <Pressable style={styles.fundo} onPress={onClose}>
        <Animated.View
          style={[
            styles.caixa,
            {
              width,
              top: topo,
              right: direita,
              opacity: opacidade,
              transform: [{ scale: escala }],
              borderRadius: tokens.radii.lg,
              borderColor: palette.glassBorder,
              backgroundColor: palette.surfaceRaised,
            },
          ]}
        >
          {/* A careta: um quadrado girado com a mesma cor e borda da caixa. A metade de
              baixo fica escondida atrás dela, e o que sobra é o bico. */}
          <View
            style={[
              styles.careta,
              { right: caretaDireita, backgroundColor: palette.surfaceRaised, borderColor: palette.glassBorder },
            ]}
          />
          <GlassFill intensity={70} strong edge={false} />
          <LinearGradient
            colors={palette.glassSheen}
            pointerEvents="none"
            style={[styles.brilho, { borderTopLeftRadius: tokens.radii.lg, borderTopRightRadius: tokens.radii.lg }]}
          />
          <Pressable onPress={() => {}} style={{ padding: tokens.spacing.md }}>
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)' },
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
