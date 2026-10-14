import { describe, expect, it } from "vitest";
import { CARDS_PADRAO_V2, migrarLayout, resumoDaInicio } from "../src/lib/layoutInicio";

describe("Início (fase 22)", () => {
  it("cinco cards de fábrica", () => {
    expect([...CARDS_PADRAO_V2]).toEqual(["sugestoes", "hoje", "computador", "musica", "atalhos"]);
  });
  it("migração única: sem a flag, descarta o layout salvo e grava a flag", () => {
    expect(migrarLayout(null, '{"ordem":["energia"]}')).toEqual({ usar: null, gravarFlag: true, apagarSalvo: true });
    expect(migrarLayout(null, null)).toEqual({ usar: null, gravarFlag: true, apagarSalvo: false });
  });
  it("com a flag, o layout salvo vale como sempre", () => {
    expect(migrarLayout("1", '{"ordem":["hoje"]}')).toEqual({ usar: '{"ordem":["hoje"]}', gravarFlag: false, apagarSalvo: false });
  });
  it("linha de estado única", () => {
    expect(resumoDaInicio(0, null)).toBe("");
    expect(resumoDaInicio(1, null)).toBe(" · 1 lembrete");
    expect(resumoDaInicio(3, 21.6)).toBe(" · 3 lembretes · 22° lá fora");
    expect(resumoDaInicio(0, 18)).toBe(" · 18° lá fora");
  });
});
