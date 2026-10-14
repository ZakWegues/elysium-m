/**
 * Contas puras da esfera do Chat (fase 22) — espelho de `dashboard/js/esfera-logica.js` do PC.
 * Os números são os mesmos de propósito: a esfera do celular imita a do desktop.
 */

/** Velocidade angular (rad/s) do seno do "pensando": a esfera e os três pontinhos usam a mesma. */
export const RITMO_PENSANDO = 4;
/** Um ciclo do "pensando", em ms (2π / ritmo). */
export const CICLO_PENSANDO_MS = Math.round((2 * Math.PI / RITMO_PENSANDO) * 1000);
/** Duração da esfera "nascendo" (pontos espalhados → esfera). */
export const NASCER_MS = 900;

/** Curva de saída: rápida no começo, assenta no fim. */
export function easeOutCubic(k: number): number {
  const x = Math.max(0, Math.min(1, k));
  return 1 - Math.pow(1 - x, 3);
}

export interface FatorNoturno { giro: number; brilho: number; respira: number }

/**
 * Entre 22h e 6h a esfera fica mais calma: gira 40% mais devagar, brilha 25% menos e respira
 * mais devagar — combina com a voz baixa da noite. `hora` de 0 a 23 (pode ter fração).
 */
export function fatorNoturno(hora: number): FatorNoturno {
  const h = ((Number(hora) % 24) + 24) % 24;
  const noite = h >= 22 || h < 6;
  return noite ? { giro: 0.6, brilho: 0.75, respira: 0.6 } : { giro: 1, brilho: 1, respira: 1 };
}

/** Cada tecla dá um micro-pulso: soma `quanto` (0,08), sem passar de 0,35 nem abaixar quem já está alto. */
export function pulsoDeTecla(nivel: number, quanto = 0.08): number {
  const n = Number(nivel) || 0;
  return n >= 0.35 ? n : Math.min(0.35, n + quanto);
}

/** Onde fica o centro da esfera na tela do Chat: 32% da altura com o chat vazio, 45% com conversa. */
export function centroDaEsfera(altura: number, vazio: boolean): number {
  return altura * (vazio ? 0.32 : 0.45);
}

/** Inclinação alvo (rad) pelo arrasto: proporcional ao deslocamento, presa em ±0,35. */
export function inclinacaoPeloArrasto(desloc: number, tamanho: number): number {
  'worklet';
  if (!tamanho) return 0;
  return Math.max(-0.35, Math.min(0.35, (desloc / tamanho) * 0.8));
}
