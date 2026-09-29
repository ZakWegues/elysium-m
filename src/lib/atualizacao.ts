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

/** O APK que o PC tem, se for mais novo que o instalado e já estiver inteiro no PC. */
export async function apkNovo(pairing: Pairing, verificar = false): Promise<PacoteAtualizacao | null> {
  const r = await callRpc(pairing, 'update.status', verificar ? { verificar: true } : {});
  const cel = r.celular;
  if (!cel?.pronto) return null;
  return compararVersoes(cel.versao, versaoInstalada()) > 0 ? cel : null;
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
export async function baixarEInstalar(
  pairing: Pairing,
  pacote: PacoteAtualizacao,
  aoProgresso?: (fracao: number) => void,
): Promise<void> {
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
  const arquivo = await tarefa.downloadAsync();
  if (!arquivo) throw new Error('o download foi cancelado');
  if (pacote.tamanho && arquivo.size !== pacote.tamanho) {
    try { arquivo.delete(); } catch { /* o cache se limpa */ }
    throw new Error('o APK chegou incompleto — tente de novo');
  }
  // FLAG_GRANT_READ_URI_PERMISSION (1): o instalador do sistema precisa ler o arquivo do
  // nosso cache pelo content://, que é o único jeito permitido desde o Android 7.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: arquivo.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}
