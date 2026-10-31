import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { reduzirUI } from '../../lib/motion';
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
  const relogio = useClock();
  const desde = useMemo(() => Date.now() - INICIO_DO_FUNDO, []);
  const cores = useMemo(() => blobs.map(corParaUniform), [blobs]);
  const k = escalaDoFundo(width);
  const uniforms = useDerivedValue(() => ({
    res: [width, height],
    // "Reduzir movimento": as manchas param onde estão.
    t: reduzirUI.value ? 0 : (relogio.value + desde) / 1000,
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
