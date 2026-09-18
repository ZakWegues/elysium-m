/**
 * A pontuação da busca (lupa da Início) — a MESMA da paleta Ctrl+K do desktop.
 *
 * Saiu da `BuscaPanel.tsx` no bloco 77 para ser testável: é lógica pura, e é onde um
 * ajuste de "quatro letras espalhadas casam com um fato da memória" (bloco 58) quebra em
 * silêncio. Substring primeiro (começo < depois de espaço < no meio), subsequência
 * PERTO depois, `null` quando não casa. Menor é melhor.
 */

/** Tira acentos e caixa. */
export const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function pontuar(consulta: string, alvo: string): number | null {
  if (!consulta) return 0;
  const q = dobrar(consulta), t = dobrar(alvo);
  const direto = t.indexOf(q);
  if (direto >= 0) return direto === 0 ? 0 : (t[direto - 1] === ' ' ? 1 : 2) + direto * 0.01;
  let i = 0, primeiro = -1, ultimo = -1, buracos = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (primeiro < 0) primeiro = j;
      if (ultimo >= 0 && j !== ultimo + 1) buracos++;
      ultimo = j; i++;
    }
  }
  if (i < q.length) return null;
  // Subsequência só vale quando as letras estão PERTO: "lmbr" em "lembrete" sim, "calc"
  // espalhado por "principal projeto de isaac" não.
  if (ultimo - primeiro > q.length * 2 + 1) return null;
  return 5 + buracos * 2 + ultimo * 0.01;
}

/**
 * Ordena uma lista de itens pela consulta. `grupoOrdem` desempata: ação antes de
 * programa, programa antes de conversa. Devolve os itens (sem a pontuação).
 */
export function ordenarPorConsulta<T extends { texto: string; chaves?: string[]; grupo: string }>(
  itens: T[], consulta: string, grupoOrdem: string[],
): T[] {
  const achados: { it: T; p: number }[] = [];
  for (const it of itens) {
    let melhor: number | null = null;
    for (const c of [it.texto, ...(it.chaves ?? [])]) {
      const p = pontuar(consulta, c);
      if (p !== null && (melhor === null || p < melhor)) melhor = p;
    }
    if (melhor === null) continue;
    achados.push({ it, p: melhor + Math.max(0, grupoOrdem.indexOf(it.grupo)) * 0.001 });
  }
  achados.sort((a, b) => a.p - b.p);
  return achados.map(a => a.it);
}
