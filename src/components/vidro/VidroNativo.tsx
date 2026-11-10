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
  /** Brilho do aro, de 0 a 1 (padrão 1; os botões usam pouco). */
  brilho?: number;
  /** 0 = painel (domo; barra, botões, chips), 1 = lente (squircle + Snell; polegar segurado). */
  perfil?: 0 | 1;
  /** [r, g, b, a] de 0 a 1. */
  tinta?: number[];
  /** 09/11 (APK 2.10.0): para que lado o brilho inclina, de −1 a 1 (o arrasto do seletor). */
  inclina?: number;
  /** O brilho acompanha a inclinação do aparelho (desligado com "reduzir movimento"). */
  segueAparelho?: boolean;
};

export function VidroNativo({ reserva }: PropsVidroNativo & { reserva?: ReactNode }) {
  return <>{reserva}</>;
}
