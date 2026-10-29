import { describe, expect, it, vi } from "vitest";
vi.mock("expo-share-intent", () => ({ useShareIntent: () => ({}) }));
vi.mock("expo-file-system", () => ({ File: class {}, Paths: {} }));
// 22/10: o shareIntent agora puxa o pareamento e os anexos (envio grande para o PC).
vi.mock("expo-secure-store", () => ({}));
vi.mock("expo-intent-launcher", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
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

describe("temas (design de 29/10)", () => {
  it("famílias que saíram caem no Dark; dark, glass e stark continuam", () => {
    for (const velho of ["light", "lg", "ely", "renascenca", "minimal", "auto", "system"]) expect(resolverFamiliaEscolhida(velho)).toBe("dark");
    expect(resolverFamiliaEscolhida("dark")).toBe("dark");
    expect(resolverFamiliaEscolhida("glass")).toBe("glass");
    expect(resolverFamiliaEscolhida("stark")).toBe("stark");
    expect(resolverFamiliaEscolhida("qualquer")).toBeNull();
  });

  it("tema aposentado aponta para um tema vivo", () => {
    for (const alvo of Object.values(TEMAS_APOSENTADOS)) expect(getPalette(alvo, "stark").name).toBe(alvo);
  });

  it("Dark é o preto OLED do dark.css e Glass a cena do glass.css", () => {
    const d = getPalette("mare", "dark");
    expect(d.background).toBe("#000000");
    expect(d.primary).toBe("#9fb0ff");
    expect(d.fontes?.texto[500]).toBe("Manrope_500Medium");
    const g = getPalette("mare", "glass");
    expect(g.background).toBe("#05041a");
    expect(g.fontes?.titulo[700]).toBe("Outfit_700Bold");
    // As duas usadas com comAlfa precisam ser hex.
    for (const p of [d, g]) for (const c of [p.surface, p.primary]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('família Stark (fase 16)', async () => {
  const { getPalette } = await import('../src/theme/palettes');
  it('Reator é o azul do reator, escuro, com rótulo próprio', () => {
    const p = getPalette('mare', 'stark');
    expect(p.primary).toBe('#3cc8f0');
    expect(p.rotulo).toBe('Stark — Reator');
    expect(p.blurTint).toBe('dark');
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
    expect(getPalette("elisio", "glass").blobs).toEqual(["#705cff", "#19d3c5", "#ff4fa3"]);
  });
});
