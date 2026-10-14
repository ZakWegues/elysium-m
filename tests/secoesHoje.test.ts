import { describe, expect, it } from "vitest";
import { ABERTAS_PADRAO, alternarSecao, estaAberta, lerSecoes, tituloComContador } from "../src/lib/secoesHoje";

describe("seções do Hoje (fase 22)", () => {
  it("abertas por padrão: amanhã, lembretes, agenda e hábitos", () => {
    for (const c of ["amanha", "lembretes-e-tarefas", "agenda", "habitos-de-hoje"]) expect(estaAberta(c, {})).toBe(true);
    for (const c of ["metas", "clima", "listas", "manchetes", "estudo"]) expect(estaAberta(c, {})).toBe(false);
    expect(ABERTAS_PADRAO).toHaveLength(4);
  });
  it("o salvo ganha do padrão", () => {
    expect(estaAberta("agenda", { agenda: false })).toBe(false);
    expect(estaAberta("metas", { metas: true })).toBe(true);
  });
  it("alternar não muda o estado anterior", () => {
    const antes = {};
    const depois = alternarSecao(antes, "metas");
    expect(depois).toEqual({ metas: true });
    expect(antes).toEqual({});
    expect(alternarSecao(depois, "metas")).toEqual({ metas: false });
    expect(alternarSecao({}, "agenda")).toEqual({ agenda: false });
  });
  it("lê o salvo com tolerância", () => {
    expect(lerSecoes(null)).toEqual({});
    expect(lerSecoes("{quebrado")).toEqual({});
    expect(lerSecoes("[1,2]")).toEqual({});
    expect(lerSecoes('{"metas":true,"x":"sim"}')).toEqual({ metas: true });
  });
  it("contador no título", () => {
    expect(tituloComContador("METAS", 3)).toBe("METAS · 3");
    expect(tituloComContador("HÁBITOS", "2/5")).toBe("HÁBITOS · 2/5");
    expect(tituloComContador("CLIMA")).toBe("CLIMA");
    expect(tituloComContador("LISTAS", 0)).toBe("LISTAS");
  });
});
