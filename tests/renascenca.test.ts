import { describe, expect, it } from "vitest";
import { familiaEscura, getPalette, resolverFamiliaEscolhida } from "../src/theme/palettes";

describe("tema Renascença (13/10)", () => {
  it("três variações com ouro, pigmento e tinta de pergaminho", () => {
    expect(getPalette("elisio", "renascenca").rotulo).toBe("Renascença — Florença");
    expect(getPalette("mare", "renascenca").rotulo).toBe("Renascença — Veneza");
    expect(getPalette("crepusculo", "renascenca").rotulo).toBe("Renascença — Roma");
    const p = getPalette("elisio", "renascenca");
    expect(p.familia).toBe("renascenca");
    expect(p.primary).toBe("#c9a14a");
    expect(p.text).toBe("#EFE4C8");
    expect(p.blurTint).toBe("dark");
  });
  it("é escura e a escolha gravada volta", () => {
    expect(familiaEscura("renascenca")).toBe(true);
    expect(resolverFamiliaEscolhida("renascenca")).toBe("renascenca");
  });
});
