import type { Rapidas } from './respostasRapidas';
import type { TelaDaMensagem } from './telas';
import { chavePorPc } from './pcAtivo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = () => chavePorPc('elysium_chat_sessions');
/** Ids apagados aqui que ainda não foram propagados ao PC. */
const TOMBSTONE_KEY = () => chavePorPc('elysium_chat_deleted');
const MAX_NON_FAVORITE_SESSIONS = 5;

export type Fonte = { titulo: string; url: string };
/** `fontes`: as páginas que a busca na web leu para essa resposta (bloco 131). */
/** `local` (fase 18): a nuvem falhou e quem respondeu foi o cérebro do PC — selo "modo local". */
export type StoredMessage = { id: string; from: 'me' | 'reply' | 'error'; text: string; ts: number; fontes?: Fonte[]; local?: boolean; /** 22/10: botões de resposta da última mensagem. */ rapidas?: Rapidas; sugestoes?: string[]; /** 22/10: id do pedido (a tela chega com ele) e a tela inteligente da resposta. */ pedidoId?: string; tela?: TelaDaMensagem };

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  /**
   * Nome dado à mão. Sem esta marca a próxima mensagem sobrescreveria o título com o
   * `deriveTitle` da primeira fala, e o renomear duraria até o usuário responder.
   */
  titleCustom?: boolean;
  messages: StoredMessage[];
};

async function readAll(): Promise<ChatSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY());
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

async function writeAll(sessions: ChatSession[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY(), JSON.stringify(sessions));
}

export async function listSessions(): Promise<ChatSession[]> {
  const sessions = await readAll();
  return sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deriveTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.from === 'me');
  if (!first) return 'Nova conversa';
  return first.text.length > 40 ? `${first.text.slice(0, 40)}...` : first.text;
}

export async function saveSession(session: ChatSession): Promise<void> {
  const sessions = await readAll();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index >= 0) {
    // O favorito guardado vence o que veio do chamador. A tela de chat carrega esse
    // valor uma vez e o mantém numa ref; favoritar pela tela de Conversas depois disso
    // deixava a ref velha, e a próxima mensagem desfazia o favorito sem ninguém pedir.
    //
    // O título dado à mão vence pelo mesmo motivo: a tela de chat manda sempre o
    // `deriveTitle`, e sem esta linha o renomear morreria na mensagem seguinte.
    const guardada = sessions[index];
    sessions[index] = {
      ...session,
      favorite: guardada.favorite,
      title: guardada.titleCustom ? guardada.title : session.title,
      titleCustom: guardada.titleCustom,
    };
  } else {
    sessions.push(session);
  }

  const favorites = sessions.filter((s) => s.favorite);
  const nonFavorites = sessions
    .filter((s) => !s.favorite)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_NON_FAVORITE_SESSIONS);

  await writeAll([...favorites, ...nonFavorites]);
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await readAll();
  await writeAll(sessions.filter((s) => s.id !== id));
  // Registra a exclusão: sem isso, a próxima sincronização baixaria a conversa de
  // volta do PC e ela reapareceria sozinha, como se a exclusão não tivesse funcionado.
  await addTombstone(id);
}

// ── sincronização com o PC ────────────────────────────────────────────────────

export async function readTombstones(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(TOMBSTONE_KEY());
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function addTombstone(id: string): Promise<void> {
  const ids = await readTombstones();
  if (!ids.includes(id)) await AsyncStorage.setItem(TOMBSTONE_KEY(), JSON.stringify([...ids, id]));
}

/** Chamado depois que o PC confirmou as exclusões. */
export async function clearTombstones(ids: string[]): Promise<void> {
  const remaining = (await readTombstones()).filter((id) => !ids.includes(id));
  await AsyncStorage.setItem(TOMBSTONE_KEY(), JSON.stringify(remaining));
}

/**
 * Substitui a cópia local pela lista do PC.
 *
 * O PC é a autoridade sobre o que fica guardado: ele aplica a poda e devolve o
 * resultado. Se cada lado podasse por conta própria, um mandaria de volta ao outro o
 * que o outro acabou de apagar.
 */
export async function replaceAll(sessions: ChatSession[]): Promise<void> {
  await writeAll(sessions);
}

/**
 * Renomear NÃO sobe o `updatedAt`: ele é o critério de conflito da sincronização e a
 * ordem da lista. Trocar o nome não é atividade nova na conversa.
 */
export async function renameSession(id: string, title: string): Promise<void> {
  const limpo = title.trim().slice(0, 60);
  if (!limpo) return;
  const sessions = await readAll();
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  session.title = limpo;
  session.titleCustom = true;
  await writeAll(sessions);
}

/**
 * 🔴 APLICA AS EXCLUSÕES FEITAS NO PC.
 *
 * O outro sentido da lápide. O `chat.list` devolve os ids que o PC apagou; aqui eles
 * saem da cópia local. Adotar só a lista devolvida quase bastaria — mas quase: a tela de
 * chat pode ter a conversa aberta em memória e regravá-la logo depois, e a lápide do PC
 * só é liberada pelo `chat.ackDeleted`, que o sync manda depois desta função.
 */
export async function purgeDeleted(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const alvo = new Set(ids);
  const sessions = await readAll();
  await writeAll(sessions.filter((s) => !alvo.has(s.id)));
  // As lápides locais desses ids também saem: o PC já os apagou, não há o que propagar.
  await clearTombstones(ids);
  return ids;
}

export async function toggleFavorite(id: string): Promise<void> {
  const sessions = await readAll();
  const session = sessions.find((s) => s.id === id);
  if (session) session.favorite = !session.favorite;
  await writeAll(sessions);
}
