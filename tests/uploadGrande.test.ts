import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = { status: 201, tamanho: 1024, urls: [] as string[], metodo: "" };
const enviados: unknown[] = [];
vi.mock("expo-intent-launcher", () => ({ startActivityAsync: async () => ({}) }));
vi.mock("expo-linking", () => ({ parse: () => ({}), getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) }));
vi.mock("expo-share-intent", () => ({ useShareIntent: () => ({}) }));
vi.mock("expo-file-system", () => ({
  Directory: class {}, Paths: {}, FileMode: {},
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get size() { return estado.tamanho; }
    async arrayBuffer() { return new ArrayBuffer(estado.tamanho); }
    createUploadTask(url: string, o: { httpMethod: string; onProgress?: (p: { bytesSent: number; totalBytes: number }) => void }) {
      estado.urls.push(url); estado.metodo = o.httpMethod;
      return {
        uploadAsync: async () => { o.onProgress?.({ bytesSent: estado.tamanho / 2, totalBytes: estado.tamanho }); return { status: estado.status, body: estado.status === 201 ? '{"id":"abc"}' : "", headers: {} }; },
        release() {},
      };
    }
  },
}));
vi.mock("../src/lib/mailbox", () => ({
  MAILBOX_MAX_ATTACHMENT_BYTES: 5 * 1024 * 1024,
  sendMessage: async (_p: unknown, m: unknown) => { enviados.push(m); return { id: "velho", createdAt: 0 }; },
}));

const pc = { endpoints: ["192.168.0.2"], activeIp: "192.168.0.2", port: 4200, token: "t" };
const arquivo = (bytes: number) => ({ uri: "file:///v.mp4", nome: "vídeo da festa.mp4", mimeType: "video/mp4", bytes });

describe("arquivo grande do celular para o PC (22/10)", async () => {
  const { mandarArquivoParaPc } = await import("../src/lib/shareIntent");
  const { urlDoUpload } = await import("../src/lib/anexos");
  beforeEach(() => { estado.status = 201; estado.urls = []; enviados.length = 0; });

  it("PC novo: PUT em stream com progresso, sem base64", async () => {
    estado.tamanho = 300 * 1024 * 1024;
    const prog: number[] = [];
    await mandarArquivoParaPc(pc, arquivo(estado.tamanho), "a festa", { progresso: (p) => prog.push(p), sessionId: "s1" });
    expect(estado.metodo).toBe("PUT");
    expect(estado.urls[0]).toMatch(/^http:\/\/192\.168\.0\.2:4200\/api\/mailbox\/upload\?/);
    expect(estado.urls[0]).toContain("sessionId=s1");
    expect(prog).toEqual([0.5]);
    expect(enviados).toEqual([]);
  });

  it("PC antigo (404) e arquivo pequeno: cai no base64", async () => {
    estado.status = 404; estado.tamanho = 1024;
    await mandarArquivoParaPc(pc, arquivo(1024), null);
    expect(enviados).toHaveLength(1);
    expect((enviados[0] as { kind: string }).kind).toBe("file");
  });

  it("PC antigo (404) e arquivo grande: erro claro, nada enviado", async () => {
    estado.status = 404; estado.tamanho = 50 * 1024 * 1024;
    await expect(mandarArquivoParaPc(pc, arquivo(estado.tamanho), null)).rejects.toThrow(/Atualize o ELYSIUM do PC/);
    expect(enviados).toEqual([]);
  });

  it("erros do PC viram mensagem legível", async () => {
    estado.tamanho = 1024;
    estado.status = 413;
    await expect(mandarArquivoParaPc(pc, arquivo(1024), null)).rejects.toThrow(/500 MB/);
    estado.status = 401;
    await expect(mandarArquivoParaPc(pc, arquivo(1024), null)).rejects.toThrow(/token/);
  });

  it("URL do upload: nome saneado, tipo e texto na query", () => {
    const u = new URL(urlDoUpload("http://pc:4200", "../../x y.mp4", "video/mp4", { texto: "  oi  " }));
    expect(u.pathname).toBe("/api/mailbox/upload");
    // Sem barra; o PC ainda tira o caminho de novo (receberUpload).
    expect(u.searchParams.get("nome")).not.toMatch(/[\\/]/);
    expect(u.searchParams.get("tipo")).toBe("video/mp4");
    expect(u.searchParams.get("texto")).toBe("oi");
  });
});
