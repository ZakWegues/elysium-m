import { describe, expect, it, vi } from "vitest";

vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.4.0", nativeBuildVersion: "13" }));
vi.mock("expo-intent-launcher", () => ({ startActivityAsync: async () => ({}) }));
vi.mock("expo-file-system", () => ({ File: class {}, Paths: {} }));

import { compararVersoes, versaoInstalada } from "../src/lib/atualizacao";

describe("versão nova do app (bloco 95)", () => {
  it("usa a versão nativa do APK", () => {
    expect(versaoInstalada()).toBe("1.4.0");
  });

  it("compara número a número", () => {
    expect(compararVersoes("1.5.0", "1.4.0")).toBeGreaterThan(0);
    expect(compararVersoes("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compararVersoes("v1.4.0", "1.4.0")).toBe(0);
    expect(compararVersoes("1.3.2", "1.4.0")).toBeLessThan(0);
  });
});

describe("notas da release", () => {
  it("tira a linha do versionCode que o script de publicação acrescenta", async () => {
    const { notasLimpas } = await import("../src/lib/atualizacao");
    expect(notasLimpas("Painel de armazenamento.\n\nversionCode 15\n")).toBe("Painel de armazenamento.");
    expect(notasLimpas("Sem código no fim")).toBe("Sem código no fim");
  });
});
