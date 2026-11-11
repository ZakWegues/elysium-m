/**
 * 30/10: o fundo do app pode ser o animado do tema, um papel de parede colorido ou uma imagem
 * da galeria (pedido do dono). Os papéis são várias manchas de cor fortes se sobrepondo, para o
 * vidro da Glass ter cor e forma atrás.
 */
export const PAPEIS = {
  nebulosa: { nome: 'Nebulosa', base: '#12072e', cores: ['#6d4aff', '#ff4fa3', '#22b8cf', '#ffb86b', '#3b82f6', '#a855f7'] },
  'por-do-sol': { nome: 'Pôr do sol', base: '#1a0710', cores: ['#ff7a45', '#ffb347', '#e11d74', '#7b1fa2', '#ffd166', '#f43f5e'] },
  oceano: { nome: 'Oceano', base: '#021424', cores: ['#00b4d8', '#0077b6', '#2ec4b6', '#5e60ce', '#48cae4', '#22c55e'] },
} as const;
export type PapelId = keyof typeof PAPEIS;

export type Fundo = { tipo: 'animado' } | { tipo: 'papel'; id: PapelId } | { tipo: 'imagem'; uri: string };

export const FUNDO_PADRAO: Fundo = { tipo: 'animado' };

/** Lê o que foi gravado; qualquer coisa estranha vira o fundo animado. Pura. */
export function lerFundo(bruto: string | null | undefined): Fundo {
  try {
    const f = bruto ? JSON.parse(bruto) : null;
    if (f?.tipo === 'papel' && typeof f.id === 'string' && f.id in PAPEIS) return { tipo: 'papel', id: f.id };
    if (f?.tipo === 'imagem' && typeof f.uri === 'string' && f.uri.startsWith('file:')) return { tipo: 'imagem', uri: f.uri };
  } catch { /* cai no padrão */ }
  return FUNDO_PADRAO;
}
