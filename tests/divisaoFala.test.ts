import { describe, expect, it } from "vitest";
import { frasesDe, partesDaFala, trechoParaMostrar } from "../src/lib/divisaoFala";

describe("divisão da fala", () => {
  it("quebra em frases por pontuação e linha", () => {
    expect(frasesDe("Bom dia, chefe. Sol hoje!\nTreino C? Sim… vamos")).toEqual(["Bom dia, chefe.", "Sol hoje!", "Treino C?", "Sim…", "vamos"]);
  });

  it("texto curto é uma parte só", () => {
    expect(partesDaFala("Oi. Tudo certo.")).toEqual(["Oi. Tudo certo."]);
  });

  it("junta frases inteiras sem passar do teto", () => {
    const frase = "Esta é uma frase de teste com algumas palavras.";
    const texto = Array(100).fill(frase).join(" ");
    const partes = partesDaFala(texto, 500);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) {
      expect(p.length).toBeLessThanOrEqual(500);
      expect(p.endsWith(".")).toBe(true);
    }
    expect(partes.join(" ")).toBe(texto);
  });

  it("frase gigante sem pontuação é cortada num espaço", () => {
    const texto = Array(300).fill("palavra").join(" ");
    const partes = partesDaFala(texto, 200);
    expect(partes.every(p => p.length <= 200 && !p.startsWith(" "))).toBe(true);
    expect(partes.join(" ")).toBe(texto);
  });

  it("trecho tira markdown e corta com reticências", () => {
    expect(trechoParaMostrar("**Clima:** 24°  e sol")).toBe("Clima: 24° e sol");
    expect(trechoParaMostrar("a".repeat(200), 20)).toHaveLength(20);
  });
});
