import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { reduzirUI } from '../../lib/motion';

/**
 * A abertura (26/10, pedido do dono): enquanto o app conecta ao PC, os pontos da esfera da Ely
 * vêm de longe e se juntam numa esfera que gira; quando a conexão sai (ou no teto de 2,5 s), ela
 * encolhe e some, e o app aparece por baixo sem corte. Cobre a carência inicial da conexão — a
 * pessoa vê a Ely se formando, não um "Procurando o PC…".
 *
 * Mesma geometria do `Esfera3D` (Fibonacci, projeção num worklet, um Path só). Com "reduzir
 * movimento", só um fade.
 */

const N = 160;
const AnimatedPath = Animated.createAnimatedComponent(Path);

function pontos(): { esfera: number[]; longe: number[] } {
  const esfera: number[] = [];
  const longe: number[] = [];
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    esfera.push(Math.cos(ouro * i) * r, y, Math.sin(ouro * i) * r);
    // De onde cada ponto vem: a mesma direção, bem mais longe, com um giro — parece poeira se
    // juntando, não pontos voando em linha reta.
    const giro = 1.2 + (i % 7) * 0.15;
    const dist = 2.4 + ((i * 37) % 11) / 6;
    longe.push(Math.cos(ouro * i + giro) * r * dist, y * dist, Math.sin(ouro * i + giro) * r * dist);
  }
  return { esfera, longe };
}

export function Abertura({ pronto, aoSumir }: { pronto: boolean; aoSumir: () => void }) {
  const { palette } = useTheme();
  const { width, height } = useWindowDimensions();
  const tamanho = Math.min(width, height) * 0.62;
  const meio = tamanho / 2;
  const { esfera, longe } = useMemo(pontos, []);
  const juntar = useSharedValue(0);
  const t = useSharedValue(0);
  const saida = useSharedValue(0);
  const [tetoPassou, setTetoPassou] = useState(false);
  const cor = palette.primary;

  useEffect(() => {
    juntar.value = withTiming(1, { duration: reduzirUI.value ? 0 : 1300, easing: Easing.out(Easing.cubic) });
    const teto = setTimeout(() => setTetoPassou(true), 2500);
    return () => clearTimeout(teto);
  }, [juntar]);

  // Sai quando a conexão está de pé (depois de a esfera se formar) ou no teto.
  useEffect(() => {
    if (!pronto && !tetoPassou) return;
    const espera = setTimeout(() => {
      saida.value = withTiming(1, { duration: reduzirUI.value ? 160 : 520, easing: Easing.inOut(Easing.cubic) }, (fim) => {
        if (fim) runOnJS(aoSumir)();
      });
    }, pronto ? 350 : 0);
    return () => clearTimeout(espera);
  }, [pronto, tetoPassou, saida, aoSumir]);

  useFrameCallback((f) => {
    t.value += Math.min(0.05, (f.timeSincePreviousFrame ?? 16) / 1000);
  });

  const r1 = (v: number) => { 'worklet'; return Math.round(v * 10) / 10; };
  const caminho = useDerivedValue(() => {
    const k = juntar.value;
    const R = tamanho * 0.3;
    const rot = t.value * 0.5;
    const sy = Math.sin(rot), cy = Math.cos(rot);
    const sx = Math.sin(0.42), cx = Math.cos(0.42);
    let d = '';
    for (let i = 0; i < N; i++) {
      const x0 = longe[i * 3] + (esfera[i * 3] - longe[i * 3]) * k;
      const y0 = longe[i * 3 + 1] + (esfera[i * 3 + 1] - longe[i * 3 + 1]) * k;
      const z0 = longe[i * 3 + 2] + (esfera[i * 3 + 2] - longe[i * 3 + 2]) * k;
      const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cx - z1 * sx, z2 = y0 * sx + z1 * cx;
      const f = 2.8 / (2.8 - Math.max(-2.2, Math.min(2.2, z2)));
      const X = meio + x1 * R * f, Y = meio + y2 * R * f;
      const rr = r1(Math.max(0.4, (0.8 + (z2 + 1) * 0.7) * f));
      d += `M${r1(X - rr)} ${r1(Y)}a${rr} ${rr} 0 1 0 ${r1(2 * rr)} 0a${rr} ${rr} 0 1 0 ${r1(-2 * rr)} 0`;
    }
    return d;
  });
  const props = useAnimatedProps(() => ({ d: caminho.value, opacity: 0.35 + juntar.value * 0.6 }));
  const camada = useAnimatedStyle(() => ({ opacity: 1 - saida.value }));
  const esferaEstilo = useAnimatedStyle(() => ({ transform: [{ scale: 1 - saida.value * 0.35 }] }));
  const nome = useAnimatedStyle(() => ({ opacity: juntar.value * (1 - saida.value), transform: [{ translateY: (1 - juntar.value) * 8 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.caixa, { backgroundColor: palette.background }, camada]} pointerEvents="none">
      <Animated.View style={[{ width: tamanho, height: tamanho }, esferaEstilo]}>
        <Svg width={tamanho} height={tamanho}>
          <AnimatedPath animatedProps={props} fill={cor} />
        </Svg>
      </Animated.View>
      <Animated.View style={nome}>
        <Text variant="label" color={palette.textMuted} style={styles.nome}>ELYSIUM</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caixa: { alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 8 },
  nome: { letterSpacing: 6, fontSize: 13 },
});
