import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'neuroaxis_chat_sessions';
const MAX_NON_FAVORITE_SESSIONS = 5;

export type StoredMessage = { id: string; from: 'me' | 'reply' | 'error'; text: string; ts: number };

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  messages: StoredMessage[];
};

async function readAll(): Promise<ChatSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

async function writeAll(sessions: ChatSession[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
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
    sessions[index] = { ...session, favorite: sessions[index].favorite };
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
}

export async function toggleFavorite(id: string): Promise<void> {
  const sessions = await readAll();
  const session = sessions.find((s) => s.id === id);
  if (session) session.favorite = !session.favorite;
  await writeAll(sessions);
}
