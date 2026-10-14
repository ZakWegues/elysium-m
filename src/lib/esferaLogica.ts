/**
 * Contas puras da esfera do Chat (fase 22) — espelho de `dashboard/js/esfera-logica.js` do PC.
 * 22.1: a esfera do celular virou só fundo (sem toque, sem "nascer", sem pulso de tecla); daqui
 * ficou o ritmo do "pensando" e a calma da noite.
 */

/** Velocidade angular (rad/s) do seno do "pensando": a esfera e os três pontinhos usam a mesma. */
export const RITMO_PENSANDO = 4;
/** Um ciclo do "pensando", em ms (2π / ritmo). */
export const CICLO_PENSANDO_MS = Math.round((2 * Math.PI / RITMO_PENSANDO) * 1000);

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
