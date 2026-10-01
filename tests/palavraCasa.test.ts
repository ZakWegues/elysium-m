import { describe, expect, it } from 'vitest';
import { acharPalavra } from '../src/lib/palavraCasa';

describe('palavra "Elysium" no celular (bloco 129)', () => {
  it('acha as grafias que o reconhecedor costuma escrever', () => {
    for (const t of ['Elysium', 'elísio', 'Elisium', 'ilísio', 'Elysio', 'e lísio', 'Elizium', 'ok Elysium', 'ei elísio']) {
      expect(acharPalavra(t).achou, t).toBe(true);
    }
  });

  it('devolve o pedido que veio depois, com acento', () => {
    expect(acharPalavra('Elysium, pausa a música')).toEqual({ achou: true, resto: 'pausa a música' });
    expect(acharPalavra('ok elísio qual a previsão do tempo?')).toEqual({ achou: true, resto: 'qual a previsão do tempo' });
    expect(acharPalavra('Elysium')).toEqual({ achou: true, resto: '' });
  });

  it('não dispara com palavra parecida nem com nome de gente', () => {
    for (const t of ['isso é liso', 'a Elisa chegou', 'fala com o Eliseu', 'Alisson ligou', 'eu deslizo', 'o piso está liso']) {
      expect(acharPalavra(t).achou, t).toBe(false);
    }
  });
});
