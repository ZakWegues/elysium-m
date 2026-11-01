import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Web (prévia) e sem o módulo: não há vidro nativo — a barra usa o desfoque de sempre. */
export const suporteDoVidro = (): string => 'sem módulo (web)';
export const VIDRO_NATIVO = false;

export type PropsVidroNativo = {
  alvo: RefObject<View | null> | null | undefined;
  /** Força da lente em dp (Glass 26, Dark 16). */
  lente: number;
  /** [centro x, meia largura, visível] em dp, dentro da pílula. */
  seletor: [number, number, number];
};

export function VidroNativo(_: PropsVidroNativo) {
  return null;
}
