import { describe, expect, it } from "vitest";
import {
  CICLO_PENSANDO_MS, NASCER_MS, RITMO_PENSANDO, centroDaEsfera, easeOutCubic, fatorNoturno,
  inclinacaoPeloArrasto, pulsoDeTecla,
} from "../src/lib/esferaLogica";

describe("esfera — fator noturno (fase 22)", () => {
  it("é noite das 22h às 6h", () => {
    for (const h of [22, 23, 0, 3, 5.99]) expect(fatorNoturno(h)).toEqual({ giro: 0.6, brilho: 0.75, respira: 0.6 });
  });
  it("é dia das 6h às 22h", () => {
    for (const h of [6, 12, 21.99]) expect(fatorNoturno(h).giro).toBe(1);
  });
  it("aceita hora fora de 0–23", () => {
    expect(fatorNoturno(47).giro).toBe(0.6);
    expect(fatorNoturno(-1).giro).toBe(0.6);
  });
});

describe("esfera — pulso de tecla", () => {
  it("soma 0,08 até o teto de 0,35", () => {
    expect(pulsoDeTecla(0)).toBeCloseTo(0.08);
    expect(pulsoDeTecla(0.32)).toBeCloseTo(0.35);
  });
  it("não abaixa quem já está alto", () => {
    expect(pulsoDeTecla(0.9)).toBe(0.9);
  });
});

describe("esfera — posição, arrasto e ritmo", () => {
  it("centro a 32% vazio e 45% com conversa, como no PC", () => {
    expect(centroDaEsfera(1000, true)).toBe(320);
    expect(centroDaEsfera(1000, false)).toBe(450);
  });
  it("arrasto inclina até ±0,35 rad", () => {
    expect(inclinacaoPeloArrasto(0, 300)).toBe(0);
    expect(inclinacaoPeloArrasto(1000, 300)).toBe(0.35);
    expect(inclinacaoPeloArrasto(-1000, 300)).toBe(-0.35);
    expect(inclinacaoPeloArrasto(30, 300)).toBeCloseTo(0.08);
    expect(inclinacaoPeloArrasto(30, 0)).toBe(0);
  });
  it("curva e constantes iguais às do PC", () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(3)).toBe(1);
    expect(RITMO_PENSANDO).toBe(4);
    expect(CICLO_PENSANDO_MS).toBe(1571);
    expect(NASCER_MS).toBe(900);
  });
});
