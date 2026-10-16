import { describe, expect, it } from 'vitest';
import { aoChegarImagem, pedirSobreImagem, pegarImagemPendente } from '../src/lib/imagemParaEly';

describe('imagem compartilhada para a Ely (fase 23.2)', () => {
  it('fica pendente até o chat pegar, e só uma vez', () => {
    let avisos = 0;
    const tirar = aoChegarImagem(() => { avisos++; });
    pedirSobreImagem('AAAA', '');
    expect(avisos).toBe(1);
    expect(pegarImagemPendente()).toEqual({ base64: 'AAAA', pergunta: 'O que aparece nesta imagem?' });
    expect(pegarImagemPendente()).toBeNull();
    tirar();
    pedirSobreImagem('BBBB', 'que planta é essa?');
    expect(avisos).toBe(1);
    expect(pegarImagemPendente()?.pergunta).toBe('que planta é essa?');
  });
});
