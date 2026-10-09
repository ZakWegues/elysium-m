import { describe, expect, it } from 'vitest';
import { modoAtual, modoValido, receberFrameModo } from '../src/lib/modo';

describe('modo da Ely no celular (fase 20)', () => {
  it('aceita só o formato do PC', () => {
    expect(modoValido({ id: 'matematica', nome: 'Matemática', icone: '∑', resumo: 'passo a passo', meu: false }))
      .toEqual({ id: 'matematica', nome: 'Matemática', icone: '∑', resumo: 'passo a passo', meu: false });
    expect(modoValido(null)).toBeNull();
    expect(modoValido({ nome: 'sem id' })).toBeNull();
    expect(modoValido({ id: 'x', nome: 'X' })).toMatchObject({ icone: '✦', resumo: '', meu: false });
  });

  it('o frame do WebSocket liga e desliga o chip', () => {
    receberFrameModo({ type: 'modo', modo: { id: 'ingles', nome: 'Inglês', icone: 'EN', resumo: '', meu: false } });
    expect(modoAtual()?.id).toBe('ingles');
    receberFrameModo({ type: 'modo', modo: null });
    expect(modoAtual()).toBeNull();
  });
});
