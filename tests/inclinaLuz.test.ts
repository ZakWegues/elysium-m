import { describe, expect, it } from 'vitest';
import { inclinaDoArrasto } from '../src/lib/inclinaLuz';

describe('inclinação do brilho pelo arrasto (09/11)', () => {
  it('vai de −1 a 1, em décimos, com 6 abas/s no máximo', () => {
    expect(inclinaDoArrasto(0)).toBe(0);
    expect(inclinaDoArrasto(3)).toBe(0.5);
    expect(inclinaDoArrasto(-1.2)).toBe(-0.2);
    expect(inclinaDoArrasto(40)).toBe(1);
    expect(inclinaDoArrasto(-40)).toBe(-1);
  });
  it('sem número válido, fica parado', () => {
    expect(inclinaDoArrasto(Number.NaN)).toBe(0);
    expect(Object.is(inclinaDoArrasto(-0.01), -0)).toBe(false);
  });
});
