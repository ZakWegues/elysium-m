import { describe, expect, it } from "vitest";
import {
  abrirFolha, acoesPara, aoMudarFolha, fecharFolha, folhaAtual, idDoYoutube, linkDoTexto, primeirasLinhas, resumoDoLink, tipoDaPrevia,
} from "../src/lib/folhaCompartilhar";

const arq = (mimeType: string, bytes: number) => ({ texto: null, arquivo: { uri: "file:///x", nome: "x", mimeType, bytes } });

describe("folha de compartilhar (22/10)", () => {
  it("acha o id do YouTube nos formatos comuns", () => {
    expect(idDoYoutube("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(idDoYoutube("Olha isso https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe("dQw4w9WgXcQ");
    expect(idDoYoutube("https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(idDoYoutube("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(idDoYoutube("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(idDoYoutube("https://youtube.com/@canal")).toBeNull();
    expect(idDoYoutube("https://evil.com/youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(idDoYoutube("https://youtu.be/curto")).toBeNull();
    expect(idDoYoutube(null)).toBeNull();
  });

  it("tipo da prévia", () => {
    expect(tipoDaPrevia({ texto: "https://youtu.be/dQw4w9WgXcQ", arquivo: null })).toBe("youtube");
    expect(tipoDaPrevia({ texto: "https://g1.globo.com/x", arquivo: null })).toBe("link");
    expect(tipoDaPrevia({ texto: "leia https://g1.globo.com/x depois", arquivo: null })).toBe("texto");
    expect(tipoDaPrevia({ texto: "um recado", arquivo: null })).toBe("texto");
    expect(tipoDaPrevia(arq("image/jpeg", 10))).toBe("imagem");
    expect(tipoDaPrevia(arq("application/pdf", 10))).toBe("arquivo");
  });

  it("resumo do link e primeiras linhas", () => {
    expect(resumoDoLink("https://www.exemplo.com.br/noticia/123/")).toEqual({ dominio: "exemplo.com.br", caminho: "/noticia/123" });
    expect(resumoDoLink("https://a.com/" + "x".repeat(80)).caminho.length).toBe(48);
    expect(linkDoTexto("veja (https://a.com/b).")).toBe("https://a.com/b");
    expect(primeirasLinhas("a\n\nb\nc\nd\ne")).toBe("a\nb\nc\nd");
  });

  it("ações por tipo: imagem só vai para a Ely até 5 MB; arquivo só para o PC", () => {
    expect(acoesPara({ texto: "oi", arquivo: null }).acoes).toEqual(["ely", "pc"]);
    expect(acoesPara(arq("image/png", 1024)).acoes).toEqual(["ely", "pc"]);
    const grande = acoesPara(arq("image/png", 6 * 1024 * 1024));
    expect(grande.acoes).toEqual(["pc"]);
    expect(grande.aviso).toMatch(/5 MB/);
    expect(acoesPara(arq("video/mp4", 300 * 1024 * 1024)).acoes).toEqual(["pc"]);
  });

  it("elysium://share continua exigindo confirmação: só PC, com aviso", () => {
    const r = acoesPara({ texto: "https://site.com", arquivo: null }, "confirmar");
    expect(r.acoes).toEqual(["pc"]);
    expect(r.aviso).toMatch(/confirme/);
  });

  it("o store abre e fecha avisando quem ouve", () => {
    const vistos: (string | null)[] = [];
    const sair = aoMudarFolha((p) => vistos.push(p ? p.modo : null));
    abrirFolha({ item: { texto: "x", arquivo: null }, modo: "confirmar", aoEscolher: async () => ({ ok: true }) });
    expect(folhaAtual()?.modo).toBe("confirmar");
    fecharFolha();
    sair();
    abrirFolha({ item: { texto: "y", arquivo: null }, modo: "normal", aoEscolher: async () => ({ ok: true }) });
    expect(vistos).toEqual(["confirmar", null]);
    fecharFolha();
  });
});
