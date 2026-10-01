import { describe, expect, it } from "vitest";
import { cofreCom, cofreSem, idDoPc, MAX_PCS, pcAtivoDo, type Pairing } from "../src/lib/pairing";
import { chavePorPc, definirPcAtivo } from "../src/lib/pcAtivo";

const pc = (hostname: string, ip = "192.168.0.2", token = "t"): Pairing => ({ endpoints: [ip], activeIp: ip, port: 4200, token, hostname });

describe("vários PCs (bloco 121)", () => {
  it("o primeiro vira principal; parear outro acrescenta e ativa", () => {
    let c = cofreCom(null, pc("DESKTOP-A"));
    expect(c).toMatchObject({ ativo: "desktop-a", principal: "desktop-a" });
    c = cofreCom(c, pc("NOTEBOOK-B", "192.168.0.3"));
    expect(c.pcs).toHaveLength(2);
    expect(pcAtivoDo(c).hostname).toBe("NOTEBOOK-B");
    expect(c.principal).toBe("desktop-a");
  });

  it("o mesmo PC com token novo (QR regenerado) substitui, não duplica", () => {
    let c = cofreCom(null, pc("DESKTOP-A", "192.168.0.2", "velho"));
    c = cofreCom(c, pc("DESKTOP-A", "192.168.0.9", "novo"));
    expect(c.pcs).toHaveLength(1);
    expect(c.pcs[0].token).toBe("novo");
  });

  it("esquecer o ativo passa para o próximo; esquecer o último não deixa nada", () => {
    let c = cofreCom(cofreCom(null, pc("A")), pc("B"));
    const sem = cofreSem(c, "b")!;
    expect(sem.ativo).toBe("a");
    expect(cofreSem(cofreCom(null, pc("A")), "a")).toBeNull();
    // Esquecer o principal: o próximo herda as chaves sem sufixo.
    c = cofreCom(cofreCom(null, pc("A")), pc("B"));
    expect(cofreSem(c, "a")!.principal).toBe("b");
  });

  it(`teto de ${MAX_PCS} PCs`, () => {
    let c = cofreCom(null, pc("P0"));
    for (let i = 1; i <= 7; i++) c = cofreCom(c, pc(`P${i}`));
    expect(c.pcs).toHaveLength(MAX_PCS);
  });

  it("chave por PC: o principal usa a de sempre, os outros ganham sufixo", () => {
    definirPcAtivo(idDoPc(pc("DESKTOP-A")), true);
    expect(chavePorPc("elysium_chat_sessions")).toBe("elysium_chat_sessions");
    definirPcAtivo(idDoPc(pc("NOTEBOOK B")), false);
    expect(chavePorPc("elysium_chat_sessions")).toBe("elysium_chat_sessions__notebook_b");
    definirPcAtivo("", true);
  });
});
