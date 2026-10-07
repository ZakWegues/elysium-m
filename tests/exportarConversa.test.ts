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

describe('exportar sem mensagens do app (07/10)', () => {
  it('tira fila offline, anexo entregue e o marcador do áudio; usa a data da conversa; escapa colchete', () => {
    const md = conversaEmMarkdown({
      title: 'X',
      createdAt: new Date(2026, 0, 5).getTime(),
      messages: [
        { id: 'a', from: 'me', text: '🎤 (áudio)', ts: 1 },
        { id: 'b', from: 'me', text: 'que horas são', ts: 2 },
        { id: 'c', from: 'reply', text: '⏳ PC fora do ar. Guardei esse comando e mando assim que ele voltar.', ts: 3 },
        { id: 'd', from: 'reply', text: 'Arquivo entregue na caixa do PC.', ts: 4 },
        { id: 'e', from: 'reply', text: 'São 10h.', ts: 5, fontes: [{ titulo: 'a]b', url: 'https://x.com' }] },
      ],
    }, new Date(2026, 9, 7));
    expect(md).not.toMatch(/áudio|PC fora|caixa do PC/);
    expect(md).toContain('5 de janeiro de 2026');
    expect(md).toContain('[a\\]b](https://x.com)');
  });
});
