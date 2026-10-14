import { describe, expect, it, vi } from "vitest";
vi.mock("react-native-reanimated", () => ({ makeMutable: (v: number) => ({ value: v }) }));
import { envelopeDoTrecho, estadoDaBolota, palavrasDoTrecho } from "../src/lib/bolota";

describe("esfera do celular (fase 21)", () => {
  it("ouvir e pensar ganham da fala", () => {
    expect(estadoDaBolota(null, false)).toBe("dormindo");
    expect(estadoDaBolota(null, true)).toBe("falando");
    expect(estadoDaBolota("ouvindo", true)).toBe("ouvindo");
    expect(estadoDaBolota("pensando", false)).toBe("pensando");
  });
  it("pulso pelo texto: um morro por palavra, quase zero entre elas", () => {
    const { palavras, durMs } = palavrasDoTrecho("Pronto, chefe. Volume em quarenta.");
    expect(palavras).toHaveLength(5);
    expect(durMs).toBeGreaterThan(1500);
    const env = envelopeDoTrecho(palavras, durMs, 50);
    expect(Math.max(...env)).toBeGreaterThan(0.6);
    expect(env.some(v => v < 0.1)).toBe(true);
    expect(env.every(v => v >= 0 && v <= 1)).toBe(true);
  });
});

describe("esfera do celular — toques (fase 22)", () => {
  it("pulso de tecla sobe até 0,35 e acende a onda", async () => {
    const b = await import("../src/lib/bolota");
    b.impulsoDaBolota.value = 0;
    for (let i = 0; i < 10; i++) b.pulsoDaBolota();
    expect(b.impulsoDaBolota.value).toBeCloseTo(0.35);
    expect(b.ondaTeclaDaBolota.value).toBe(1);
  });
  it("enviar dá um chute na inclinação", async () => {
    const b = await import("../src/lib/bolota");
    b.chuteDaBolota.value = 0;
    b.inclinarBolota();
    expect(b.chuteDaBolota.value).toBeCloseTo(0.07);
  });
});
