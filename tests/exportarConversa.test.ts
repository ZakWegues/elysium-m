import { describe, expect, it } from 'vitest';
import { conversaEmMarkdown } from '../src/lib/exportarConversa';

describe('exportar conversa (02/10)', () => {
  it('título, quem falou, fontes; sem erros nem a saudação', () => {
    const md = conversaEmMarkdown({
      title: 'Clima',
      messages: [
        { id: 'welcome', from: 'reply', text: 'Pareado com 1.2.3.4', ts: 1 },
        { id: 'a', from: 'me', text: 'vai chover?', ts: 2 },
        { id: 'e', from: 'error', text: 'Falha: rede', ts: 3 },
        { id: 'b', from: 'reply', text: 'Não hoje.', ts: 4, fontes: [{ titulo: 'Tempo', url: 'https://ex.com' }] },
      ],
    }, new Date(2026, 9, 2));
    expect(md.startsWith('# Clima\n')).toBe(true);
    expect(md).toContain('**Você:** vai chover?');
    expect(md).toContain('**Ely:** Não hoje.\n\n1. [Tempo](https://ex.com)');
    expect(md).not.toMatch(/Pareado|Falha/);
  });
});
