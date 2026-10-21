import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({ File: class {}, Directory: class {}, Paths: {}, FileMode: {} }));
vi.mock("expo-intent-launcher", () => ({ startActivityAsync: async () => ({}) }));
vi.mock("../src/lib/notificacoes", () => ({ receberEntrega: async () => {} }));
vi.mock("../src/lib/estadoPc", () => ({ receberFrameEstado: () => {} }));
vi.mock("../src/lib/modo", () => ({ receberFrameModo: () => {} }));
vi.mock("../src/lib/pomodoro", () => ({ receberFramePomodoro: () => {} }));

/** Um WebSocket de mentira: guarda o que o app mandou e deixa o teste falar pelo PC. */
class WsFalso {
  static OPEN = 1;
  static todos: WsFalso[] = [];
  readyState = 0;
  enviados: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() { WsFalso.todos.push(this); }
  send(t: string) { this.enviados.push(t); }
  close() { this.readyState = 3; this.onclose?.(); }
  abrir() { this.readyState = 1; this.onopen?.(); }
  pc(obj: object) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  cair() { this.readyState = 3; this.onclose?.(); }
}
(globalThis as unknown as { WebSocket: unknown }).WebSocket = WsFalso;

const { openVoiceConnection, recuo, novoIdDePedido } = await import("../src/lib/stream");
const pairing = { endpoints: ["192.168.0.5"], activeIp: "192.168.0.5", port: 4200, token: "x".repeat(40) };

describe("conexão firme do chat (21/10)", () => {
  beforeEach(() => { WsFalso.todos = []; vi.useFakeTimers(); });

  it("a conexão cai no meio e a resposta continua depois de reconectar, sem reenviar o comando", async () => {
    const estados: string[] = [];
    const conn = openVoiceConnection(pairing, undefined, undefined, (e) => estados.push(e));
    WsFalso.todos[0].abrir();
    await conn.ready;
    const pedacos: string[] = [];
    const resposta = conn.sendText("oi", (p) => pedacos.push(p), { canal: "texto" });
    const cmd = JSON.parse(WsFalso.todos[0].enviados.find(e => e.includes("command"))!);
    expect(cmd.id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    WsFalso.todos[0].pc({ type: "chunk", text: "Olá, ", id: cmd.id });
    WsFalso.todos[0].cair();
    expect(estados).toContain("reconectando");
    await vi.advanceTimersByTimeAsync(1100);
    const novo = WsFalso.todos[1];
    novo.abrir();
    expect(novo.enviados.some(e => e.includes("command"))).toBe(false);
    expect(JSON.parse(novo.enviados.find(e => e.includes("retomar"))!).id).toBe(cmd.id);
    novo.pc({ type: "retomada", id: cmd.id, text: "Olá, tudo " });
    novo.pc({ type: "chunk", text: "bem.", id: cmd.id });
    novo.pc({ type: "reply", reply: "Olá, tudo bem.", id: cmd.id });
    await expect(resposta).resolves.toMatchObject({ reply: "Olá, tudo bem." });
    expect(pedacos.at(-1)).toBe("Olá, tudo bem.");
    conn.close();
  });

  it("PC antigo (sem retomada): a queda vira erro claro, não fica pendurada", async () => {
    const conn = openVoiceConnection(pairing);
    WsFalso.todos[0].abrir();
    await conn.ready;
    const r = conn.sendText("oi");
    WsFalso.todos[0].cair();
    await vi.advanceTimersByTimeAsync(1100);
    WsFalso.todos[1].abrir();
    const verificacao = expect(r).rejects.toThrow(/Refazer/);
    await vi.advanceTimersByTimeAsync(10_500);
    await verificacao;
    conn.close();
  });

  it("o batimento refaz a conexão quando o PC some (só com PC que responde pong)", async () => {
    const conn = openVoiceConnection(pairing);
    WsFalso.todos[0].abrir();
    await conn.ready;
    WsFalso.todos[0].pc({ type: "pong" });
    expect(conn.viva()).toBe(true);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(WsFalso.todos.length).toBeGreaterThan(1);
    conn.close();
  });

  it("o Parar avisa o PC e encerra", async () => {
    const conn = openVoiceConnection(pairing);
    WsFalso.todos[0].abrir();
    await conn.ready;
    const r = conn.sendText("oi");
    conn.close();
    await expect(r).rejects.toThrow();
    expect(WsFalso.todos[0].enviados.some(e => e.includes("\"parar\""))).toBe(true);
  });

  it("puras", () => {
    expect(recuo(0)).toBe(1000);
    expect(recuo(3)).toBe(8000);
    expect(recuo(10)).toBe(15000);
    expect(novoIdDePedido()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe("arquivos do PC e atualização (21/10)", async () => {
  const { tipoDoArquivo, tamanhoLegivel } = await import("../src/lib/anexos");
  it("tipo pela extensão quando vem genérico", () => {
    expect(tipoDoArquivo("aula.mkv", "application/octet-stream")).toBe("video/x-matroska");
    expect(tipoDoArquivo("foto.HEIC", "")).toBe("image/heic");
    expect(tipoDoArquivo("x.pdf", "application/pdf")).toBe("application/pdf");
    expect(tamanhoLegivel(5 * 1024 * 1024)).toBe("5,0 MB");
    expect(tamanhoLegivel(2 * 1024 ** 3)).toBe("2,0 GB");
  });
});
