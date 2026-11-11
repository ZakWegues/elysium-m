import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { pausaFundo, pausaToque, reduzirUI } from '../../lib/motion';
import { corParaUniform, escalaDoFundo, INICIO_DO_FUNDO, MANCHAS_SKSL } from '../../lib/fundoSkia';

/** Tem Skia aqui (APK 2.6.0+): o AppBackground troca as manchas de SVG por estas. */
export const TEM_SKIA = true;

const efeito = Skia.RuntimeEffect.Make(MANCHAS_SKSL);

/**
 * 31/10: as cinco manchas do fundo num shader só (lib/fundoSkia.ts) — uma camada, em vez de cinco
 * SVGs animados; e a MESMA função que a barra de abas usa para entortar o fundo na lente.
 */
export function ManchasSkia({ blobs, forca }: { blobs: readonly [string, string, string]; forca: number }) {
  const { width, height } = useWindowDimensions();
  // 31/10: relógio próprio, a 30 quadros por segundo (as manchas andam devagar; 60 só gastava) e
  // parado durante a troca de tela e com "reduzir movimento".
  const tempo = useSharedValue((Date.now() - INICIO_DO_FUNDO) / 1000);
  const acumulado = useSharedValue(0);
  useFrameCallback((f) => {
    if (pausaFundo.value || pausaToque.value || reduzirUI.value) return;
    acumulado.value += (f.timeSincePreviousFrame ?? 16) / 1000;
    if (acumulado.value < 1 / 30) return;
    tempo.value += acumulado.value;
    acumulado.value = 0;
  });
  const cores = useMemo(() => blobs.map(corParaUniform), [blobs]);
  const k = escalaDoFundo(width);
  const uniforms = useDerivedValue(() => ({
    res: [width, height],
    // "Reduzir movimento": as manchas param onde estão.
    t: tempo.value,
    k,
    forca,
    c0: cores[0], c1: cores[1], c2: cores[2],
  }), [width, height, k, forca, cores]);
  if (!efeito) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={efeito} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
