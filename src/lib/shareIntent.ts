import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { Pairing } from './pairing';
import { sendMessage } from './mailbox';

/**
 * Receber conteúdo compartilhado de outros apps do Android.
 *
 * O caminho é o esquema próprio (`neuroaxis://`): o Android entrega a URL, a gente
 * extrai o texto e manda pra Caixa do PC. Compartilhar um link do navegador, do
 * YouTube ou do WhatsApp passa a ser um caminho de dois toques até o computador.
 *
 * ⚠️ **Não funciona no Expo Go.** Filtros de intent fazem parte do manifesto nativo,
 * que o Expo Go não tem como alterar — ele registra os dele. Só vale no APK ou num
 * build de desenvolvimento.
 */

/** Extrai o conteúdo compartilhado de uma URL recebida, ou null se não for isso. */
export function parseSharedUrl(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    // `neuroaxis://share?text=...` — o formato que o app.json declara.
    if (parsed.hostname !== 'share' && parsed.path !== 'share') return null;

    const raw = parsed.queryParams?.text ?? parsed.queryParams?.url;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    return raw.trim();
  } catch {
    return null;
  }
}

/**
 * Liga o recebimento. Chamado uma vez, na raiz do app.
 *
 * Trata os dois casos: o app já aberto (evento) e o app iniciado pelo
 * compartilhamento (URL inicial). Esquecer o segundo é o erro clássico — funciona nos
 * testes, porque o app já estava aberto, e falha no uso real.
 */
export function useShareIntent(
  pairing: Pairing | null,
  onReceived: (text: string, ok: boolean) => void,
) {
  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;

    async function handle(url: string | null) {
      if (!url || cancelled) return;
      const text = parseSharedUrl(url);
      if (!text) return;

      try {
        await sendMessage(pairing!, {
          // `inferKind` no PC decide entre link e nota pelo formato; mandar "note"
          // aqui forçaria link nenhum a ser reconhecido como link.
          kind: text.startsWith('http://') || text.startsWith('https://') ? 'link' : 'note',
          text,
        });
        if (!cancelled) onReceived(text, true);
      } catch {
        if (!cancelled) onReceived(text, false);
      }
    }

    // App iniciado pelo compartilhamento.
    Linking.getInitialURL().then(handle);
    // App já aberto.
    const sub = Linking.addEventListener('url', (e) => handle(e.url));

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [pairing, onReceived]);
}
