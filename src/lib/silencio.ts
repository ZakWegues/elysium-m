/**
 * Limiares da gravação que se ajustam ao ambiente (26/10). Os fixos do bloco 89 (−38 dB "falou",
 * −46 "ainda falando") nunca fechavam num lugar com ruído: no log, mediana de −37/−40 dB, fala
 * em 0,7 s e gravação até o teto de 30 s. Aqui o "piso" é o ruído medido (os 20% mais baixos dos
 * níveis até agora); fala é bem acima dele, silêncio é voltar para perto dele. Num quarto quieto
 * os limiares fixos continuam valendo (são o mínimo). Pura, para teste.
 */
export const FALA_MIN_DB = -38;
export const SILENCIO_MIN_DB = -46;

export function limiaresDaGravacao(niveis: number[]): { fala: number; silencio: number; piso: number | null } {
  const validos = niveis.filter((n) => n > -160);
  if (validos.length < 4) return { fala: FALA_MIN_DB, silencio: SILENCIO_MIN_DB, piso: null };
  const ordenados = [...validos].sort((a, b) => a - b);
  const piso = ordenados[Math.floor(ordenados.length * 0.2)];
  return {
    piso,
    // Tetos: nem um ambiente barulhento faz fala normal (−25 a −10 dB) parecer silêncio.
    fala: Math.min(-28, Math.max(FALA_MIN_DB, piso + 10)),
    silencio: Math.min(-32, Math.max(SILENCIO_MIN_DB, piso + 5)),
  };
}
