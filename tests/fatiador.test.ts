import { describe, expect, it } from "vitest";
import { criarFatiador, restoParaFalar } from "../src/lib/fatiadorDeFrases";

/** Passa o texto em pedaços de `n` caracteres, como o streaming faz. */
function fatiar(texto: string, n = 7, minimos?: [number, number]) {
  const f = minimos ? criarFatiador(...minimos) : criarFatiador();
  const saidas: string[] = [];
  for (let i = 0; i < texto.length; i += n) saidas.push(...f.push(texto.slice(i, i + n)));
  return { saidas, resto: f.fim() };
}

describe("fatiador de frases (bloco 189)", () => {
  it("solta a primeira frase cedo e junta as seguintes", () => {
    const texto = "Santos Dumont foi um inventor brasileiro. Ele voou com o 14-Bis em 1906, em Paris. Também criou o Demoiselle. É considerado o pai da aviação no Brasil.";
    const { saidas, resto } = fatiar(texto);
    expect(saidas[0]).toBe("Santos Dumont foi um inventor brasileiro.");
    // Nada se perde nem se repete.
    expect([...saidas, resto].join(" ")).toBe(texto);
    expect(saidas.length).toBeGreaterThanOrEqual(1);
    expect(resto.endsWith("pai da aviação no Brasil.")).toBe(true);
  });

  it("número, abreviação e decimal não fecham frase", () => {
    const { saidas, resto } = fatiar("O Dr. Silva disse que custa R$ 3.500 hoje, etc. e tal. Depois eu vejo isso com calma, prometo.", 5, [10, 10]);
    expect(saidas[0]).toBe("O Dr. Silva disse que custa R$ 3.500 hoje, etc. e tal.");
    expect(resto).toBe("Depois eu vejo isso com calma, prometo.");
  });

  it("frase sem pontuação final fica para o fim", () => {
    const { saidas, resto } = fatiar("Pronto, volume em quarenta");
    expect(saidas).toEqual([]);
    expect(resto).toBe("Pronto, volume em quarenta");
  });

  it("exclamação, interrogação e reticências fecham", () => {
    const { saidas } = fatiar("Que pergunta boa, hein?! Olha só… A resposta curta é sim. E tem mais coisa aqui.", 4, [5, 5]);
    expect(saidas).toEqual(["Que pergunta boa, hein?!", "Olha só…", "A resposta curta é sim."]);
  });

  it("restoParaFalar tira o que já foi dito; se não achar, fala tudo", () => {
    expect(restoParaFalar("Primeira frase. Segunda frase.", " Primeira frase.")).toBe("Segunda frase.");
    expect(restoParaFalar("Abrindo o Chrome. Primeira frase. Fim.", "Primeira frase.")).toBe("Abrindo o Chrome. Fim.");
    expect(restoParaFalar("Outra coisa.", "Primeira frase.")).toBe("Outra coisa.");
    expect(restoParaFalar("Tudo.", "")).toBe("Tudo.");
    expect(restoParaFalar("Só isso.", "Só isso.")).toBe("");
  });
});
