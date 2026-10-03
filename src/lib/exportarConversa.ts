import type { ChatSession } from './chatHistoryStore';

/**
 * Conversa em markdown para compartilhar (02/10, como o "exportar" do ChatGPT/Claude): vai
 * pelo menu de compartilhar do Android — WhatsApp, e-mail, Drive, um app de notas. Erros
 * da conexão não entram: são da tela, não da conversa. Pura.
 */
export function conversaEmMarkdown(s: Pick<ChatSession, 'title' | 'messages'>, quando = new Date()): string {
  const data = quando.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const corpo = s.messages
    .filter(m => m.from !== 'error' && m.text.trim() && m.id !== 'welcome')
    .map(m => {
      const fontes = m.fontes?.length ? '\n\n' + m.fontes.map((f, i) => `${i + 1}. [${f.titulo}](${f.url})`).join('\n') : '';
      return `**${m.from === 'me' ? 'Você' : 'Ely'}:** ${m.text.trim()}${fontes}`;
    })
    .join('\n\n');
  return `# ${s.title}\n\n_Conversa com a Ely (ELYSIUM), ${data}_\n\n${corpo}\n`;
}
