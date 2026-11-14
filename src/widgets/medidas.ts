/**
 * Medidas dos widgets (14/11, a reformulação): o conteúdo muda com o tamanho que o dono deu ao
 * widget na tela inicial. O Android informa largura e altura em dp; aqui viram colunas e linhas
 * da grade (aproximadas — cada launcher tem a sua célula).
 */

export type Tamanho = { colunas: 1 | 2 | 3 | 4; linhas: 1 | 2 | 3 };

/** dp → colunas/linhas da grade. Sem medida (0): o tamanho padrão do widget. Pura. */
export function tamanhoDoWidget(largura: number, altura: number, padrao: Tamanho = { colunas: 4, linhas: 1 }): Tamanho {
  if (!(largura > 0) || !(altura > 0)) return padrao;
  const colunas = largura < 100 ? 1 : largura < 180 ? 2 : largura < 250 ? 3 : 4;
  const linhas = altura < 100 ? 1 : altura < 180 ? 2 : 3;
  return { colunas, linhas };
}

/** Cor da paleta com transparência no formato do widget (#RRGGBBAA). Sem hex de 6: a reserva. Pura. */
export function corComAlfa(cor: string, alfa: number, reserva = '#111624'): string {
  const base = /^#[0-9a-f]{6}$/i.test(cor) ? cor : reserva;
  const a = Math.round(Math.min(1, Math.max(0, alfa)) * 255).toString(16).padStart(2, '0');
  return `${base}${a.toUpperCase()}`;
}

/** Percentual para a barra (0–100, inteiro). Sem número: 0. Pura. */
export function pct(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : 0;
}
