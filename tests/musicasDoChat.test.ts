import { describe, expect, it } from "vitest";
import { frasesDe } from "../src/lib/divisaoFala";
import { parseMarkdown } from "../src/lib/markdown";
import { lerMusicas } from "../src/lib/musicasDaResposta";

describe("músicas sugeridas no chat (23/11)", () => {
  it("valida o que veio do PC", () => {
    const m = lerMusicas({ itens: [{ id: 1, titulo: "Roulette", artista: "SOAD", capa: "https://cdn-images.dzcdn.net/x.jpg", motivo: "acústica" }, { id: 2, titulo: "B", artista: "C", capa: "https://mau.com/x.jpg" }, { id: 0, titulo: "x" }], aprendi: ["Lonely Day", 3] });
    expect(m.musicas?.itens.map((x) => [x.id, x.capa])).toEqual([[1, "https://cdn-images.dzcdn.net/x.jpg"], [2, null]]);
    expect(m.musicas?.aprendi).toEqual(["Lonely Day"]);
    expect(lerMusicas(undefined)).toEqual({});
    expect(lerMusicas({ itens: [] })).toEqual({});
  });
  it("a régua não vira texto nem fala", () => {
    expect(frasesDe("Um.\n---\n• \nDois.")).toEqual(["Um.", "Dois."]);
    expect(parseMarkdown("Um\n\n---\n\nDois").length).toBe(2);
  });
});
