import { describe, expect, it, vi } from "vitest";
vi.mock("expo-intent-launcher", () => ({ startActivityAsync: async () => ({}) }));
vi.mock("expo-file-system", () => ({ File: class {}, Directory: class {}, Paths: {} }));
import { nomeSeguro, planejarEnvio, resumoDosArquivos } from "../src/lib/anexos";

const arq = (uri: string, sizeBytes: number) => ({ name: uri, mimeType: "image/jpeg", uri, sizeBytes });

describe("anexos da Caixa (fase 21)", () => {
  it("vários de uma vez: separa os grandes e tira repetidos", () => {
    const { aceitos, grandes } = planejarEnvio([arq("a", 100), arq("b", 6 * 1024 * 1024), arq("a", 100), arq("c", 5 * 1024 * 1024)]);
    expect(aceitos.map(a => a.uri)).toEqual(["a", "c"]);
    expect(grandes.map(a => a.uri)).toEqual(["b"]);
  });
  it("nome que não escapa da pasta nem engana com inversão de direção", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(nomeSeguro("foto‮gpj.exe")).toBe("fotogpj.exe");
    expect(nomeSeguro("   ")).toBe("arquivo");
    expect(nomeSeguro("relatório final.pdf")).toBe("relatório final.pdf");
  });
  it("resumo do que vai", () => {
    expect(resumoDosArquivos([{ sizeBytes: 1024 * 1024 }, { sizeBytes: 1024 * 1024 * 1.4 }])).toBe("2 arquivos (2,4 MB)");
    expect(resumoDosArquivos([{ sizeBytes: 2048 }])).toBe("1 arquivo (2 KB)");
  });
});
