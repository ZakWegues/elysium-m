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

/**
 * Fase 23: a esfera parada em SVG, para o widget da tela inicial (o widget é um bitmap, não
 * anima). Mesma esfera de Fibonacci do Chat, girada num ângulo bonito, com três camadas de
 * profundidade. `n` pontos, quadrado de `lado` px. Pura.
 */
export function svgDaEsfera(cor: string, lado = 200, n = 180): string {
  const ouro = Math.PI * (3 - Math.sqrt(5));
  const meio = lado / 2, R = lado * 0.34;
  const rx = 0.42, ry = 0.6;
  const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry);
  const camadas: string[][] = [[], [], []];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y);
    const x = Math.cos(ouro * i) * r, z = Math.sin(ouro * i) * r;
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const f = 2.8 / (2.8 - z2);
    const X = (meio + x1 * R * f).toFixed(1), Y = (meio + y2 * R * f).toFixed(1);
    const rr = ((0.7 + (z2 + 1) * 0.8) * f * (lado / 200)).toFixed(2);
    camadas[z2 < -0.33 ? 0 : z2 < 0.33 ? 1 : 2].push(`<circle cx="${X}" cy="${Y}" r="${rr}"/>`);
  }
  const op = [0.25, 0.55, 0.95];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado}" height="${lado}">`
    + `<defs><radialGradient id="h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${cor}" stop-opacity="0.32"/><stop offset="0.6" stop-color="${cor}" stop-opacity="0.08"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></radialGradient></defs>`
    + `<circle cx="${meio}" cy="${meio}" r="${(lado * 0.46).toFixed(1)}" fill="url(#h)"/>`
    + camadas.map((c, k) => `<g fill="${cor}" fill-opacity="${op[k]}">${c.join('')}</g>`).join('')
    + `<circle cx="${meio}" cy="${meio}" r="${(R * 1.32).toFixed(1)}" fill="none" stroke="${cor}" stroke-opacity="0.22" stroke-width="1.2"/>`
    + `</svg>`;
}
