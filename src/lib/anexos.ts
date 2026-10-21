import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { toByteArray } from 'base64-js';

/**
 * Anexos da Caixa no celular (fase 21).
 *
 * - Mandar VÁRIOS de uma vez para o PC: o seletor aceita múltiplos e qualquer tipo; cada
 *   arquivo vira um recado (o servidor guarda um anexo por recado), o texto vai no primeiro.
 * - Baixar o que o PC mandou: "Salvar no celular" grava na pasta que o dono escolher (o seletor
 *   de pasta do Android, lembrado para as próximas vezes); "Abrir" grava no cache e entrega ao
 *   app que abre aquele tipo.
 */

export const LIMITE_ANEXO = 5 * 1024 * 1024;
const CHAVE_PASTA = 'caixa.pastaDestino';

export interface ArquivoEscolhido { name: string; mimeType: string; uri: string; sizeBytes: number }

/**
 * Separa o que cabe do que passa do limite, e tira repetidos (o mesmo arquivo escolhido duas
 * vezes). Pura.
 */
export function planejarEnvio(arquivos: ArquivoEscolhido[], limite = LIMITE_ANEXO): { aceitos: ArquivoEscolhido[]; grandes: ArquivoEscolhido[] } {
  const vistos = new Set<string>();
  const aceitos: ArquivoEscolhido[] = [];
  const grandes: ArquivoEscolhido[] = [];
  for (const a of arquivos) {
    if (vistos.has(a.uri)) continue;
    vistos.add(a.uri);
    (a.sizeBytes > limite ? grandes : aceitos).push(a);
  }
  return { aceitos, grandes };
}

/**
 * Um nome de arquivo que não escapa da pasta nem engana: sem barras, sem caracteres de
 * controle nem de inversão de direção (o "fdp.exe" que aparece como "exe.pdf"). Pura.
 */
export function nomeSeguro(nome: string): string {
  const limpo = nome
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (limpo || 'arquivo').slice(0, 120);
}

/** "3 arquivos (2,4 MB)". Pura. */
export function resumoDosArquivos(arquivos: { sizeBytes: number }[]): string {
  const total = arquivos.reduce((s, a) => s + (a.sizeBytes || 0), 0);
  const mb = total / (1024 * 1024);
  const tamanho = mb >= 0.1 ? `${mb.toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(total / 1024))} KB`;
  return `${arquivos.length} ${arquivos.length === 1 ? 'arquivo' : 'arquivos'} (${tamanho})`;
}

async function pastaDestino(trocar = false): Promise<Directory> {
  if (!trocar) {
    const salva = await AsyncStorage.getItem(CHAVE_PASTA).catch(() => null);
    if (salva) {
      try {
        const d = new Directory(salva);
        if (d.exists) return d;
      } catch { /* a permissão caiu: pede de novo */ }
    }
  }
  const d = await Directory.pickDirectoryAsync();
  await AsyncStorage.setItem(CHAVE_PASTA, d.uri).catch(() => {});
  return d;
}

/**
 * Grava o anexo na pasta escolhida. Devolve o nome da pasta. `trocarPasta` abre o seletor de
 * novo mesmo havendo uma salva.
 */
export async function salvarNoCelular(nome: string, mimeType: string, base64: string, trocarPasta = false): Promise<string> {
  const pasta = await pastaDestino(trocarPasta);
  const arquivo = pasta.createFile(nomeSeguro(nome), mimeType || 'application/octet-stream');
  arquivo.write(toByteArray(base64));
  return decodeURIComponent(pasta.name || pasta.uri.split('%3A').pop() || 'pasta escolhida');
}

/**
 * Fase 23.2 (blindagem): o que pode ser ABERTO direto vindo do PC. Instalador (.apk) e tipos
 * desconhecidos não abrem por aqui — dá para salvar e abrir de propósito pelo gerenciador de
 * arquivos. Pura.
 */
export function podeAbrirDireto(nome: string, mimeType: string): boolean {
  if (/\.(apk|apks|xapk|aab|dex|jar|exe|bat|cmd|sh|js|html?)$/i.test(nome)) return false;
  if (/android\.package-archive|javascript|html|x-msdownload|x-sh/i.test(mimeType)) return false;
  return /^(image|video|audio|text)\//i.test(mimeType) || /^application\/(pdf|zip|json|msword|vnd\.(openxmlformats|ms-|oasis))/i.test(mimeType);
}

/** Abre o anexo no app que o Android escolher para o tipo. */
export async function abrirNoCelular(nome: string, mimeType: string, base64: string): Promise<void> {
  if (!podeAbrirDireto(nome, mimeType)) throw new Error('Esse tipo de arquivo não abre direto daqui. Use "Salvar no celular" e abra pelo gerenciador de arquivos.');
  const pasta = new Directory(Paths.cache, 'caixa');
  if (!pasta.exists) pasta.create();
  const arquivo = new File(pasta, nomeSeguro(nome));
  if (arquivo.exists) arquivo.delete();
  arquivo.create();
  arquivo.write(toByteArray(base64));
  // FLAG_GRANT_READ_URI_PERMISSION (1): o app que abre precisa ler o arquivo do nosso cache.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: arquivo.contentUri,
    type: mimeType || 'application/octet-stream',
    flags: 1,
  });
}

// ── 21/10: arquivos grandes do PC (até 500 MB) ────────────────────────────────────────────
// O PC 2.14+ serve o anexo cru em `/api/mailbox/messages/:id/raw`. O celular baixa direto para
// o cache, com progresso, sem passar por base64 na memória. PC antigo: cai no `/content`.

export const LIMITE_ARQUIVO_DO_PC = 500 * 1024 * 1024;

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
  zip: 'application/zip', epub: 'application/epub+zip',
};

/** O tipo do arquivo: o que veio, ou pela extensão quando veio vazio/genérico. Pura. */
export function tipoDoArquivo(nome: string, mimeType?: string | null): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const ext = (nome.split('.').pop() ?? '').toLowerCase();
  return MIME_POR_EXTENSAO[ext] ?? 'application/octet-stream';
}

/** "12,4 MB". Pura. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function arquivoNoCache(id: string, nome: string): File {
  const pasta = new Directory(Paths.cache, 'caixa');
  if (!pasta.exists) pasta.create();
  return new File(pasta, `${id.slice(0, 8)}-${nomeSeguro(nome)}`);
}

/**
 * Baixa o anexo do recado para o cache (uma vez; da segunda já está lá). `aoProgresso` recebe
 * de 0 a 1. Sem a rota nova (PC antigo, 404), baixa pelo `/content` em base64.
 */
export async function baixarAnexo(
  pc: { baseUrl: string; token: string },
  id: string, nome: string, tamanho: number,
  aoProgresso?: (fracao: number) => void,
  buscarBase64?: () => Promise<string>,
): Promise<File> {
  const destino = arquivoNoCache(id, nome);
  if (destino.exists && (!tamanho || destino.size === tamanho)) return destino;
  if (destino.exists) destino.delete();
  try {
    const tarefa = File.createDownloadTask(`${pc.baseUrl}/api/mailbox/messages/${encodeURIComponent(id)}/raw`, destino, {
      headers: { Authorization: `Bearer ${pc.token}` },
      onProgress: ({ bytesWritten, totalBytes }) => { if (totalBytes > 0) aoProgresso?.(bytesWritten / totalBytes); },
    });
    const f = await tarefa.downloadAsync();
    if (f && f.exists && (f.size ?? 0) > 0) return f;
    throw new Error('download vazio');
  } catch (e) {
    if (!buscarBase64) throw e;
    // PC antigo: a rota crua não existe — o anexo vem em base64 (até 5 MB).
    const b64 = await buscarBase64();
    if (!b64) throw new Error('O PC não conseguiu mandar esse arquivo (atualize o ELYSIUM do PC).');
    if (destino.exists) destino.delete();
    destino.create();
    destino.write(toByteArray(b64));
    return destino;
  }
}

/** Abre o arquivo baixado no app que o Android escolher para o tipo. */
export async function abrirArquivo(arquivo: File, nome: string, mimeType: string): Promise<void> {
  const tipo = tipoDoArquivo(nome, mimeType);
  if (!podeAbrirDireto(nome, tipo)) throw new Error('Esse tipo de arquivo não abre direto daqui. Use Salvar e abra pelo gerenciador de arquivos.');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: arquivo.contentUri, type: tipo, flags: 1 });
}

/**
 * Salva na pasta escolhida copiando em partes de 1 MB — um vídeo de 500 MB não cabe inteiro
 * na memória. Devolve o nome da pasta.
 */
export async function salvarArquivo(arquivo: File, nome: string, mimeType: string, trocarPasta = false): Promise<string> {
  const pasta = await pastaDestino(trocarPasta);
  const destino = pasta.createFile(nomeSeguro(nome), tipoDoArquivo(nome, mimeType));
  const de = arquivo.open(FileMode.ReadOnly);
  const para = destino.open(FileMode.WriteOnly);
  try {
    const PEDACO = 1024 * 1024;
    for (;;) {
      const bytes = de.readBytes(PEDACO);
      if (!bytes.length) break;
      para.writeBytes(bytes);
      if (bytes.length < PEDACO) break;
    }
  } finally {
    de.close();
    para.close();
  }
  return decodeURIComponent(pasta.name || pasta.uri.split('%3A').pop() || 'pasta escolhida');
}
