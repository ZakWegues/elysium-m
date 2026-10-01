import { describe, expect, it } from 'vitest';
import { paraFala, parseInline, parseMarkdown, textoPuro } from '../src/lib/markdown';

describe('markdown das bolhas (bloco 130)', () => {
  it('trechos dentro da linha: negrito, código, link, itálico', () => {
    expect(parseInline('um **SSD** usa `NAND` e [isto](https://x.com/a) é *rápido*.')).toEqual([
      { tipo: 'texto', texto: 'um ' },
      { tipo: 'negrito', texto: 'SSD' },
      { tipo: 'texto', texto: ' usa ' },
      { tipo: 'codigo', texto: 'NAND' },
      { tipo: 'texto', texto: ' e ' },
      { tipo: 'link', texto: 'isto', url: 'https://x.com/a' },
      { tipo: 'texto', texto: ' é ' },
      { tipo: 'italico', texto: 'rápido' },
      { tipo: 'texto', texto: '.' },
    ]);
  });

  it('não confunde asterisco de conta com itálico', () => {
    expect(parseInline('2*3*4 = 24').every(t => t.tipo === 'texto')).toBe(true);
  });

  it('blocos: título, listas, parágrafos e código', () => {
    const b = parseMarkdown('## Como funciona\nUm SSD\nnão gira.\n\n1. **Memória**: flash\n2) Controlador\n- item\n```js\nconst x = 1;\n```');
    expect(b.map(x => x.tipo)).toEqual(['titulo', 'paragrafo', 'item', 'item', 'item', 'codigo']);
    expect(b[1]).toEqual({ tipo: 'paragrafo', trechos: [{ tipo: 'texto', texto: 'Um SSD não gira.' }] });
    expect(b[3]).toMatchObject({ marcador: '2.' });
    expect(b[4]).toMatchObject({ marcador: '•' });
    expect(b[5]).toEqual({ tipo: 'codigo', linguagem: 'js', texto: 'const x = 1;' });
  });

  it('texto puro tira a marcação', () => {
    expect(textoPuro('**Oi**, veja `x`\n- um')).toBe('Oi, veja x\n• um');
  });
});

describe('paraFala no celular (bloco 130)', () => {
  it('curto inteiro, longo só o começo, sem código e sem marcação', () => {
    expect(paraFala('**Pronto.**')).toBe('Pronto.');
    const f = paraFala('Primeira frase. Segunda frase.\n\n' + '- item longo demais aqui\n'.repeat(40), 60);
    expect(f.startsWith('Primeira frase. Segunda frase.')).toBe(true);
    expect(f.endsWith('O resto está na tela.')).toBe(true);
    expect(paraFala('Veja:\n```\nconst x = 1;\n```')).not.toMatch(/const/);
  });
});
