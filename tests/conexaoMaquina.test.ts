import { describe, expect, it } from "vitest";
import { aplicar, CARENCIA_MS, memoriaInicial, proximaSonda, statusLegado, type MemoriaConexao } from "../src/lib/conexao/maquina";

const t0 = 1_000_000;
const seq = (m: MemoriaConexao, eventos: [Parameters<typeof aplicar>[1], number][]) => eventos.reduce((a, [e, t]) => aplicar(a, e, t), m);

describe("máquina da conexão (26/10)", () => {
  it("falha dentro da carência é só 'reconectando' — nenhum erro visível", () => {
    const m = seq(memoriaInicial(t0), [[{ tipo: "falhou" }, t0 + 1000], [{ tipo: "falhou" }, t0 + 3000], [{ tipo: "falhou" }, t0 + 6000]]);
    expect(m.estado).toBe("reconectando");
    expect(statusLegado(m.estado)).toBe("checking");
  });

  it("offline só com 3 falhas E a carência vencida", () => {
    let m = seq(memoriaInicial(t0), [[{ tipo: "falhou" }, t0 + CARENCIA_MS + 1]]);
    expect(m.estado).toBe("procurando");
    m = seq(m, [[{ tipo: "falhou" }, t0 + CARENCIA_MS + 2000], [{ tipo: "falhou" }, t0 + CARENCIA_MS + 4000]]);
    expect(m.estado).toBe("offline");
  });

  it("voltar do fundo com o PC visto há pouco nem mostra a aura", () => {
    let m = seq(memoriaInicial(t0), [[{ tipo: "ok" }, t0 + 500]]);
    m = aplicar(m, { tipo: "acordou" }, t0 + 20_000);
    expect(m.estado).toBe("conectado");
    m = aplicar(m, { tipo: "falhou" }, t0 + 21_000); // 1ª sonda com o rádio acordando
    expect(m.estado).toBe("conectado");
  });

  it("um frame de WebSocket vale como sonda boa", () => {
    const m = seq(memoriaInicial(t0), [[{ tipo: "falhou" }, t0 + CARENCIA_MS + 1], [{ tipo: "vivo" }, t0 + CARENCIA_MS + 10]]);
    expect(m.estado).toBe("conectado");
    expect(m.falhas).toBe(0);
  });

  it("401 = token recusado e não sai com frame atrasado; 429 = pausa de 10 min sem sondar", () => {
    let m = aplicar(memoriaInicial(t0), { tipo: "token" }, t0);
    expect(aplicar(m, { tipo: "vivo" }, t0 + 1).estado).toBe("token");
    expect(proximaSonda(m, t0)).toBe(Infinity);
    m = aplicar(memoriaInicial(t0), { tipo: "bloqueado" }, t0);
    expect(m.estado).toBe("bloqueado");
    expect(proximaSonda(m, t0)).toBe(10 * 60_000);
    expect(aplicar(m, { tipo: "acordou" }, t0 + 1000).estado).toBe("bloqueado");
  });

  it("o PC avisou que fechou: offline na hora, mesmo na carência", () => {
    expect(aplicar(memoriaInicial(t0), { tipo: "pcFechou" }, t0 + 10).estado).toBe("offline");
  });
});
