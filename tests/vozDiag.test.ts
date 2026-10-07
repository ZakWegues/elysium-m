import { describe, expect, it } from "vitest";
import { resumoRodada } from "../src/lib/vozDiag";

describe("números do pedido por voz (bloco 116)", () => {
  it("resume níveis, tempos e motivo", () => {
    const l = resumoRodada({ numero: 2, niveis: [-60, -55, -30, -25, -41, -50], inicio: 0, primeiraFalaEm: 1800, fim: 4200, motivo: "silencio", caracteres: 23 });
    expect(l).toBe("rodada 2, pico -25 dB, mediana -41 dB, fala em 1,8 s, parou por silêncio depois da fala, 4,2 s gravados, transcrição de 23 caracteres");
  });
  it("sem fala e sem leitura de nível", () => {
    const l = resumoRodada({ numero: 1, niveis: [-160, -160], inicio: 0, primeiraFalaEm: null, fim: 20000, motivo: "sem_fala", caracteres: null });
    expect(l).toContain("sem leitura de nível");
    expect(l).toContain("não detectou fala");
    expect(l).not.toContain("transcrição");
  });
});
