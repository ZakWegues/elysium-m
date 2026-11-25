import type { RefObject } from 'react';
import type { View } from 'react-native';

export type AbaDaBarra = { rotulo: string; cheio: string; contorno: string; aviso?: string; acessivel: string };
export type PropsBarraVidro = {
  abas: AbaDaBarra[];
  ativa: number;
  aoTocar: (indice: number) => void;
  alvo?: RefObject<View | null>;
  cores: { superficie: string; destaque: string; aceso: string; apagado: string; toque: string; aviso: string };
  fonte?: string;
};

/** Fora do Android 13+ (e na prévia web) não há barra de vidro: a TabBar usa a de sempre. */
export const BARRA_VIDRO = false;
export function BarraVidro(_: PropsBarraVidro) { return null; }
