import { describe, expect, it } from 'vitest';
import { corComAlfa, pct, tamanhoDoWidget } from '../src/widgets/medidas';

describe('medidas dos widgets (14/11)', () => {
  it('dp viram colunas e linhas da grade', () => {
    expect(tamanhoDoWidget(70, 60)).toEqual({ colunas: 1, linhas: 1 });
    expect(tamanhoDoWidget(150, 60)).toEqual({ colunas: 2, linhas: 1 });
    expect(tamanhoDoWidget(320, 70)).toEqual({ colunas: 4, linhas: 1 });
    expect(tamanhoDoWidget(160, 160)).toEqual({ colunas: 2, linhas: 2 });
    expect(tamanhoDoWidget(330, 250)).toEqual({ colunas: 4, linhas: 3 });
  });

  it('sem medida, o tamanho padrão do widget', () => {
    expect(tamanhoDoWidget(0, 0, { colunas: 2, linhas: 1 })).toEqual({ colunas: 2, linhas: 1 });
    expect(tamanhoDoWidget(NaN, 100)).toEqual({ colunas: 4, linhas: 1 });
  });

  it('cor com transparência no formato do widget', () => {
    expect(corComAlfa('#131726', 0.96)).toBe('#131726F5');
    expect(corComAlfa('#abcdef', 0)).toBe('#abcdef00');
    expect(corComAlfa('rgba(1,2,3,0.5)', 1)).toBe('#111624FF');
  });

  it('percentual da barra', () => {
    expect(pct(42.6)).toBe(43);
    expect(pct(140)).toBe(100);
    expect(pct('x')).toBe(0);
  });
});
