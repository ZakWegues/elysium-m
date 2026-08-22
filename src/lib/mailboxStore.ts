import AsyncStorage from '@react-native-async-storage/async-storage';
import { MailboxMessage } from './mailbox';

const FAVORITES_KEY = 'elysium_mailbox_favorites';
const CACHE_KEY = 'elysium_mailbox_cache';

type Cache = { messages: MailboxMessage[] };

export async function loadFavorites(): Promise<Record<string, boolean>> {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function toggleFavorite(id: string): Promise<Record<string, boolean>> {
  const favorites = await loadFavorites();
  favorites[id] = !favorites[id];
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  return favorites;
}

export async function loadCache(): Promise<Cache> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return { messages: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { messages: [] };
  }
}

export async function saveCache(cache: Cache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

// ── Conversas da Caixa ────────────────────────────────────────────────────────
//
// O lado PC ganhou o mesmo modelo de sessões do lado da IA. As chaves antigas
// (`elysium_mailbox_cache`, `elysium_mailbox_favorites`) NÃO mudam de nome: renomear
// chave por OTA acorda o aparelho atualizado sem os dados que ele tinha. Chave nova é
// segura, e é o caminho usado aqui.

const SESSIONS_KEY = 'elysium_mailbox_sessions';
/** Ids apagados aqui que ainda não foram propagados ao PC. */
const TOMBSTONE_KEY = 'elysium_mailbox_deleted';
const ACTIVE_KEY = 'elysium_mailbox_active';

export type MailboxSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  count?: number;
};

export async function loadSessions(): Promise<MailboxSession[]> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const lista = JSON.parse(raw) as MailboxSession[];
    return lista.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Substitui a cópia local pela lista do PC.
 *
 * O PC é a autoridade sobre o que fica guardado: ele aplica a poda e devolve o
 * resultado. Se cada lado podasse por conta própria, um mandaria de volta ao outro o que
 * o outro acabou de apagar, e conversa apagada reapareceria sozinha.
 */
export async function replaceSessions(sessions: MailboxSession[]): Promise<void> {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/** Só a cópia local. Quem propaga ao PC é o `mailboxSync`. */
export async function saveSessionLocal(session: MailboxSession): Promise<void> {
  const sessions = await loadSessions();
  const i = sessions.findIndex(s => s.id === session.id);
  if (i >= 0) sessions[i] = session;
  else sessions.push(session);
  await replaceSessions(sessions);
}

/** Sufixo aleatório pelo mesmo motivo do lado da IA: dois aparelhos, mesmo milissegundo. */
export function newMailboxSessionId(): string {
  const sufixo = Math.random().toString(16).slice(2, 8);
  return `mbox-${Date.now()}-${sufixo}`;
}

export async function deleteSessionLocal(id: string): Promise<void> {
  const sessions = await loadSessions();
  await replaceSessions(sessions.filter(s => s.id !== id));
  // 🔴 LÁPIDE. Sem registrar a exclusão, a próxima sincronização baixaria a conversa de
  // volta do PC e ela reapareceria sozinha, como se o botão não tivesse funcionado.
  await addTombstone(id);
  // Os recados dela também saem do cache local: senão o histórico offline continuaria
  // mostrando conteúdo de uma conversa que já não existe.
  const cache = await loadCache();
  await saveCache({ messages: cache.messages.filter(m => m.sessionId !== id) });
  if ((await getActiveSessionId()) === id) await setActiveSessionId(null);
}

export async function readTombstones(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function addTombstone(id: string): Promise<void> {
  const ids = await readTombstones();
  if (!ids.includes(id)) await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...ids, id]));
}

/** Chamado depois que o PC confirmou as exclusões. */
export async function clearTombstones(ids: string[]): Promise<void> {
  const restantes = (await readTombstones()).filter(id => !ids.includes(id));
  await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(restantes));
}

/**
 * 🔴 APLICA AS EXCLUSÕES FEITAS NO PC.
 *
 * O outro sentido da lápide. O `mailbox.sessions.list` devolve os ids que o PC apagou;
 * aqui eles saem da cópia local — sessão, recados em cache e a conversa ativa. Adotar a
 * lista devolvida sozinha não bastava: o cache de mensagens e o `activeSessionId` não
 * moram nela, e o histórico offline continuaria mostrando recados de conversa morta.
 */
export async function purgeDeleted(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const alvo = new Set(ids);
  const sessions = await loadSessions();
  await replaceSessions(sessions.filter(s => !alvo.has(s.id)));

  const cache = await loadCache();
  await saveCache({ messages: cache.messages.filter(m => !alvo.has(m.sessionId ?? '')) });

  const ativa = await getActiveSessionId();
  if (ativa && alvo.has(ativa)) await setActiveSessionId(null);

  // As lápides locais desses ids também saem: o PC já os apagou, não há o que propagar.
  await clearTombstones(ids);
  return ids;
}

export async function getActiveSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

export async function setActiveSessionId(id: string | null): Promise<void> {
  if (id) await AsyncStorage.setItem(ACTIVE_KEY, id);
  else await AsyncStorage.removeItem(ACTIVE_KEY);
}
