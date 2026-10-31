import { useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { reduzirUI } from '../../lib/motion';
import { corParaUniform, escalaDoFundo, INICIO_DO_FUNDO, LENTE_SKSL } from '../../lib/fundoSkia';
import { useTheme } from '../../theme';
import type { PropsVidro } from './VidroLiquido';

const efeito = Skia.RuntimeEffect.Make(LENTE_SKSL);

/**
 * 31/10: o vidro líquido de verdade da barra de abas. A borda da pílula é uma lente: o fundo
 * (recalculado pela mesma função das manchas, no mesmo relógio) entra entortado para dentro, mais
 * opaco na aresta, com um fio de luz em cima; o miolo é transparente e deixa ver o desfoque das
 * telas que passam por baixo. O seletor é uma gota que amplia o fundo embaixo dele e escorre junto.
 *
 * Força: Glass inteira, Dark metade, Stark e fundo próprio (papel/imagem) sem lente — o shader
 * não sabe desenhar a grade nem a foto, e a borda mostraria outra coisa.
 */
export function VidroLiquido({ larguraPilula, larguraTab, progresso, rotulos, visivel, encolhida }: PropsVidro) {
  const { palette, familiaResolvida, fundo } = useTheme();
  const { width, height } = useWindowDimensions();
  const [topo, setTopo] = useState<number | null>(null);
  const caixa = useRef<View>(null);
  const relogio = useClock();
  const desde = useMemo(() => Date.now() - INICIO_DO_FUNDO, []);
  const cores = useMemo(() => palette.blobs.map(corParaUniform), [palette.blobs]);
  const bg = useMemo(() => corParaUniform(palette.background), [palette.background]);
  const vidro = familiaResolvida === 'glass';
  const lente = fundo.tipo !== 'animado' || familiaResolvida === 'stark' ? 0 : vidro ? 26 : 13;
  const forca = vidro ? 1.5 : 1;
  const k = escalaDoFundo(width);

  const uniforms = useDerivedValue(() => {
    const w = encolhida + (larguraPilula.value - encolhida) * rotulos.value;
    const L = larguraTab.value;
    // Aberta: centro da aba `progresso` (a linha tem 6 de folga). Encolhida: o meio da pílula.
    const cx = (6 + progresso.value * L + L / 2) * rotulos.value + (w / 2) * (1 - rotulos.value);
    const meia = ((L - 8) / 2) * rotulos.value + ((encolhida - 20) / 2) * (1 - rotulos.value);
    return {
      res: [width, height],
      t: reduzirUI.value ? 0 : (relogio.value + desde) / 1000,
      k, forca,
      c0: cores[0], c1: cores[1], c2: cores[2],
      bg,
      origem: [(width - w) / 2, topo ?? 0],
      tam: [Math.max(1, w), 64],
      lente,
      sel: [cx, Math.max(1, meia), visivel.value],
    };
  }, [width, height, k, forca, cores, bg, topo, lente, encolhida]);

  if (!efeito || !lente) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      // A pílula fica parada na vertical: a posição na tela é medida uma vez (e a cada mudança).
      ref={caixa}
      onLayout={() => caixa.current?.measureInWindow((_x, y) => setTopo(y))}
    >
      {topo !== null && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={efeito} uniforms={uniforms} />
          </Fill>
        </Canvas>
      )}
    </View>
  );
}
