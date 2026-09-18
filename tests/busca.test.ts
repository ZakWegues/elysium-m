import { describe, expect, it } from "vitest";
import { dobrar, ordenarPorConsulta, pontuar } from "../src/lib/busca";

describe("busca — pontuação", () => {
  it("substring: começo < depois de espaço < no meio", () => {
    expect(pontuar("calc", "calculadora")).toBe(0);
    expect(pontuar("chrome", "google chrome")!).toBeGreaterThan(0);
    expect(pontuar("chrome", "google chrome")!).toBeLessThan(pontuar("rom", "google chrome")!);
  });

  it("ignora acento e caixa", () => {
    expect(dobrar("Memória")).toBe("memoria");
    expect(pontuar("memoria", "Memória")).toBe(0);
    expect(pontuar("LEMB", "lembretes")).toBe(0);
  });

  it("subsequência perto casa; espalhada não (o achado do bloco 58)", () => {
    expect(pontuar("lmbr", "lembrete")).not.toBeNull();
    expect(pontuar("calc", "principal projeto de isaac")).toBeNull();
  });

  it("consulta vazia casa tudo com zero", () => {
    expect(pontuar("", "qualquer coisa")).toBe(0);
  });
});

describe("busca — ordenação", () => {
  const itens = [
    { grupo: "conversa", texto: "calculadora de férias" },
    { grupo: "app", texto: "calculadora", chaves: ["calc"] },
    { grupo: "acao", texto: "Bloquear a tela", chaves: ["lock"] },
    { grupo: "memoria", texto: "o principal projeto de isaac é o elysium" },
  ];
  const ordem = ["nav", "acao", "preset", "app", "lembrete", "memoria", "conversa"];

  it("apelido vale como o nome; empate desempata pelo grupo", () => {
    const r = ordenarPorConsulta(itens, "calc", ordem);
    expect(r.map(i => i.grupo)).toEqual(["app", "conversa"]);
  });

  it("não devolve lixo de subsequência espalhada", () => {
    expect(ordenarPorConsulta(itens, "calc", ordem).some(i => i.grupo === "memoria")).toBe(false);
  });

  it("sem consulta devolve tudo, na ordem dos grupos", () => {
    expect(ordenarPorConsulta(itens, "", ordem).map(i => i.grupo)).toEqual(["acao", "app", "memoria", "conversa"]);
  });
});
