import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("expo-file-system", () => ({ File: class {}, Directory: class {}, Paths: {}, FileMode: {} }));
vi.mock("expo-intent-launcher", () => ({ startActivityAsync: async () => ({}) }));
vi.mock("../src/lib/notificacoes", () => ({ receberEntrega: async () => {} }));
vi.mock("../src/lib/estadoPc", () => ({ receberFrameEstado: () => {} }));
vi.mock("../src/lib/modo", () => ({ receberFrameModo: () => {} }));
vi.mock("../src/lib/pomodoro", () => ({ receberFramePomodoro: () => {} }));

import type { StoredMessage } from "../src/lib/chatHistoryStore";
import { aplicarUi, lerUi, linkSeguro, mensagemDaTela, scriptParaTela, telaVisivel, temaDaPaleta, type FrameUi } from "../src/lib/telas";

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
const { openVoiceConnection } = await import("../src/lib/stream");
const pairing = { endpoints: ["192.168.0.5"], activeIp: "192.168.0.5", port: 4200, token: "x".repeat(40) };

const PROG = 'root = Card([Title("Parcela", "md")])';

describe("telas inteligentes no celular: protocolo (22/10)", () => {
  it("frame ui: gerando, programa, falhou; fora do formato = null", () => {
    expect(lerUi({ type: "ui", id: "pedido-0001", estado: "gerando" })).toEqual({ id: "pedido-0001", gerando: true });
    expect(lerUi({ type: "ui", id: "pedido-0001", programa: PROG, texto: "Pronto.", internet: false })).toEqual({ id: "pedido-0001", programa: PROG, texto: "Pronto.", internet: false });
    expect(lerUi({ type: "ui", id: "pedido-0001", falhou: true })).toEqual({ id: "pedido-0001", falhou: true });
    expect(lerUi({ type: "ui", id: "../x", programa: PROG })).toBeNull();
    expect(lerUi({ type: "ui", id: "pedido-0001", programa: "x".repeat(200_001) })).toBeNull();
    expect(lerUi({ type: "chunk", id: "pedido-0001" })).toBeNull();
  });

  it("o que a tela manda é validado (texto JSON da WebView ou objeto do iframe)", () => {
    expect(mensagemDaTela('{"tipo":"altura","px":420}')).toEqual({ tipo: "altura", px: 420 });
    expect(mensagemDaTela({ tipo: "altura", px: 999999 })).toBeNull();
    expect(mensagemDaTela({ tipo: "acao", acao: "rodarScript", valor: "x" })).toBeNull();
    expect(mensagemDaTela({ tipo: "acao", acao: "perguntar", valor: "e com 48 meses?" })).toEqual({ tipo: "acao", acao: "perguntar", valor: "e com 48 meses?" });
    expect(mensagemDaTela({ tipo: "pedido", id: 1, rota: "../api/rpc", params: {} })).toBeNull();
    expect(mensagemDaTela({ tipo: "pedido", id: 2, rota: "fotos", params: { q: "Pinacoteca" } })).toEqual({ tipo: "pedido", id: 2, rota: "fotos", params: { q: "Pinacoteca" } });
    expect(mensagemDaTela("não é json")).toBeNull();
  });

  it("links: só https, sem usuário e senha", () => {
    expect(linkSeguro("https://pt.wikipedia.org/wiki/Pinacoteca")).toBe("https://pt.wikipedia.org/wiki/Pinacoteca");
    for (const ruim of ["javascript:alert(1)", "file:///sdcard/x", "http://exemplo.com", "https://a:b@exemplo.com", "intent://x#Intent;end"]) expect(linkSeguro(ruim), ruim).toBeNull();
  });

  it("tema da paleta: escuro/claro pela luminância, destaque com texto que contrasta", () => {
    const escuro = temaDaPaleta({ background: "#0a0c14", surface: "#131726", text: "#EEF1F6", textMuted: "#9aa4b5", primary: "#d9b168" });
    expect(escuro.esquema).toBe("escuro");
    expect(escuro.vars["--iui-accent"]).toBe("#d9b168");
    expect(escuro.vars["--iui-on-accent"]).toBe("#111118");
    const claro = temaDaPaleta({ background: "#f8f3ec", surface: "#FFFFFF", text: "#14161A", textMuted: "#6b7280", primary: "#c2602c" });
    expect(claro.esquema).toBe("claro");
    expect(claro.vars["--iui-on-accent"]).toBe("#ffffff");
    // Valor que o protocolo recusaria vira a reserva.
    expect(temaDaPaleta({ background: "#000", surface: "url(x)", text: "#fff", textMuted: "#aaa", primary: "red;}" }).vars["--iui-accent"]).toBe("#8b7cf6");
  });

  it("injeção na WebView: JSON escapado (sem </script> nem separador de linha cru)", () => {
    const s = scriptParaTela({ tipo: "programa", texto: `</script><b>${String.fromCharCode(0x2028)}` });
    expect(s).not.toContain("</script>");
    expect(s).not.toContain(String.fromCharCode(0x2028));
    const json = s.slice(s.indexOf("__elyHost(") + 10, s.lastIndexOf(")"));
    expect(JSON.parse(json).texto).toBe(`</script><b>${String.fromCharCode(0x2028)}`);
  });

  it("o frame acha a bolha pelo id do pedido; falhou tira a tela; gerando esquecido some em 3 min", () => {
    const msgs: StoredMessage[] = [
      { id: "a", from: "reply", text: "Montando a tela…", ts: 0, pedidoId: "pedido-0001" },
      { id: "b", from: "me", text: "oi", ts: 1 },
    ];
    const f = (x: Omit<FrameUi, "id">): FrameUi => ({ id: "pedido-0001", ...x });
    let r = aplicarUi(msgs, f({ gerando: true }));
    expect(r[0].tela).toMatchObject({ gerando: true });
    r = aplicarUi(r, f({ programa: PROG, texto: "Pronto, aqui está a tela." }));
    expect(r[0]).toMatchObject({ text: "Pronto, aqui está a tela.", tela: { programa: PROG } });
    expect(aplicarUi(r, f({ falhou: true }))[0].tela).toBeUndefined();
    // Falhou com o pedido: fica a faixa "Tentar de novo"; cancelada: some.
    expect(aplicarUi(r, f({ falhou: true, pergunta: "p", resposta: "r" }))[0].tela).toEqual({ falhou: { pergunta: "p", resposta: "r" } });
    expect(aplicarUi(r, f({ falhou: true, cancelada: true, pergunta: "p", resposta: "r" }))[0].tela).toBeUndefined();
    expect(lerUi({ type: "ui", id: "pedido-0001", falhou: true, cancelada: true })).toEqual({ id: "pedido-0001", falhou: true, cancelada: true });
    expect(telaVisivel({ gerando: true, desde: 10 ** 12 }, 0, 10 ** 12 + 1000)).toBe(true);
    expect(aplicarUi(msgs, { id: "outro-pedido", programa: PROG })).toBe(msgs);
    expect(telaVisivel({ gerando: true }, 0, 60_000)).toBe(true);
    expect(telaVisivel({ gerando: true }, 0, 4 * 60_000)).toBe(false);
    expect(telaVisivel({ programa: PROG }, 0, 10 ** 12)).toBe(true);
  });

  it("o renderer em assets/ui é a cópia exata do ui-render/dist", () => {
    const origem = path.resolve(__dirname, "..", "..", "elysium", "ui-render", "dist", "render.html");
    const copia = path.resolve(__dirname, "..", "assets", "ui", "render.html");
    expect(fs.existsSync(copia)).toBe(true);
    if (fs.existsSync(origem)) expect(fs.readFileSync(copia).equals(fs.readFileSync(origem)), "rode node scripts/copiar-ui.mjs").toBe(true);
  });
});

describe("telas inteligentes no celular: stream (22/10)", () => {
  beforeEach(() => { WsFalso.todos = []; vi.useFakeTimers(); });

  it("avisa que desenha telas e recebe o frame ui depois do reply, com o id do pedido", async () => {
    const telas: FrameUi[] = [];
    const conn = openVoiceConnection(pairing, undefined, undefined, undefined, (f) => telas.push(f));
    WsFalso.todos[0].abrir();
    await conn.ready;
    const r = conn.sendText("faz uma calculadora de juros", undefined, { canal: "texto" });
    const cmd = JSON.parse(WsFalso.todos[0].enviados.find((e) => e.includes("command"))!);
    expect(cmd.telas).toBe(true);
    WsFalso.todos[0].pc({ type: "reply", reply: "Montando a tela…", id: cmd.id });
    await expect(r).resolves.toMatchObject({ reply: "Montando a tela…", id: cmd.id });
    WsFalso.todos[0].pc({ type: "ui", id: cmd.id, estado: "gerando" });
    WsFalso.todos[0].pc({ type: "ui", id: cmd.id, programa: PROG });
    expect(telas.map((t) => (t.programa ? "programa" : t.gerando ? "gerando" : "?"))).toEqual(["gerando", "programa"]);
    conn.close();
  });

  it("voz não pede tela", async () => {
    const conn = openVoiceConnection(pairing);
    WsFalso.todos[0].abrir();
    await conn.ready;
    void conn.sendText("oi", undefined, { canal: "voz" }).catch(() => {});
    expect(JSON.parse(WsFalso.todos[0].enviados.find((e) => e.includes("command"))!).telas).toBe(false);
    conn.close();
  });

  it("caiu enquanto gerava: ao voltar pede retomar e a tela chega; se o PC perdeu, a tela falha", async () => {
    const telas: FrameUi[] = [];
    const conn = openVoiceConnection(pairing, undefined, undefined, undefined, (f) => telas.push(f));
    WsFalso.todos[0].abrir();
    await conn.ready;
    const r = conn.sendText("monta uma tela disso", undefined, { canal: "texto" });
    const cmd = JSON.parse(WsFalso.todos[0].enviados.find((e) => e.includes("command"))!);
    WsFalso.todos[0].pc({ type: "reply", reply: "Montando a tela…", id: cmd.id });
    await r;
    WsFalso.todos[0].pc({ type: "ui", id: cmd.id, estado: "gerando" });
    WsFalso.todos[0].cair();
    await vi.advanceTimersByTimeAsync(1100);
    const novo = WsFalso.todos[1];
    novo.abrir();
    expect(JSON.parse(novo.enviados.find((e) => e.includes("retomar"))!).id).toBe(cmd.id);
    // O PC reenvia reply (ignorado: não há pedido aberto) e a tela.
    novo.pc({ type: "retomada", id: cmd.id, text: "" });
    novo.pc({ type: "reply", reply: "Montando a tela…", id: cmd.id });
    novo.pc({ type: "ui", id: cmd.id, programa: PROG });
    expect(telas.at(-1)?.programa).toBe(PROG);

    // Outra: o PC já esqueceu o pedido.
    const r2 = conn.sendText("faz um quiz", undefined, { canal: "texto" });
    const cmd2 = JSON.parse(novo.enviados.filter((e) => e.includes("command")).at(-1)!);
    novo.pc({ type: "reply", reply: "Montando a tela…", id: cmd2.id });
    await r2;
    novo.pc({ type: "ui", id: cmd2.id, estado: "gerando" });
    novo.cair();
    await vi.advanceTimersByTimeAsync(1100);
    WsFalso.todos[2].abrir();
    WsFalso.todos[2].pc({ type: "retomada_falhou", id: cmd2.id });
    expect(telas.at(-1)).toEqual({ id: cmd2.id, falhou: true });
    conn.close();
  });
});
