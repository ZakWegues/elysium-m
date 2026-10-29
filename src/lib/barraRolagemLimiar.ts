/** O limiar da barra que esconde os nomes ao rolar (ver `barraRolagem.ts`). Puro. */
const LIMIAR = 60;

/** Decide o próximo estado a partir do acumulado. Pura (testada). */
export function proximoEstado(acumulado: number, aberto: boolean): { aberto: boolean; acumulado: number } {
  if (acumulado > LIMIAR && aberto) return { aberto: false, acumulado: 0 };
  if (acumulado < -LIMIAR && !aberto) return { aberto: true, acumulado: 0 };
  return { aberto, acumulado };
}
