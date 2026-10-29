import { useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { makeMutable, withTiming } from 'react-native-reanimated';
import { proximoEstado } from './barraRolagemLimiar';

/**
 * Rótulos da barra de abas somem ao rolar para baixo e voltam ao rolar para cima — o
 * comportamento da barra do Nuvio (limiar de 60 px acumulados na mesma direção).
 *
 * `rotulos` vai de 1 (com nomes) a 0 (só ícones) e é lido na thread de UI pela barra.
 */
export const rotulos = makeMutable(1);

function mostrar(aberto: boolean) {
  rotulos.value = withTiming(aberto ? 1 : 0, { duration: 260 });
}

/** Volta os nomes (troca de aba, por exemplo). */
export function mostrarRotulos() {
  mostrar(true);
}

/** `onScroll` para a rolagem principal de uma tela. `y` positivo = rolou para baixo. */
export function useRolagemDaBarra() {
  const estado = useRef({ ultimoY: 0, acumulado: 0, aberto: true });
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const s = estado.current;
    const delta = y - s.ultimoY;
    s.ultimoY = y;
    // Mudou de direção: o acumulado recomeça daqui, como no Nuvio.
    if ((delta > 0 && s.acumulado < 0) || (delta < 0 && s.acumulado > 0)) s.acumulado = 0;
    // No topo, sempre com os nomes.
    const p = y <= 4 ? { aberto: true, acumulado: 0 } : proximoEstado(s.acumulado + delta, s.aberto);
    if (p.aberto !== s.aberto) mostrar(p.aberto);
    s.aberto = p.aberto;
    s.acumulado = p.acumulado;
  };
}
