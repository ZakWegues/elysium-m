import { describe, expect, it } from "vitest";
import { conversaParaContinuar, type ChatSession } from "../src/lib/chatHistoryStore";

const s = (id: string, updatedAt: number, aparelho?: "pc" | "celular"): ChatSession =>
  ({ id, title: id, createdAt: 0, updatedAt, favorite: false, messages: [], ...(aparelho ? { aparelho } : {}) });

describe("continuar do PC (31/10)", () => {
  it("a mais recente, mexida no PC há menos de 3 horas", () => {
    const agora = 10 * 3_600_000;
    expect(conversaParaContinuar([s("a", agora - 120_000, "celular"), s("b", agora - 60_000, "pc")], "pc", agora)?.id).toBe("b");
    expect(conversaParaContinuar([s("a", agora - 30_000, "celular"), s("b", agora - 60_000, "pc")], "pc", agora)).toBeNull();
    expect(conversaParaContinuar([s("b", agora - 5 * 3_600_000, "pc")], "pc", agora)).toBeNull();
    expect(conversaParaContinuar([], "pc", agora)).toBeNull();
  });
});
