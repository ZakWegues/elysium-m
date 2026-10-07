import type { ChatSession, StoredMessage } from './chatHistoryStore';

/**
 * Mensagens que o APP escreve na conversa (fila offline, anexo entregue, marcador do áudio)
 * — não são falas de ninguém e não vão para a exportação.
 */
function ehDoApp(m: StoredMessage): boolean {
  const t = m.text.trim();
  if (m.id === 'welcome') return true;
  if (m.from === 'me' && t === '🎤 (áudio)') return true;
  if (m.from === 'reply' && (t.startsWith('⏳ PC fora do ar') || t === 'Arquivo entregue na caixa do PC.')) return true;
  return false;
}

/**
 * Conversa em markdown para compartilhar (02/10, como o "exportar" do ChatGPT/Claude): vai
 * pelo menu de compartilhar do Android — WhatsApp, e-mail, Drive, um app de notas. Erros
 * da conexão e mensagens do app não entram: são da tela, não da conversa. A data é a da
 * conversa, não a do dia em que se compartilhou. Pura.
 */
export function conversaEmMarkdown(s: Pick<ChatSession, 'title' | 'messages'> & { createdAt?: number }, agora = new Date()): string {
  const quando = s.createdAt ? new Date(s.createdAt) : agora;
  const data = quando.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  // "]" no título da fonte fecharia o link antes da hora.
  const titulo = (t: string) => t.replace(/[[\]]/g, (c) => `\\${c}`);
  const corpo = s.messages
    .filter(m => m.from !== 'error' && m.text.trim() && !ehDoApp(m))
    .map(m => {
      const fontes = m.fontes?.length ? '\n\n' + m.fontes.map((f, i) => `${i + 1}. [${titulo(f.titulo)}](${f.url})`).join('\n') : '';
      return `**${m.from === 'me' ? 'Você' : 'Ely'}:** ${m.text.trim()}${fontes}`;
    })
    .join('\n\n');
  return `# ${s.title}\n\n_Conversa com a Ely (ELYSIUM), ${data}_\n\n${corpo}\n`;
}
