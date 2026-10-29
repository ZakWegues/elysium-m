import { createContext, useContext } from 'react';

/**
 * 31/10: a barra de abas flutua POR CIMA das telas (o conteúdo passa por baixo dela, com
 * desfoque). Cada tela põe esta folga no fim da rolagem e embaixo da caixa de texto, para o
 * último item e o campo de escrever não ficarem escondidos atrás da barra. 0 quando a barra
 * não está na tela (teclado aberto, gaveta por cima).
 */
export const FolgaDaBarraContext = createContext(0);

export function useFolgaDaBarra(): number {
  return useContext(FolgaDaBarraContext);
}
