import { useEffect, useRef, useState } from 'react';
import { reduzirUI } from './motion';

/**
 * 31/10: o número conta até o valor novo em 400 ms (desacelerando no fim, que é a parte que
 * se lê) em vez de trocar seco — o mesmo `animarNumero` do PC. Com "reduzir movimento",
 * troca direto.
 */
export function useContagem(alvo: number): number {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const de = atual.current;
    if (de === alvo || reduzirUI.value) { atual.current = alvo; setValor(alvo); return; }
    let quadro = 0;
    const t0 = Date.now();
    const passo = () => {
      const p = Math.min(1, (Date.now() - t0) / 400);
      const e = 1 - Math.pow(1 - p, 3);
      atual.current = de + (alvo - de) * e;
      setValor(atual.current);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return valor;
}
