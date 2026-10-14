import { describe, expect, it } from "vitest";
import { abasMontadas, mesmasAbas, type Aba } from "../src/lib/abas";

describe("abas vivas", () => {
  it("monta a aba visitada e não desmonta as anteriores", () => {
    let m = new Set<Aba>(["home"]);
    m = abasMontadas(m, "hoje");
    m = abasMontadas(m, "home");
    expect([...m].sort()).toEqual(["hoje", "home"]);
  });

  it("pré-carrega Início, Hoje e Chat, mas não o PC", () => {
    const m = abasMontadas(new Set<Aba>(["home"]), "home", true);
    expect(m.has("hoje") && m.has("chat")).toBe(true);
    expect(m.has("control")).toBe(false);
  });

  it("fase 22: quatro abas — Rotinas não é mais destino", () => {
    const m = abasMontadas(new Set<Aba>(["home"]), "control", true);
    expect([...m].sort()).toEqual(["chat", "control", "hoje", "home"]);
  });

  it("Conversas sai ao trocar de aba (abre sempre fresca)", () => {
    let m = abasMontadas(new Set<Aba>(["home", "chat"]), "conversations");
    expect(m.has("conversations")).toBe(true);
    m = abasMontadas(m, "chat");
    expect(m.has("conversations")).toBe(false);
    expect(m.has("chat")).toBe(true);
  });

  it("mesmasAbas compara conteúdo", () => {
    expect(mesmasAbas(new Set<Aba>(["home", "chat"]), new Set<Aba>(["chat", "home"]))).toBe(true);
    expect(mesmasAbas(new Set<Aba>(["home"]), new Set<Aba>(["home", "hoje"]))).toBe(false);
  });
});
