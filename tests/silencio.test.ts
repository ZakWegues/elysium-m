import { describe, expect, it } from "vitest";
import { limiaresDaGravacao } from "../src/lib/silencio";

/** Simula a gravação: ruído, fala, ruído — e diz quando fecharia (1,3 s de silêncio). */
function fechaEm(niveis: number[]): number | null {
  let falou = false, ultima = 0;
  for (let i = 0; i < niveis.length; i++) {
    const t = i * 120, lim = limiaresDaGravacao(niveis.slice(0, i + 1));
    if (niveis[i] > lim.fala) { falou = true; ultima = t; } else if (falou && niveis[i] > lim.silencio) ultima = t;
    if (falou && t - ultima > 1300) return t;
  }
  return null;
}
const rep = (n: number, v: number) => Array.from({ length: n }, (_, i) => v + ((i * 7) % 5) - 2);

describe("silêncio adaptativo (26/10)", () => {
  it("quarto quieto: os limiares de sempre", () => {
    expect(limiaresDaGravacao(rep(10, -60))).toMatchObject({ fala: -38, silencio: -46 });
  });

  it("ambiente com ruído de −37 dB (o do log): antes ia ao teto de 30 s, agora fecha ~1,5 s depois da fala", () => {
    const niveis = [...rep(6, -37), ...rep(25, -15), ...rep(250, -37)];
    const fim = fechaEm(niveis);
    expect(fim).not.toBeNull();
    expect(fim!).toBeLessThan((6 + 25) * 120 + 1800);
  });

  it("pausas curtas no meio da frase não cortam", () => {
    const niveis = [...rep(6, -50), ...rep(10, -15), ...rep(6, -45), ...rep(10, -15), ...rep(30, -50)];
    expect(fechaEm(niveis)!).toBeGreaterThan(32 * 120);
  });
});
