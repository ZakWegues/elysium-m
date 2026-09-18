import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O que importa em notificações é o que NÃO pode acontecer: mostrar duas vezes a mesma
 * entrega, tocar um lembrete duas vezes (fila + espelho), e deixar a fila crescer sem
 * confirmar. `expo-notifications` e o RPC são dublês; o AsyncStorage é o de tests/setup.ts.
 */
const agendadas: Record<string, unknown>[] = [];
const canceladas: string[] = [];
vi.mock("expo-notifications", () => ({
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: async (n: Record<string, unknown>) => { agendadas.push(n); return "id"; },
  cancelScheduledNotificationAsync: async (id: string) => { canceladas.push(id); },
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const rpc = vi.fn();
vi.mock("../src/lib/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("../src/lib/pairing", () => ({ loadPairing: async () => ({ endpoints: ["1.1.1.1"], activeIp: "1.1.1.1", port: 4200, token: "t" }) }));

const pairing = { endpoints: ["1.1.1.1"], activeIp: "1.1.1.1", port: 4200, token: "t" } as never;

beforeEach(async () => {
  agendadas.length = 0; canceladas.length = 0; rpc.mockReset();
  (globalThis as unknown as { __asyncStorage: Map<string, string> }).__asyncStorage.clear();
});

async function carregar() { vi.resetModules(); return await import("../src/lib/notificacoes"); }

describe("fila do PC", () => {
  it("mostra cada entrega uma vez, confirma tudo, e ignora as já vistas depois", async () => {
    const n = await carregar();
    rpc.mockImplementation(async (_p: unknown, m: string) => {
      if (m === "notify.pending") return { entregas: [{ id: "a", tipo: "rotina", titulo: "Bom dia", corpo: "22°", em: 1 }, { id: "b", tipo: "aviso", titulo: "x", corpo: "y", em: 2 }] };
      if (m === "notify.ack") return { acked: 2 };
      throw new Error(m);
    });
    expect(await n.buscarEntregas(pairing)).toBe(2);
    expect(agendadas).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith(pairing, "notify.ack", { ids: ["a", "b"] }, expect.anything());
    // Segunda passada com a mesma fila (o ack falhou do lado de lá): nada novo.
    expect(await n.buscarEntregas(pairing)).toBe(0);
    expect(agendadas).toHaveLength(2);
  });

  it("lembrete já espelhado no aparelho é confirmado sem ser mostrado", async () => {
    const n = await carregar();
    rpc.mockImplementation(async (_p: unknown, m: string) => {
      if (m === "reminders.list") return { reminders: [{ id: "L1", text: "remédio", dueAt: Date.now() + 3_600_000, kind: "once", createdAt: 0 }] };
      if (m === "notify.pending") return { entregas: [{ id: "e1", tipo: "lembrete", titulo: "Lembrete", corpo: "remédio", em: 1, ref: "L1" }] };
      return { acked: 1 };
    });
    await n.espelharLembretes(pairing);
    expect(agendadas).toHaveLength(1);             // o espelho, com hora
    expect(agendadas[0]).toMatchObject({ identifier: "lembrete-L1" });
    expect(await n.buscarEntregas(pairing)).toBe(0); // a entrega não vira segunda notificação
    expect(rpc).toHaveBeenCalledWith(pairing, "notify.ack", { ids: ["e1"] }, expect.anything());
  });

  it("interruptor desligado: não busca, não mostra", async () => {
    const n = await carregar();
    await n.definirNotificacoesAtivas(false);
    expect(await n.buscarEntregas(pairing)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("lembretes espelhados", () => {
  it("cancela os que sumiram e não agenda os que já passaram", async () => {
    const n = await carregar();
    const futuro = Date.now() + 3_600_000;
    rpc.mockResolvedValueOnce({ reminders: [{ id: "A", text: "a", dueAt: futuro, kind: "once" }, { id: "B", text: "b", dueAt: futuro, kind: "once" }] });
    await n.espelharLembretes(pairing);
    expect(agendadas.map(a => a.identifier)).toEqual(["lembrete-A", "lembrete-B"]);

    rpc.mockResolvedValueOnce({ reminders: [{ id: "A", text: "a", dueAt: futuro, kind: "once" }, { id: "C", text: "c", dueAt: Date.now() - 1000, kind: "once" }] });
    await n.espelharLembretes(pairing);
    expect(canceladas).toEqual(["lembrete-B"]);
    expect(agendadas.map(a => a.identifier)).toEqual(["lembrete-A", "lembrete-B"]);   // C passou, A já estava
  });
});
