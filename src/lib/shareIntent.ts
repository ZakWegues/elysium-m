import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { baseUrl, Pairing } from './pairing';
import { abrirFolha, type ItemCompartilhado, type ResultadoEnvio } from './folhaCompartilhar';
import { enviarArquivoGrande, PcSemUploadGrande } from './anexos';
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
      // pergunta, um site mandava texto para a Caixa do PC sem ninguém ver. 22/10: a pergunta
      // é a folha própria, no modo "confirmar" (só PC, com o aviso de origem).
      abrirFolha({
        item: { texto: text, arquivo: null },
        modo: 'confirmar',
        aoEscolher: async () => {
          if (cancelled) return { ok: false, erro: 'Cancelado.' };
          try {
            // `inferKind` no PC decide entre link e nota pelo formato; mandar "note"
            // aqui forçaria link nenhum a ser reconhecido como link.
            await sendMessage(pairing!, { kind: /^https?:\/\//i.test(text) ? 'link' : 'note', text });
            onReceived(text, true);
            return { ok: true, mensagem: 'Enviado para o PC' };
          } catch {
            onReceived(text, false);
            return { ok: false, erro: 'O PC está fora de alcance.' };
          }
        },
      });
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
// (cai na Caixa, como antes). Imagem pode ir para a Ely também (fase 23.2: ela olha pelo vision.ask).

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

/**
 * 22/10: um arquivo para a Caixa do PC — inteiro, em stream, até 500 MB, com progresso. PC
 * anterior à 2.15 (sem a rota): cai no base64 de sempre, só até 5 MB, com aviso claro.
 */
export async function mandarArquivoParaPc(
  pairing: Pairing,
  arquivo: { uri: string; nome: string; mimeType: string; bytes: number },
  texto: string | null,
  opcoes: { progresso?: (f: number) => void; signal?: AbortSignal; sessionId?: string | null } = {},
): Promise<void> {
  const { progresso, signal, sessionId } = opcoes;
  try {
    await enviarArquivoGrande({ baseUrl: baseUrl(pairing), token: pairing.token }, arquivo.uri, arquivo.nome, arquivo.mimeType, { texto, sessionId, aoProgresso: progresso, signal });
  } catch (e) {
    if (!(e instanceof PcSemUploadGrande)) throw e;
    // Fase 23.2: o tamanho que o Android informa pode vir vazio — confere o arquivo de
    // verdade ANTES de carregar tudo na memória.
    const arq = new File(arquivo.uri);
    const tamanho = arquivo.bytes || arq.size || 0;
    if (!tamanho || tamanho > MAILBOX_MAX_ATTACHMENT_BYTES) throw new Error('Este PC só recebe até 5 MB. Atualize o ELYSIUM do PC para mandar arquivos grandes.');
    const bytes = new Uint8Array(await arq.arrayBuffer());
    await sendMessage(pairing, { kind: 'file', text: texto ?? undefined, sessionId: sessionId ?? null, attachment: { name: arquivo.nome, mimeType: arquivo.mimeType, base64: fromByteArray(bytes) } });
    progresso?.(1);
  }
}

/** A mensagem de erro que a folha mostra. Puro o bastante. */
function erroLegivel(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(m)) return 'Envio cancelado.';
  if (/network|failed to connect|timeout|unreachable/i.test(m)) return 'O PC está fora de alcance.';
  return m || 'Não consegui enviar.';
}

export function useCompartilharDoAndroid(
  pairing: Pairing | null,
  aoMandarParaEly: (texto: string) => void,
  aoMandarParaPc: (resumo: string, ok: boolean) => void,
  aoMandarImagemParaEly?: (base64: string, pergunta: string) => void,
) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentNativo();
  useEffect(() => {
    if (!hasShareIntent || !pairing) return;
    const c = lerCompartilhado(shareIntent);
    resetShareIntent();
    if (!c) return;
    const item: ItemCompartilhado = c;
    const resumo = c.texto ? (c.texto.length > 160 ? `${c.texto.slice(0, 157)}…` : c.texto) : c.arquivo!.nome;
    // 22/10: a folha própria no lugar do "Mandar para…" do Android.
    abrirFolha({
      item,
      modo: 'normal',
      aoEscolher: async (acao, { pergunta, progresso, signal }): Promise<ResultadoEnvio> => {
        if (acao === 'ely') {
          if (!c.arquivo) {
            aoMandarParaEly(pergunta.trim() ? `${pergunta.trim()}\n\n${c.texto}` : c.texto!);
            return { ok: true, mensagem: 'Perguntando à Ely' };
          }
          // Fase 23.2: imagem → a Ely olha e responde (até 5 MB).
          if (!aoMandarImagemParaEly) return { ok: false, erro: 'A Ely não abre esse tipo.' };
          try {
            const arq = new File(c.arquivo.uri);
            const tamanho = c.arquivo.bytes || arq.size || 0;
            if (!tamanho || tamanho > MAILBOX_MAX_ATTACHMENT_BYTES) return { ok: false, erro: 'A Ely olha imagens de até 5 MB.' };
            aoMandarImagemParaEly(fromByteArray(new Uint8Array(await arq.arrayBuffer())), pergunta.trim() || c.texto || '');
            return { ok: true, mensagem: 'Perguntando à Ely' };
          } catch { return { ok: false, erro: 'Não consegui abrir a imagem.' }; }
        }
        try {
          if (c.arquivo) await mandarArquivoParaPc(pairing, c.arquivo, c.texto, { progresso, signal });
          else await sendMessage(pairing, { kind: /^https?:\/\//i.test(c.texto!) ? 'link' : 'note', text: c.texto! });
          aoMandarParaPc(resumo, true);
          return { ok: true, mensagem: 'Enviado para o PC' };
        } catch (e) {
          aoMandarParaPc(resumo, false);
          return { ok: false, erro: erroLegivel(e) };
        }
      },
    });
  }, [hasShareIntent, shareIntent, pairing, resetShareIntent, aoMandarParaEly, aoMandarParaPc, aoMandarImagemParaEly]);
}
