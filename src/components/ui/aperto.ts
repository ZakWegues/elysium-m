import { useSharedValue, withSpring } from 'react-native-reanimated';

/**
 * 04/11: o aperto dos botões de vidro, com as molas de toque da biblioteca Glisse
 * (github.com/0kzh/glisse, MIT): apertar é duro e rápido; soltar é mole e passa um pouco do
 * ponto antes de assentar. O botão CRESCE ao apertar (6 dp no lado maior), não encolhe.
 */
export const MOLA_APERTO = { stiffness: 515, damping: 27.3, mass: 1 };
export const MOLA_SOLTA = { stiffness: 250, damping: 11.8, mass: 1 };

/** `p` vai de 0 (solto) a 1 (apertado); a escala é `1 + cresce * p`. */
export function useAperto(ladoMaior: number) {
  const p = useSharedValue(0);
  return {
    p,
    cresce: 6 / Math.max(ladoMaior, 1),
    apertar: () => { p.value = withSpring(1, MOLA_APERTO); },
    soltar: () => { p.value = withSpring(0, MOLA_SOLTA); },
  };
}
