import { describe, expect, it } from "vitest";
import {
  acelerar, classificarToque, Coalescedor, diffTexto, ehDuplo, ganho, gestoTresDedos, passoInercia,
} from "../src/lib/trackpad";

describe("trackpad — curva de aceleração", () => {
  it("devagar ≈ a sensibilidade; rápido ganha muito mais", () => {
    expect(ganho(0, 1.4)).toBeCloseTo(1.4);
    expect(ganho(0.1, 1.4)).toBeLessThan(1.8);
    expect(ganho(3, 1.4)).toBeGreaterThan(4);
  });
  it("cresce com a velocidade e para no teto", () => {
    expect(ganho(1, 1.4)).toBeGreaterThan(ganho(0.5, 1.4));
    expect(ganho(50, 1.4)).toBe(ganho(4, 1.4));
  });
  it("sensibilidade presa entre 0,6 e 3", () => {
    expect(ganho(0, 0.1)).toBeCloseTo(0.6);
    expect(ganho(0, 10)).toBeCloseTo(3);
  });
  it("acelerar mantém a direção", () => {
    const [x, y] = acelerar(3, -4, 10, 1.4);
    expect(x / y).toBeCloseTo(-0.75);
    expect(Math.hypot(x, y)).toBeGreaterThan(5);
  });
});

describe("trackpad — coalescedor", () => {
  it("junta movimentos e rolagens seguidos", () => {
    const c = new Coalescedor();
    c.add(["m", 1, 2]); c.add(["m", 3, 4]); c.add(["w", 0.5, 0]); c.add(["w", 0.25, 0.1]);
    expect(c.tirar()).toEqual([["m", 4, 6], ["w", 0.75, 0.1]]);
    expect(c.vazio).toBe(true);
  });
  it("clique fecha o bloco: a ordem nunca muda", () => {
    const c = new Coalescedor();
    c.add(["m", 1, 1]); c.add(["c", "left"]); c.add(["m", 2, 2]);
    expect(c.tirar()).toEqual([["m", 1, 1], ["c", "left"], ["m", 2, 2]]);
  });
  it("não altera o evento de quem chamou", () => {
    const c = new Coalescedor();
    const e: ["m", number, number] = ["m", 1, 1];
    c.add(e); c.add(["m", 1, 1]);
    expect(e).toEqual(["m", 1, 1]);
  });
  it("tira no máximo 64 por vez", () => {
    const c = new Coalescedor();
    for (let i = 0; i < 70; i++) { c.add(["c", "left"]); }
    expect(c.tirar(64)).toHaveLength(64);
    expect(c.tirar(64)).toHaveLength(6);
  });
});

describe("trackpad — classificador", () => {
  it("tap: pouco movimento e rápido", () => {
    expect(classificarToque(3, 120)).toBe("tap");
    expect(classificarToque(30, 120)).toBe("drag");
    expect(classificarToque(3, 600)).toBe("drag");
  });
  it("duplo: segundo toque logo depois do primeiro", () => {
    expect(ehDuplo(1000, 1200)).toBe(true);
    expect(ehDuplo(1000, 1500)).toBe(false);
    expect(ehDuplo(null, 1200)).toBe(false);
  });
  it("três dedos: cima = Win+Tab, baixo = Win+D", () => {
    expect(gestoTresDedos(-80)).toEqual(["win", "tab"]);
    expect(gestoTresDedos(80)).toEqual(["win", "d"]);
    expect(gestoTresDedos(10)).toBeNull();
  });
  it("inércia decai e para", () => {
    expect(passoInercia(1)).toBeCloseTo(0.92);
    expect(passoInercia(0.015)).toBe(0);
  });
});

describe("trackpad — teclado ao vivo", () => {
  it("só acrescentou", () => expect(diffTexto("ola", "ola mundo")).toEqual({ bs: 0, texto: " mundo" }));
  it("só apagou", () => expect(diffTexto("ola mundo", "ola")).toEqual({ bs: 6, texto: "" }));
  it("trocou o fim (corretor)", () => expect(diffTexto("voce", "você")).toEqual({ bs: 1, texto: "ê" }));
  it("emoji conta como um", () => expect(diffTexto("oi 😀", "oi ")).toEqual({ bs: 1, texto: "" }));
  it("igual não faz nada", () => expect(diffTexto("abc", "abc")).toEqual({ bs: 0, texto: "" }));
});
