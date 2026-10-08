import { describe, expect, it } from "vitest";
import { agruparTarefas, atrasada, filtrarTarefas, mascaraHora, montarQuando, proximosDias, quandoTarefa, validarHora } from "../src/lib/tarefasUi";
import type { Tarefa } from "../src/lib/rpc";

// 08/10/2026, quinta, 10h.
const AGORA = new Date(2026, 9, 8, 10, 0).getTime();
const t = (id: string, extra: Partial<Tarefa> = {}): Tarefa => ({ id, texto: id, feita: false, criadaEm: 0, origem: "manual", ...extra });
const em = (d: number, h = 12) => new Date(2026, 9, d, h, 0).getTime();

describe("tarefas no celular (fase 18)", () => {
  it("agrupa como o Todoist, só as seções com algo", () => {
    const s = agruparTarefas([
      t("atrasada", { prazo: em(7) }), t("hoje", { prazo: em(8, 15) }), t("amanha", { prazo: em(9) }),
      t("prox", { prazo: em(15) }), t("sem"), t("feita", { feita: true, feitaEm: AGORA }),
    ], AGORA);
    expect(s.map(x => x.chave)).toEqual(["atrasadas", "hoje", "amanha", "proximos", "semData", "feitas"]);
    expect(agruparTarefas([t("sem")], AGORA).map(x => x.chave)).toEqual(["semData"]);
  });
  it("sem hora (dia todo) não fica atrasada de manhã", () => {
    expect(atrasada(t("p", { prazo: em(8, 8), semHora: true }), AGORA)).toBe(false);
    expect(atrasada(t("p", { prazo: em(8, 8) }), AGORA)).toBe(true);
  });
  it("estrela primeiro dentro da seção", () => {
    const s = agruparTarefas([t("a", { prazo: em(8, 11) }), t("b", { prazo: em(8, 20), prioridade: "alta" })], AGORA);
    expect(s[0].data.map(x => x.id)).toEqual(["b", "a"]);
  });
  it("rótulo do prazo", () => {
    expect(quandoTarefa(em(8, 16), false, AGORA)).toBe("hoje 16:00");
    expect(quandoTarefa(em(9, 8), true, AGORA)).toBe("amanhã · dia todo");
    expect(quandoTarefa(em(10, 10), false, AGORA)).toBe("sáb 10:00");
    expect(quandoTarefa(em(25, 9), false, AGORA)).toBe("25/10 09:00");
  });
  it("máscara e validação da hora", () => {
    expect(mascaraHora("1430")).toBe("14:30");
    expect(mascaraHora("930")).toBe("9:30");
    expect(mascaraHora("9")).toBe("9");
    expect(validarHora("9:30")).toBe("09:30");
    expect(validarHora("")).toBe("");
    expect(validarHora("25:00")).toBeNull();
  });
  it("monta o quando", () => {
    const d = new Date(2026, 9, 9);
    expect(montarQuando(d, "", new Date(AGORA))).toBe("2026-10-09");
    expect(montarQuando(d, "14:00", new Date(AGORA))).toBe("2026-10-09T14:00");
    expect(montarQuando(null, "14:00", new Date(AGORA))).toBe("2026-10-08T14:00");
    expect(montarQuando(null, "", new Date(AGORA))).toBeUndefined();
  });
  it("próximos dias e busca sem acento", () => {
    const ds = proximosDias(3, new Date(AGORA));
    expect(ds.map(d => d.rotulo)).toEqual(["Hoje", "Amanhã", "sáb 10"]);
    expect(filtrarTarefas([t("Prova de cálculo"), t("pão")], "calculo").map(x => x.id)).toEqual(["Prova de cálculo"]);
  });
});
