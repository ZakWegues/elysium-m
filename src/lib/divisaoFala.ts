/**
 * Como a fala longa é cortada (08/10). Pura — testada em tests/divisaoFala.test.ts.
 *
 * O resumo do Hoje passa fácil de 2.000 caracteres, e o `/api/tts` do PC corta aí: o fim da
 * fala simplesmente sumia. Agora o texto vai em PARTES, sempre na fronteira de uma frase, e a
 * próxima é baixada enquanto a atual toca. As partes também são o que torna a pausa barata:
 * pausar a voz do PC é pausar o player; retomar continua de onde parou.
 *
 * A voz do aparelho (`expo-speech`) não pausa no Android — lá a unidade é a FRASE: pausar é
 * calar e guardar em qual frase estava; retomar recomeça aquela frase.
 */

/** Frases do texto: quebra depois de . ! ? … e em linhas novas. Nunca devolve frase vazia. */
export function frasesDe(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?…])\s+/)
    .map(f => f.trim())
    .filter(Boolean);
}

/**
 * Partes de até `max` caracteres, juntando frases inteiras. Uma frase sozinha maior que o teto
 * (texto sem pontuação) é cortada no último espaço antes dele — melhor uma pausa no meio da
 * frase que a fala cortada.
 */
export function partesDaFala(texto: string, max = 1400): string[] {
  const partes: string[] = [];
  let atual = '';
  const fechar = () => { if (atual) partes.push(atual); atual = ''; };
  for (let frase of frasesDe(texto)) {
    while (frase.length > max) {
      fechar();
      const corte = frase.lastIndexOf(' ', max);
      const ate = corte > max / 2 ? corte : max;
      partes.push(frase.slice(0, ate).trim());
      frase = frase.slice(ate).trim();
    }
    if (!frase) continue;
    if (atual && atual.length + 1 + frase.length > max) fechar();
    atual = atual ? `${atual} ${frase}` : frase;
  }
  fechar();
  return partes;
}

/** O pedaço que a pílula e a notificação mostram: começo do trecho, sem markdown. */
export function trechoParaMostrar(texto: string, max = 110): string {
  const limpo = texto.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}
