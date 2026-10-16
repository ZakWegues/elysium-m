import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { Pairing } from './pairing';
import { MAILBOX_MAX_ATTACHMENT_BYTES, sendMessage } from './mailbox';
import { useShareIntent as useShareIntentNativo } from 'expo-share-intent';
import { File } from 'expo-file-system';
import { fromByteArray } from 'base64-js';

/**
 * Receber conteúdo compartilhado de outros apps do Android.
 *
 * O caminho é o esquema próprio (`elysium://`): o Android entrega a URL, a gente
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
    // `elysium://share?text=...` — o formato que o app.json declara.
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
let ultimoTratado: string | null = null;

export function useShareIntent(
  pairing: Pairing | null,
  onReceived: (text: string, ok: boolean) => void,
) {
  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;

    async function handle(url: string | null) {
      if (!url || cancelled) return;
      // O efeito roda de novo quando o pareamento troca de IP, e o `getInitialURL` devolve o
      // MESMO compartilhamento: sem isto, a pergunta (e o envio) se repetia.
      if (url === ultimoTratado) return;
      ultimoTratado = url;
      const text = parseSharedUrl(url);
      if (!text) return;
      // Fase 20 (bloco 201): qualquer página da web abre um `elysium://share?text=…`. Sem esta
      // pergunta, um site mandava texto para a Caixa do PC sem ninguém ver.
      const curto = text.length > 160 ? `${text.slice(0, 157)}…` : text;
      const ok = await new Promise<boolean>((r) => Alert.alert('Mandar para o PC?', curto, [
        { text: 'Cancelar', style: 'cancel', onPress: () => r(false) },
        { text: 'Mandar', onPress: () => r(true) },
      ], { cancelable: true, onDismiss: () => r(false) }));
      if (!ok || cancelled) return;

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

// ── Fase 23: o "Compartilhar" do Android (APK 2.3.0) ─────────────────────────────────────
//
// Antes só chegava o que alguém mandava pelo esquema `elysium://share`. Com o
// `expo-share-intent`, o Elysium aparece na folha de compartilhar de qualquer app (texto,
// link, imagem). Ao chegar, a pergunta é para onde: a Ely (vira pergunta no chat) ou o PC
// (cai na Caixa, como antes). Imagem só vai para o PC — o chat da Ely recebe texto.

export type Destino = 'ely' | 'pc';
export interface Compartilhado { texto: string | null; arquivo: { uri: string; nome: string; mimeType: string; bytes: number } | null }

/** O que interessa do share intent do pacote. Pura. */
export function lerCompartilhado(si: { text?: string | null; webUrl?: string | null; files?: { path: string; fileName?: string | null; mimeType?: string | null; size?: number | null }[] | null }): Compartilhado | null {
  const texto = (si.text ?? si.webUrl ?? '').trim() || null;
  const f = si.files?.[0];
  const arquivo = f?.path ? { uri: f.path, nome: f.fileName || 'arquivo', mimeType: f.mimeType || 'application/octet-stream', bytes: f.size ?? 0 } : null;
  if (!texto && !arquivo) return null;
  return { texto, arquivo };
}

export function useCompartilharDoAndroid(
  pairing: Pairing | null,
  aoMandarParaEly: (texto: string) => void,
  aoMandarParaPc: (resumo: string, ok: boolean) => void,
) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentNativo();
  useEffect(() => {
    if (!hasShareIntent || !pairing) return;
    const c = lerCompartilhado(shareIntent);
    resetShareIntent();
    if (!c) return;
    const resumo = c.texto ? (c.texto.length > 160 ? `${c.texto.slice(0, 157)}…` : c.texto) : c.arquivo!.nome;
    const paraPc = async () => {
      try {
        if (c.arquivo) {
          // Fase 23.2: o tamanho que o Android informa pode vir vazio — confere o arquivo de
          // verdade ANTES de carregar tudo na memória.
          const arq = new File(c.arquivo.uri);
          const tamanho = c.arquivo.bytes || arq.size || 0;
          if (!tamanho || tamanho > MAILBOX_MAX_ATTACHMENT_BYTES) { aoMandarParaPc('O arquivo passa de 5 MB (ou não deu para ler o tamanho).', false); return; }
          const bytes = new Uint8Array(await arq.arrayBuffer());
          await sendMessage(pairing, { kind: 'file', text: c.texto ?? undefined, attachment: { name: c.arquivo.nome, mimeType: c.arquivo.mimeType, base64: fromByteArray(bytes) } });
        } else {
          await sendMessage(pairing, { kind: /^https?:\/\//i.test(c.texto!) ? 'link' : 'note', text: c.texto! });
        }
        aoMandarParaPc(resumo, true);
      } catch { aoMandarParaPc(resumo, false); }
    };
    const botoes: { text: string; style?: 'cancel'; onPress?: () => void }[] = [{ text: 'Cancelar', style: 'cancel' }];
    if (c.texto && !c.arquivo) botoes.push({ text: 'Ely', onPress: () => aoMandarParaEly(c.texto!) });
    botoes.push({ text: 'PC', onPress: () => { void paraPc(); } });
    Alert.alert('Mandar para…', resumo, botoes, { cancelable: true });
  }, [hasShareIntent, shareIntent, pairing, resetShareIntent, aoMandarParaEly, aoMandarParaPc]);
}
