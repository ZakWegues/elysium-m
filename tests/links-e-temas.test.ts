import { describe, expect, it, vi } from "vitest";
vi.mock("expo-share-intent", () => ({ useShareIntent: () => ({}) }));
vi.mock("expo-file-system", () => ({ File: class {}, Paths: {} }));
import { destinoDaUrl } from "../src/lib/deepLinks";
import { lerCompartilhado, parseSharedUrl } from "../src/lib/shareIntent";
import { getPalette, resolverFamiliaEscolhida, TEMAS_APOSENTADOS } from "../src/theme/palettes";

describe("deep links dos widgets (bloco 73)", () => {
  it("reconhece os cinco destinos, com ou sem barra", () => {
    expect(destinoDaUrl("elysium://busca")).toBe("busca");
    expect(destinoDaUrl("elysium://chat/")).toBe("chat");
    expect(destinoDaUrl("elysium://pc")).toBe("pc");
    expect(destinoDaUrl("elysium://rotinas")).toBe("rotinas");
    // Bloco 90: o widget de Clima abre a Início.
    expect(destinoDaUrl("elysium://inicio")).toBe("inicio");
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

describe('família Stark (fase 16)', async () => {
  const { getPalette, familiaEscura, resolverFamiliaEscolhida } = await import('../src/theme/palettes');
  it('Reator é o azul do reator, escuro, com rótulo próprio', () => {
    const p = getPalette('mare', 'stark');
    expect(p.primary).toBe('#3cc8f0');
    expect(p.rotulo).toBe('Stark — Reator');
    expect(p.blurTint).toBe('dark');
    expect(familiaEscura('stark')).toBe(true);
    expect(familiaEscura('lg')).toBe(false);
    expect(resolverFamiliaEscolhida('stark')).toBe('stark');
  });
});

describe("compartilhar do Android (fase 23)", () => {
  it("texto ou link", () => {
    expect(lerCompartilhado({ text: " https://youtu.be/x " })).toEqual({ texto: "https://youtu.be/x", arquivo: null });
    expect(lerCompartilhado({ text: null, webUrl: "https://a.com" })?.texto).toBe("https://a.com");
  });
  it("imagem", () => {
    expect(lerCompartilhado({ files: [{ path: "file:///x.jpg", fileName: "x.jpg", mimeType: "image/jpeg", size: 10 }] })?.arquivo).toEqual({ uri: "file:///x.jpg", nome: "x.jpg", mimeType: "image/jpeg", bytes: 10 });
  });
  it("nada", () => { expect(lerCompartilhado({ text: "  " })).toBeNull(); });
});

describe("fundo igual ao do PC (fase 23.1)", () => {
  it("as manchas usam as cores `blobs` do THEMES do desktop", () => {
    expect(getPalette("mare", "stark").blobs).toEqual(["#0f3a52", "#123047", "#3a2a12"]);
    expect(getPalette("elisio", "ely").blobs).toEqual(["#8a6a2e", "#2f5d57", "#4a3f6b"]);
    expect(getPalette("crepusculo", "lg").blobs).toEqual(["#cbb9ff", "#b8ecf3", "#ded7ff"]);
    expect(getPalette("elisio", "renascenca").blobs).toEqual(["#5a3a14", "#5a1c22", "#3a2814"]);
  });
});
