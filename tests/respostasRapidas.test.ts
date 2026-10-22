import { describe, expect, it } from "vitest";
import { botoesDasRapidas, lerRapidas } from "../src/lib/respostasRapidas";

describe("respostas rápidas no celular (22/10)", () => {
  it("valida o campo do reply; PC antigo não manda", () => {
    expect(lerRapidas(undefined)).toBeUndefined();
    expect(lerRapidas("x")).toBeUndefined();
    expect(lerRapidas({ pergunta: true, sim: true, nao: "s", opcoes: ["a", 3, "", "b"], prontas: "x" }))
      .toEqual({ pergunta: true, sim: true, nao: false, opcoes: ["a", "b"], prontas: [] });
  });

  it("com pergunta: Sim/Não/opções + prontas + Outra resposta, sem sugestões", () => {
    const r = lerRapidas({ pergunta: true, sim: true, nao: true, opcoes: [], prontas: ["agora não"] });
    expect(botoesDasRapidas(r, ["sug"]).map(b => b.rotulo)).toEqual(["Sim", "Não", "agora não", "Outra resposta…"]);
    expect(botoesDasRapidas(r)[0]).toMatchObject({ valor: "sim", tipo: "forte" });
  });

  it("sem pergunta: sugestões + prontas, uma linha só", () => {
    const r = lerRapidas({ pergunta: false, prontas: ["pode fazer"] });
    expect(botoesDasRapidas(r, ["E amanhã?"]).map(b => b.tipo)).toEqual(["sugestao", "pronta"]);
    expect(botoesDasRapidas(undefined, ["E amanhã?"]).map(b => b.rotulo)).toEqual(["E amanhã?"]);
  });
});
