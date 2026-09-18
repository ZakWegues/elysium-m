import { describe, expect, it } from "vitest";
import { destinoDaUrl } from "../src/lib/deepLinks";
import { parseSharedUrl } from "../src/lib/shareIntent";
import { getPalette, resolverFamiliaEscolhida, TEMAS_APOSENTADOS } from "../src/theme/palettes";

describe("deep links dos widgets (bloco 73)", () => {
  it("reconhece os quatro destinos, com ou sem barra", () => {
    expect(destinoDaUrl("elysium://busca")).toBe("busca");
    expect(destinoDaUrl("elysium://chat/")).toBe("chat");
    expect(destinoDaUrl("elysium://pc")).toBe("pc");
    expect(destinoDaUrl("elysium://rotinas")).toBe("rotinas");
  });

  it("ignora o que não é destino (o compartilhamento é de outro hook)", () => {
    expect(destinoDaUrl("elysium://share?text=oi")).toBeNull();
    expect(destinoDaUrl("elysium://qualquer")).toBeNull();
    expect(destinoDaUrl("lixo")).toBeNull();
  });
});

describe("compartilhamento do Android", () => {
  it("extrai texto ou url de elysium://share", () => {
    expect(parseSharedUrl("elysium://share?text=ol%C3%A1%20mundo")).toBe("olá mundo");
    expect(parseSharedUrl("elysium://share?url=https%3A%2F%2Fx.com")).toBe("https://x.com");
    expect(parseSharedUrl("elysium://share?text=%20%20")).toBeNull();
    expect(parseSharedUrl("elysium://busca")).toBeNull();
  });
});

describe("temas", () => {
  it("a chave antiga do disco continua valendo (light=vidro, dark=noite)", () => {
    expect(resolverFamiliaEscolhida("light")).toBe("lg");
    expect(resolverFamiliaEscolhida("dark")).toBe("ely");
    expect(resolverFamiliaEscolhida("system")).toBe("auto");
    expect(resolverFamiliaEscolhida("qualquer")).toBeNull();
  });

  it("tema aposentado aponta para um tema vivo", () => {
    for (const alvo of Object.values(TEMAS_APOSENTADOS)) expect(getPalette(alvo, "lg").name).toBe(alvo);
  });

  it("a noite é quase sólida e o dia é vidro (bloco 70)", () => {
    const alfa = (rgba: string) => Number(rgba.match(/,\s*([\d.]+)\)$/)![1]);
    expect(alfa(getPalette("crepusculo", "ely").glassSurface)).toBeGreaterThanOrEqual(0.6);
    expect(alfa(getPalette("crepusculo", "lg").glassSurface)).toBeLessThanOrEqual(0.35);
  });
});
