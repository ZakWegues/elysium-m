import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import type { Pairing } from './pairing';
import { callRpc, type PacoteAtualizacao } from './rpc';

/**
 * "Há versão nova" no celular (bloco 95).
 *
 * O PC confere as releases do GitHub e guarda o APK mais novo; o celular só pergunta ao PC
 * (`update.status`) e, se a versão de lá for mais nova que a instalada, baixa por
 * `GET /api/update/apk` com o token de sempre e abre o instalador do Android. Assim o app não
 * precisa de credencial do GitHub nem de internet — só de alcançar o PC.
 *
 * A versão comparada é a NATIVA (`expo-application`), não a do `app.json` embutido no JS: um
 * OTA traz o `app.json` novo por cima de um APK velho, e a versão do bundle mentiria.
 */

const CHAVE_ADIADA = 'elysium_atualizacao_adiada_v1';

export function versaoInstalada(): string {
  return Application.nativeApplicationVersion ?? '0.0.0';
}

function partes(v: string): number[] {
  return v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
}

/** >0 se `a` é mais nova que `b`, número a número ("1.10.0" > "1.9.0"). */
export function compararVersoes(a: string, b: string): number {
  const pa = partes(a), pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * O `versionCode` de um pacote: o script de publicação acrescenta "versionCode N" ao fim das
 * notas (e o PC novo manda o campo). Com a MESMA versão e um vc maior, é APK novo — antes a
 * comparação só olhava o "1.8.0" e uma republicação nunca chegava.
 */
export function codigoDoPacote(p: { notas?: string; versionCode?: number }): number | null {
  if (typeof p.versionCode === 'number') return p.versionCode;
  const m = /versionCode (\d+)/.exec(p.notas ?? '');
  return m ? parseInt(m[1], 10) : null;
}

/** Pura: o pacote é mais novo que o instalado? Versão primeiro; empate decide o vc. */
export function pacoteMaisNovo(p: { versao: string; notas?: string; versionCode?: number }, instalada: string, vcInstalado: number | null): boolean {
  const d = compararVersoes(p.versao, instalada);
  if (d !== 0) return d > 0;
  const vc = codigoDoPacote(p);
  return vc !== null && vcInstalado !== null && vc > vcInstalado;
}

function vcInstalado(): number | null {
  const n = parseInt(Application.nativeBuildVersion ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

export type SituacaoAtualizacao = {
  /**
   * Por que o PC não sabe se há versão nova (07/10). Antes isso aparecia como "celular na
   * versão mais nova" — mentira confortável quando o PC nem tinha conseguido perguntar.
   */
  problema: string | null;
  /** Quando o PC conferiu o GitHub pela última vez (ms) — para re-perguntar se estiver velho. */
  verificadoEm: number | null;
  /** O APK que o PC tem, se for mais novo que o instalado e já estiver inteiro no PC. */
  apk: PacoteAtualizacao | null;
  /** Versão que o PC está rodando. */
  pcAtual: string;
  /** Versão nova do PC já baixada, esperando o "instalar". */
  pcNova: PacoteAtualizacao | null;
  /** O PC ainda está baixando algo novo (o APK mais novo ou a versão dele): 0–1. */
  baixando: { oque: string; progresso: number } | null;
};

export async function situacaoAtualizacao(pairing: Pairing, verificar = false): Promise<SituacaoAtualizacao> {
  const r = await callRpc(pairing, 'update.status', verificar ? { verificar: true } : {}, verificar ? { timeoutMs: 30000 } : {});
  const cel = r.celular;
  const nova = cel ? pacoteMaisNovo(cel, versaoInstalada(), vcInstalado()) : false;
  return {
    problema: r.semToken ? 'O PC não tem acesso ao GitHub (falta o token em Ajustes → Sobre, no PC).' : r.erro ? `O PC não conseguiu conferir: ${r.erro}` : null,
    verificadoEm: r.verificadoEm,
    apk: cel?.pronto && nova ? cel : null,
    pcAtual: r.pc,
    pcNova: r.desktop?.pronto ? r.desktop : null,
    // O download no PC corre em segundo plano (bloco 95): "procurar" responde na hora e o
    // arquivo chega depois. Sem isto a tela diria "versão mais nova" durante o download.
    baixando: cel && !cel.pronto && nova
      ? { oque: `ELYSIUM-M ${cel.versao}`, progresso: cel.progresso }
      : r.desktop && !r.desktop.pronto ? { oque: `a versão ${r.desktop.versao} do PC`, progresso: r.desktop.progresso } : null,
  };
}

/** Instala no PC a versão já baixada. O app do PC fecha e volta sozinho em segundos. */
export async function instalarNoPc(pairing: Pairing): Promise<string> {
  const r = await callRpc(pairing, 'update.install', {}, { confirmed: true });
  if (!r.ok) throw new Error(r.mensagem);
  return r.mensagem;
}

// ── Novidades ────────────────────────────────────────────────────────────────
// As notas vão guardadas antes de abrir o instalador; na primeira abertura da versão nova a
// Início mostra uma vez o que mudou.

const CHAVE_NOVIDADES = 'elysium_novidades_v1';

/** As notas da release sem a linha "versionCode N" que o script de publicação acrescenta. */
export function notasLimpas(notas: string): string {
  return notas.replace(/\n*versionCode \d+\s*$/, '').trim();
}
type RegistroNovidades = { versao: string; notas: string; vista?: boolean };

export async function novidadesPendentes(): Promise<RegistroNovidades | null> {
  try {
    const r = JSON.parse((await AsyncStorage.getItem(CHAVE_NOVIDADES)) ?? 'null') as RegistroNovidades | null;
    return r && !r.vista && r.versao === versaoInstalada() && r.notas.trim() ? r : null;
  } catch { return null; }
}

export async function marcarNovidadesVistas(): Promise<void> {
  try {
    const r = JSON.parse((await AsyncStorage.getItem(CHAVE_NOVIDADES)) ?? 'null') as RegistroNovidades | null;
    if (r) await AsyncStorage.setItem(CHAVE_NOVIDADES, JSON.stringify({ ...r, vista: true }));
  } catch { /* mostra de novo na próxima abertura */ }
}

/** "Agora não" vale para AQUELA versão: a próxima release volta a aparecer. */
export async function adiada(versao: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(CHAVE_ADIADA)) === versao; } catch { return false; }
}

export async function adiar(versao: string): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE_ADIADA, versao); } catch { /* só não lembra */ }
}

/**
 * Baixa o APK do PC para o cache e abre o instalador do Android. O sistema pede, na primeira
 * vez, a permissão "instalar apps desconhecidos" para o ELYSIUM-M — é o próprio Android que
 * mostra a tela; o app não tem como pular isso, e nem deveria.
 */
/** APKs de versões antigas largados no cache (cada um ~115 MB) — 07/10. */
function limparApksVelhos(): void {
  try {
    for (const item of Paths.cache.list()) {
      if (item instanceof File && /^elysium-m-.*\.apk$/.test(item.name)) {
        try { item.delete(); } catch { /* em uso: fica para a próxima */ }
      }
    }
  } catch { /* sem listar, sem limpar */ }
}

/** Para o botão Cancelar do cartão. */
let tarefaAtual: { cancel(): void } | null = null;
export function cancelarDownload(): void {
  try { tarefaAtual?.cancel(); } catch { /* já terminou */ }
  tarefaAtual = null;
}

/**
 * Resultado de abrir o instalador. Se ele INSTALAR, este processo morre e o app volta na
 * versão nova — então chegar aqui depois do instalador quer dizer que não instalou
 * (cancelado, "app não instalado", permissão de fontes desconhecidas negada).
 */
export type FimDoInstalador = 'nao-instalou';

export async function baixarEInstalar(
  pairing: Pairing,
  pacote: PacoteAtualizacao,
  aoProgresso?: (fracao: number) => void,
): Promise<FimDoInstalador> {
  limparApksVelhos();
  const destino = new File(Paths.cache, `elysium-m-${pacote.versao}.apk`);
  try { if (destino.exists) destino.delete(); } catch { /* sobrescreve */ }
  const tarefa = File.createDownloadTask(
    `http://${pairing.activeIp}:${pairing.port}/api/update/apk`,
    destino,
    {
      headers: { Authorization: `Bearer ${pairing.token}` },
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : pacote.tamanho;
        if (total > 0) aoProgresso?.(Math.min(bytesWritten / total, 1));
      },
    },
  );
  tarefaAtual = tarefa;
  let arquivo: File | null;
  try { arquivo = await tarefa.downloadAsync(); } finally { tarefaAtual = null; }
  if (!arquivo) throw new Error('o download foi cancelado');
  if (pacote.tamanho && arquivo.size !== pacote.tamanho) {
    try { arquivo.delete(); } catch { /* o cache se limpa */ }
    throw new Error('o APK chegou incompleto — tente de novo');
  }
  // Guarda as notas antes: depois do instalador, este processo nem existe mais.
  try { await AsyncStorage.setItem(CHAVE_NOVIDADES, JSON.stringify({ versao: pacote.versao, notas: notasLimpas(pacote.notas) })); } catch { /* só não mostra */ }
  // FLAG_GRANT_READ_URI_PERMISSION (1): o instalador do sistema precisa ler o arquivo do
  // nosso cache pelo content://, que é o único jeito permitido desde o Android 7.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: arquivo.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
  return 'nao-instalou';
}

/**
 * A tela "Instalar apps desconhecidos" do Android já no ELYSIUM-M — o motivo mais comum de
 * o instalador fechar sem instalar na primeira vez.
 */
export async function abrirPermissaoDeInstalar(): Promise<void> {
  const pacote = Application.applicationId ?? 'com.zak.elysium.m';
  try {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', { data: `package:${pacote}` });
  } catch {
    await IntentLauncher.startActivityAsync('android.settings.SECURITY_SETTINGS').catch(() => {});
  }
}
