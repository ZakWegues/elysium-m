import { describe, expect, it } from 'vitest';
import { partesComLinks } from '../src/lib/links';

describe('links em texto simples (fase 23)', () => {
  it('separa texto e link, sem a pontuação do fim', () => {
    expect(partesComLinks('olha isso https://youtu.be/abc123. legal')).toEqual([
      { tipo: 'texto', texto: 'olha isso ' },
      { tipo: 'link', texto: 'https://youtu.be/abc123', url: 'https://youtu.be/abc123' },
      { tipo: 'texto', texto: '. legal' },
    ]);
  });
  it('www vira https', () => {
    expect(partesComLinks('www.exemplo.com.br')).toEqual([{ tipo: 'link', texto: 'www.exemplo.com.br', url: 'https://www.exemplo.com.br' }]);
  });
  it('parêntese sem par fica de fora; com par fica', () => {
    expect(partesComLinks('(https://a.com/x)')[1]).toEqual({ tipo: 'link', texto: 'https://a.com/x', url: 'https://a.com/x' });
    expect(partesComLinks('https://pt.wikipedia.org/wiki/Rio_(cidade)')[0]).toMatchObject({ url: 'https://pt.wikipedia.org/wiki/Rio_(cidade)' });
  });
  it('sem link, um pedaço só', () => {
    expect(partesComLinks('oi tudo bem')).toEqual([{ tipo: 'texto', texto: 'oi tudo bem' }]);
  });
});
