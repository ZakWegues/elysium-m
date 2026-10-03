import { describe, expect, it } from 'vitest';
import { escolherVozFeminina } from '../src/lib/vozFeminina';

describe('voz feminina do aparelho (02/10)', () => {
  it('prefere a feminina local do Google; ignora outros idiomas', () => {
    expect(escolherVozFeminina([
      { identifier: 'pt-br-x-ptd-local', language: 'pt-BR' },
      { identifier: 'pt-br-x-afs-network', language: 'pt-BR' },
      { identifier: 'pt-br-x-afs-local', language: 'pt-BR' },
      { identifier: 'en-us-x-female-local', language: 'en-US' },
    ])).toBe('pt-br-x-afs-local');
  });
  it('Samsung e "female" no nome também valem; sem sinal, null', () => {
    expect(escolherVozFeminina([{ identifier: 'SMTm00', language: 'pt_BR' }, { identifier: 'SMTf00', language: 'pt_BR' }])).toBe('SMTf00');
    expect(escolherVozFeminina([{ identifier: 'x', name: 'Portuguese Female', language: 'pt-BR' }])).toBe('x');
    expect(escolherVozFeminina([{ identifier: 'pt-br-x-ptd-local', language: 'pt-BR' }])).toBeNull();
  });
});
