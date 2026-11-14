/**
 * A lógica pura da bolota do celular (14/11) — testável sem React.
 */

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * "Circula o YouTube no PC", "aponta o botão salvar no computador", "onde está o Gmail no PC":
 * pedido para a bolota do PC marcar na tela dele. Precisa dizer PC/computador (no celular não há
 * o que marcar). Pura.
 */
export function ehMarcaNoPc(texto: string): boolean {
  const t = norm(texto);
  if (!/\b(no|do|na tela do) (pc|computador|notebook)\b/.test(t)) return false;
  return /\b(circula|circule|aponta|aponte|sublinha|sublinhe|destaca|destaque|realca|marca|marque|mostra onde|onde (esta|fica)|cade)\b/.test(t);
}

/** A resposta para o balão: sem cercas de código nem títulos de Markdown. Pura. */
export function limparResposta(t: string): string {
  return String(t ?? '')
    .replace(/^\s*```\w*\s*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
