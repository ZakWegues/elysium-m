import { Pairing } from './pairing';
import { callRpc } from './rpc';
import {
  clearTombstones, loadSessions, MailboxSession, readTombstones, replaceSessions,
} from './mailboxStore';

/**
 * Sincronização das conversas da Caixa (lado PC do switch) com o computador.
 *
 * É deliberadamente o MESMO desenho do `chatSync.ts`, e não uma sincronização nova. O
 * usuário aprende a regra uma vez e ela vale nos dois lados; e o desenho já sobreviveu
 * aos dois bugs que valem lembrar (conversa apagada voltando, e cada lado podando por
 * conta própria).
 *
 * ## Quem manda
 *
 * O PC é a autoridade. O celular empurra o que mudou, o PC aplica a retenção (5 não
 * favoritadas + favoritas ilimitadas) e devolve a lista; o celular adota o resultado.
 *
 * ## O que sincroniza, e o que não
 *
 * Só os METADADOS das conversas. Os recados em si nunca moraram aqui: eles são gravados
 * no PC pelo `POST /api/mailbox/messages` e lidos de volta pelo `GET`. O cache local de
 * mensagens continua existindo para a tela funcionar offline, mas não é fonte de verdade.
 *
 * ## Conflito
 *
 * Vence quem tem `updatedAt` maior, decidido no PC (`mergeMailboxSession`). O `createdAt`
 * guardado é preservado — o celular pode não saber quando a conversa nasceu.
 *
 * ## Offline
 *
 * A cópia local é a fonte da tela. Sem rede tudo funciona; alterações e exclusões esperam
 * a próxima sincronização.
 */

export type MailboxSyncResult =
  | { status: 'synced'; sessions: MailboxSession[]; pushed: number; deleted: number }
  | { status: 'offline' };

/** Uma sincronização por vez: duas em paralelo empurrariam o mesmo estado duas vezes. */
let inFlight: Promise<MailboxSyncResult> | null = null;

export function syncMailboxSessions(pairing: Pairing): Promise<MailboxSyncResult> {
  if (inFlight) return inFlight;
  inFlight = run(pairing).finally(() => { inFlight = null; });
  return inFlight;
}

async function run(pairing: Pairing): Promise<MailboxSyncResult> {
  try {
    // 1. Exclusões primeiro. Se fossem depois do envio, uma conversa apagada aqui seria
    //    reenviada ao PC e só então apagada — trabalho perdido e uma janela em que ela
    //    reapareceria na tela.
    //
    //    🔴 `mailbox.sessions.delete` é DESTRUTIVO no desktop (apaga recados e anexos do
    //    disco). O `confirmed` aqui é o repasse da confirmação que a tela já pediu ao
    //    apagar; sem ele o PC responde 403 e a lápide nunca sairia da fila.
    const tombstones = await readTombstones();
    const confirmados: string[] = [];
    for (const id of tombstones) {
      await callRpc(pairing, 'mailbox.sessions.delete', { id }, { confirmed: true });
      confirmados.push(id);
    }
    if (confirmados.length > 0) await clearTombstones(confirmados);

    // 2. Empurra o que existe aqui. O PC resolve o conflito por `updatedAt`, então mandar
    //    uma versão velha é inofensivo: ele mantém a dele.
    const locais = await loadSessions();
    for (const s of locais) {
      await callRpc(pairing, 'mailbox.sessions.save', {
        session: {
          id: s.id, title: s.title, createdAt: s.createdAt,
          updatedAt: s.updatedAt, favorite: s.favorite,
        },
      });
    }

    // 3. Adota o resultado.
    const { sessions } = await callRpc(pairing, 'mailbox.sessions.list');
    await replaceSessions(sessions);

    return { status: 'synced', sessions, pushed: locais.length, deleted: confirmados.length };
  } catch {
    // Sem rede ou PC fora do ar. A cópia local segue valendo e as exclusões continuam
    // registradas para a próxima tentativa.
    return { status: 'offline' };
  }
}
