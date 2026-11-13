import { describe, expect, it } from 'vitest';
import { abrirTelaMandada, aoAbrirTelaMandada, aoMudarTelasSalvas, idDaTelaMandada, telasSalvasMudaram } from '../src/lib/telasMandadas';

describe('telas mandadas do PC (12/11)', () => {
  it('lê o id do ref da entrega', () => {
    expect(idDaTelaMandada('tela:abc-123_X')).toBe('abc-123_X');
    expect(idDaTelaMandada('rotina:1')).toBeNull();
    expect(idDaTelaMandada('tela:')).toBeNull();
    expect(idDaTelaMandada('tela:../x')).toBeNull();
    expect(idDaTelaMandada(null)).toBeNull();
  });

  it('avisa quem abre e quem relê a lista; desligar para de avisar', () => {
    const abertas: string[] = [];
    let mudou = 0;
    const tirarA = aoAbrirTelaMandada((id) => abertas.push(id));
    const tirarM = aoMudarTelasSalvas(() => { mudou++; });
    abrirTelaMandada('t1');
    telasSalvasMudaram();
    tirarA(); tirarM();
    abrirTelaMandada('t2');
    telasSalvasMudaram();
    expect(abertas).toEqual(['t1']);
    expect(mudou).toBe(1);
  });
});
