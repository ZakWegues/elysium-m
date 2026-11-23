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

// ── guardar e soltar (23/11) ────────────────────────────────────────────────────────────
export type EstadoDaBolota = 'solta' | 'guardada' | 'desligada';

/** O que estava guardado no aparelho, conferido; lixo ou nada = solta, no lugar padrão. Pura. */
export function lerEstadoDaBolota(v: string | null): { estado: EstadoDaBolota; pos: { x: number; y: number } | null } {
  try {
    const j = JSON.parse(v ?? '') as { estado?: unknown; pos?: { x?: unknown; y?: unknown } | null };
    const estado = (['solta', 'guardada', 'desligada'] as const).find((e) => e === j.estado) ?? 'solta';
    const x = Number(j.pos?.x), y = Number(j.pos?.y);
    return { estado, pos: j.pos && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null };
  } catch { return { estado: 'solta', pos: null }; }
}

/** O centro da bolota está no canto de guardar (com uma folga, para não precisar de mira)? Pura. */
export function dentroDoCanto(centro: { x: number; y: number }, canto: { x: number; y: number; lado: number }, folga = 26): boolean {
  return centro.x >= canto.x - folga && centro.x <= canto.x + canto.lado + folga
    && centro.y >= canto.y - folga && centro.y <= canto.y + canto.lado + folga;
}

/** Mantém a bolota dentro da tela (girou o aparelho, a posição guardada era de outra tela). Pura. */
export function dentroDaTela(p: { x: number; y: number }, largura: number, altura: number, tam: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(Math.max(8, largura - tam - 8), p.x)),
    y: Math.max(60, Math.min(Math.max(60, altura - tam - 110), p.y)),
  };
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
