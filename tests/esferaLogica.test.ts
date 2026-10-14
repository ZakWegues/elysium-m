import { describe, expect, it } from "vitest";
import { CICLO_PENSANDO_MS, RITMO_PENSANDO, fatorNoturno } from "../src/lib/esferaLogica";

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
  it("ritmo do pensando igual ao do PC", () => {
    expect(RITMO_PENSANDO).toBe(4);
    expect(CICLO_PENSANDO_MS).toBe(1571);
  });
});
