/**
 * Cópia do `elysium/src/services/fatiadorDeFrases.ts` (os dois repos não compartilham código).
 *
 * Frases inteiras saindo de um texto que chega aos pedaços (fase 19, bloco 189). Puro.
 *
 * A voz esperava a resposta INTEIRA do modelo antes de abrir a boca (§19, bloco 21): numa
 * explicação de 4 frases, eram segundos de silêncio com a resposta já pela metade na tela.
 * Os assistentes de voz que parecem gente começam a falar na primeira frase pronta. Este
 * fatiador recebe os pedaços do streaming e solta cada frase assim que ela fecha — "fecha"
 * quer dizer pontuação final SEGUIDA de espaço, porque "3." pode ser "3.5" e "Sr." não é fim.
 *
 * A primeira frase sai cedo (mínimo curto: o que importa é quebrar o silêncio); as seguintes
 * se juntam até um tamanho maior, para não picotar a fala em sínteses de três palavras.
 */

/** Abreviações que terminam em ponto e não fecham frase (em minúsculas, com e sem acento). */
const ABREVIACOES = new Set(["sr", "sra", "srta", "dr", "dra", "prof", "profa", "etc", "ex", "p.ex", "obs", "av", "nº", "vs", "aprox", "tel", "pág", "pag", "cap", "qtd"]);

export interface Fatiador {
  /** Junta o pedaço novo e devolve as frases que fecharam (pode ser nenhuma). */
  push(pedaco: string): string[];
  /** O que sobrou sem fechar, no fim do streaming. Esvazia o fatiador. */
  fim(): string;
}

export function criarFatiador(minimoPrimeira = 40, minimoDemais = 80): Fatiador {
  let buffer = "";
  let pendente = "";
  let soltas = 0;

  /** Índice logo depois do primeiro fim de frase "de verdade" no buffer, ou -1. */
  function proximoFim(): number {
    const re = /[.!?…]+["')\]]?\s/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(buffer))) {
      const antes = buffer.slice(0, m.index);
      const palavra = (/(\S+)$/.exec(antes)?.[1] ?? "").toLowerCase();
      // "Sr." e "etc." no meio; "3." de uma lista ou de "3.500" quebrado no pedaço.
      if (m[0][0] === "." && (ABREVIACOES.has(palavra) || /^\d+$/.test(palavra))) continue;
      return m.index + m[0].length;
    }
    return -1;
  }

  return {
    push(pedaco: string): string[] {
      buffer += pedaco;
      const saida: string[] = [];
      for (;;) {
        const fim = proximoFim();
        if (fim < 0) break;
        const frase = buffer.slice(0, fim).trim();
        buffer = buffer.slice(fim);
        pendente = pendente ? `${pendente} ${frase}` : frase;
        const minimo = soltas === 0 ? minimoPrimeira : minimoDemais;
        if (pendente.length >= minimo) { saida.push(pendente); pendente = ""; soltas++; }
      }
      return saida;
    },
    fim(): string {
      const resto = [pendente, buffer.trim()].filter(Boolean).join(" ").trim();
      buffer = ""; pendente = "";
      return resto;
    },
  };
}

/**
 * O que ainda falta falar depois que parte da resposta já saiu pela voz. Normalmente é o fim
 * da resposta — mas a resposta final pode ter mais coisa que o streaming (a confirmação de
 * uma ação do roteador clássico vem junto da conversa, sem passar pelos pedaços). Regra:
 * tira da resposta o que já foi dito e fala o resto; se não achar o trecho dito (resposta
 * diferente do que veio aos pedaços), fala a resposta inteira — repetir é melhor que calar.
 */
export function restoParaFalar(resposta: string, jaFalado: string): string {
  const n = (x: string) => x.replace(/\s+/g, " ").trim();
  const r = n(resposta), f = n(jaFalado);
  if (!f) return r;
  const i = r.indexOf(f);
  if (i < 0) return r;
  return n(`${r.slice(0, i)} ${r.slice(i + f.length)}`);
}
