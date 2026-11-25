import { describe, expect, it } from "vitest";
import { alturaDoCampo, cabem, perto, proximoTamanho, rotuloDaHora, separaAntes } from "../src/lib/campoDeMensagem";
import { botoesDasRapidas } from "../src/lib/respostasRapidas";

describe("campo de mensagem e chat (25/11)", () => {
  it("cresce até 7 linhas e abre em meia tela", () => {
    expect(alturaDoCampo(0, null)).toEqual({ altura: 42, linhas: 1 });
    expect(alturaDoCampo(22, null)).toEqual({ altura: 42, linhas: 1 });
    expect(alturaDoCampo(66, null)).toEqual({ altura: 86, linhas: 3 });
    expect(alturaDoCampo(660, null)).toEqual({ altura: 174, linhas: 30 });
    expect(alturaDoCampo(22, 300).altura).toBe(300);
    expect(perto(100, 4000)).toBe(null);
    expect(perto(3990, 4000)).toBe(10);
  });
  it("vira cartão sem piscar quando o texto volta a caber", () => {
    expect(proximoTamanho(null, 20, 1)).toBe(null);
    expect(proximoTamanho(null, 25, 2)).toBe(25);
    expect(proximoTamanho(25, 25, 1)).toBe(25);
    expect(proximoTamanho(25, 22, 1)).toBe(null);
    expect(proximoTamanho(25, 10, 3)).toBe(25);
  });
  it("hora e separador", () => {
    const agora = new Date(2026, 10, 25, 20, 0).getTime();
    expect(rotuloDaHora(new Date(2026, 10, 25, 19, 20).getTime(), agora)).toBe("Hoje 19:20");
    expect(rotuloDaHora(new Date(2026, 10, 24, 8, 5).getTime(), agora)).toBe("Ontem 08:05");
    expect(rotuloDaHora(new Date(2026, 10, 20, 8, 5).getTime(), agora)).toMatch(/20.*08:05$/);
    expect(separaAntes(agora, undefined)).toBe(true);
    expect(separaAntes(agora, agora - 60_000)).toBe(false);
    expect(separaAntes(agora, agora - 31 * 60_000)).toBe(true);
    expect(separaAntes(new Date(2026, 10, 25, 0, 5).getTime(), new Date(2026, 10, 24, 23, 58).getTime())).toBe(true);
  });
  it("as conversas que cabem no aparelho", () => {
    expect(cabem(Array.from({ length: 60 }, (_, i) => ({ i }))).length).toBe(40);
    const grandes = Array.from({ length: 20 }, () => ({ t: "x".repeat(200_000) }));
    expect(cabem(grandes).length).toBe(5);
  });
  it("no celular não oferece mandar para o celular", () => {
    const r = { pergunta: false, sim: false, nao: false, opcoes: [], prontas: ["explica melhor", "manda no celular"] };
    expect(botoesDasRapidas(r).map((b) => b.rotulo)).toEqual(["explica melhor"]);
  });
});
