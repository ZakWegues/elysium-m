/**
 * Achar "Elysium" no que o reconhecedor do Android escreveu (bloco 129). Pura, para teste.
 *
 * O reconhecedor é de ditado em português: ele não conhece a palavra e escreve o som mais
 * parecido — "elísio", "elisium", "ilísio", "elysio", às vezes "e lísio" separado. O
 * `contextualStrings` puxa para "Elysium" no Android 13+, mas não garante. Então a busca é
 * pelo som, sem acento, e o que vier DEPOIS dela é o pedido ("Elysium, pausa a música").
 *
 * Fica de fora de propósito o "Eliseu": é nome de gente, e dizer o nome de alguém perto
 * do celular não pode abrir a mão livre.
 */
// Junto ("elisio", "ilisium", "elizium") ou separado só com o "i" antes do fim ("e lisio")
// — sem esse "i" obrigatório, "é liso" dispararia.
const VARIACOES = /(?:^|\s)(?:(?:ei|ok|oi|fala)\s)?(?:[eia]l[iy][sz][iy]?[uo]m?|e l[iy][sz][iy][uo]m?)(?=\s|$)/;

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function acharPalavra(texto: string): { achou: boolean; resto: string } {
  const t = semAcento(texto).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const m = VARIACOES.exec(t);
  if (!m) return { achou: false, resto: '' };
  // O resto vem do texto ORIGINAL (com acento), na mesma posição em palavras: contar as
  // palavras até o fim do casamento e cortar ali.
  const palavrasAte = t.slice(0, m.index + m[0].length).trim().split(' ').length;
  const original = texto.replace(/[,.!?;:]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  return { achou: true, resto: original.slice(palavrasAte).join(' ').trim() };
}
