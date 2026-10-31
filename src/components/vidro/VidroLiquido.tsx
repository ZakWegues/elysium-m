import type { SharedValue } from 'react-native-reanimated';

/** Web (prévia) e sem Skia: a barra fica só com o desfoque. No Android: `VidroLiquido.native.tsx`. */
export type PropsVidro = {
  larguraPilula: SharedValue<number>;
  larguraTab: SharedValue<number>;
  progresso: SharedValue<number>;
  rotulos: SharedValue<number>;
  visivel: SharedValue<number>;
  encolhida: number;
};

export function VidroLiquido(_: PropsVidro) {
  return null;
}
