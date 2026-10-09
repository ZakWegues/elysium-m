import { describe, expect, it } from 'vitest';
import { pomodoroValido, restaDoPomodoro } from '../src/lib/pomodoro';

describe('pomodoro do PC no celular (fase 20)', () => {
  it('aceita só o formato do PC', () => {
    expect(pomodoroValido({ ativo: false })).toEqual({ ativo: false });
    expect(pomodoroValido(null)).toBeNull();
    expect(pomodoroValido({ ativo: true, fase: 'outra', fimEm: 1 })).toBeNull();
    expect(pomodoroValido({ ativo: true, fase: 'foco', fimEm: 1000, ciclo: 2, de: 4, agora: 500 })).toMatchObject({ fase: 'foco', ciclo: 2, de: 4 });
  });

  it('o relógio conta no relógio do PC, não no do celular', () => {
    const e = pomodoroValido({ ativo: true, fase: 'foco', fimEm: 10_000_000 + 25 * 60_000, agora: 10_000_000 });
    // O celular está 2 min atrasado: a diferença medida corrige.
    const diferenca = 10_000_000 - (10_000_000 - 120_000);
    expect(restaDoPomodoro(e, diferenca, 10_000_000 - 120_000)).toBe(25 * 60_000);
    expect(restaDoPomodoro(e, diferenca, 10_000_000 - 120_000 + 26 * 60_000)).toBe(0);
    expect(restaDoPomodoro({ ativo: false }, 0)).toBe(0);
  });
});
