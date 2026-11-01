import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

/** Web (prévia) e sem o módulo: não há vidro nativo — a barra usa o desfoque de sempre. */
export const suporteDoVidro = (): string => 'sem módulo (web)';
export const VIDRO_NATIVO = false;

export type PropsVidroNativo = {
  alvo: RefObject<View | null> | null | undefined;
  /** Força da lente em dp (Glass 26, Dark 16). */
  lente: number;
  /** [centro x, meia largura, visível] em dp, dentro da pílula. Sem ele, não há gota. */
  seletor?: [number, number, number];
  /** Raio do canto em dp; sem ele, pílula (metade da altura). */
  raio?: number;
  /** Fio de luz e brilho do topo, de 0 a 1 (padrão 1; os botões usam pouco). */
  brilho?: number;
  /** [r, g, b, a] de 0 a 1. */
  tinta?: number[];
};

export function VidroNativo({ reserva }: PropsVidroNativo & { reserva?: ReactNode }) {
  return <>{reserva}</>;
}
