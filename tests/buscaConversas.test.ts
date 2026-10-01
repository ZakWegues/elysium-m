import { describe, expect, it } from 'vitest';
import { buscarNasConversas } from '../src/lib/buscaConversas';

const sessoes = [
  { id: 'a', title: 'oi', updatedAt: 3, messages: [
    { from: 'me', text: 'me explica como funciona um SSD', ts: 10 },
    { from: 'reply', text: 'Um **SSD** usa memória flash, sem partes móveis, e por isso é mais rápido que o HD.', ts: 11 },
  ] },
  { id: 'b', title: 'Receita', updatedAt: 5, messages: [
    { from: 'me', text: 'receita de pão de queijo', ts: 20 },
    { from: 'error', text: 'SSD erro', ts: 21 },
  ] },
];

describe('busca dentro das conversas (bloco 133)', () => {
  it('acha pelo conteúdo, sem acento, todas as palavras, mais recente primeiro', () => {
    const r = buscarNasConversas(sessoes, 'memoria SSD');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ sessaoId: 'a', titulo: 'oi', deQuem: 'elysium', em: 11 });
    expect(r[0].trecho).toMatch(/SSD usa memória flash/);
  });

  it('ignora mensagem de erro e consulta curta demais', () => {
    expect(buscarNasConversas(sessoes, 'erro')).toEqual([]);
    expect(buscarNasConversas(sessoes, 'a')).toEqual([]);
  });

  it('uma linha por conversa, com o trecho em volta do termo', () => {
    const r = buscarNasConversas(sessoes, 'queijo');
    expect(r).toEqual([{ sessaoId: 'b', titulo: 'Receita', trecho: 'receita de pão de queijo', em: 20, deQuem: 'eu' }]);
  });
});
