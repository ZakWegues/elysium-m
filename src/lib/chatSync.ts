import { Pairing } from './pairing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callRpc } from './rpc';
import { chavePorPc } from './pcAtivo';
import {
  ChatSession, clearTombstones, listSessions, purgeDeleted, readTombstones, replaceAll,
} from './chatHistoryStore';

/**
 * Sincronização das conversas com o PC.
 *
 * ## Quem manda
 *
 * O PC é a autoridade. O celular empurra o que mudou, o PC aplica a regra de retenção
 * (40 não favoritadas + favoritas), e o celular adota a lista devolvida. Se os dois
 * lados podassem por conta própria, cada um devolveria ao outro exatamente o que o
 * outro acabou de apagar, e conversa apagada reapareceria sozinha.
 *
 * ## Conflito
 *
 * Vence quem tem `updatedAt` maior, decidido no PC. Para um usuário com dois
 * aparelhos, isso cobre o caso real — mexer no celular depois de mexer no PC — sem a
 * complexidade de relógios vetoriais.
 *
 * ## Exclusão nos DOIS sentidos
 *
 * Lápide dos dois lados, não de um só. Daqui para o PC, os `chat.delete` vão antes dos
 * `chat.save` e o registro local só é limpo depois do sucesso. Do PC para cá, o
 * `chat.list` devolve `deleted` — os ids que ele apagou — e o `chat.ackDeleted` é a
 * confirmação que solta a lápide de lá. Enquanto ela está de pé, o PC RECUSA o
 * `chat.save` daquele id: é isso que impede a conversa de ressuscitar no passo 2, um
 * passo antes de este aparelho descobrir que ela morreu.
 *
 * ## Offline
 *
 * A cópia local continua sendo a fonte da tela. Sem rede, tudo funciona e as
 * alterações ficam guardadas até a próxima sincronização bem-sucedida.
 */

export type SyncResult =
  | { status: 'synced'; sessions: ChatSession[]; pushed: number; deleted: number }
  | { status: 'offline' };

/** Uma sincronização por vez: duas em paralelo empurrariam o mesmo estado duas vezes. */
let inFlight: Promise<SyncResult> | null = null;

export function syncChats(pairing: Pairing): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = run(pairing).finally(() => { inFlight = null; });
  return inFlight;
}

const CHAVE_SINCRONIZADAS = () => chavePorPc('elysium_chat_sincronizadas');
/** Renomear e favoritar não sobem o `updatedAt`: entram na marca. */
const marcaDaConversa = (s: Pick<ChatSession, 'updatedAt' | 'favorite' | 'title' | 'messages'>) => `${s.updatedAt}|${s.favorite ? 1 : 0}|${s.title}|${s.messages.length}`;
async function lerSincronizadas(): Promise<Record<string, string>> {
  try { return JSON.parse(await AsyncStorage.getItem(CHAVE_SINCRONIZADAS()) ?? '{}') as Record<string, string>; } catch { return {}; }
}

async function run(pairing: Pairing): Promise<SyncResult> {
  try {
    // 1. Exclusões primeiro. Se fossem depois do envio, uma conversa apagada aqui
    //    seria reenviada ao PC e só então apagada — trabalho perdido e uma janela em
    //    que ela reapareceria.
    const tombstones = await readTombstones();
    const confirmed: string[] = [];
    for (const id of tombstones) {
      // Apagada à mão aqui no celular (com a pergunta na tela): a confirmação já foi dada.
      await callRpc(pairing, 'chat.delete', { id }, { confirmed: true });
      confirmed.push(id);
    }
    if (confirmed.length > 0) await clearTombstones(confirmed);

    // 2. Empurra o que existe aqui. O PC resolve o conflito por `updatedAt`, então
    //    mandar uma versão velha é inofensivo: ele mantém a dele.
    const local = await listSessions();
    // 25/11: só o que mudou desde a última vez — com 40 conversas, mandar todas pesava.
    const ja = await lerSincronizadas();
    const mudaram = local.filter((s) => ja[s.id] !== marcaDaConversa(s));
    for (const session of mudaram) {
      await callRpc(pairing, 'chat.save', { session });
    }

    // 3. Adota o resultado, e aplica o que o PC apagou.
    const { sessions, deleted: apagadasNoPc } = await callRpc(pairing, 'chat.list');
    await replaceAll(sessions);
    await AsyncStorage.setItem(CHAVE_SINCRONIZADAS(), JSON.stringify(Object.fromEntries(sessions.map((s) => [s.id, marcaDaConversa(s)])))).catch(() => {});
    const aplicadas = await purgeDeleted(apagadasNoPc ?? []);

    // 4. Só agora o PC pode soltar a lápide dele. Confirmar antes de gravar deixaria uma
    //    janela em que o registro sumiu de lá e a conversa ainda existe aqui — e o
    //    próximo `chat.save` a ressuscitaria, que é exatamente o bug que a lápide evita.
    if (aplicadas.length > 0) {
      await callRpc(pairing, 'chat.ackDeleted', { ids: aplicadas });
    }

    return {
      status: 'synced', sessions, pushed: mudaram.length,
      deleted: confirmed.length + aplicadas.length,
    };
  } catch {
    // Sem rede ou PC fora do ar. A cópia local segue valendo e as exclusões continuam
    // registradas para a próxima tentativa.
    return { status: 'offline' };
  }
}
