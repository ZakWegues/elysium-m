import AsyncStorage from '@react-native-async-storage/async-storage';
import { MailboxMessage } from './mailbox';

const FAVORITES_KEY = 'neuroaxis_mailbox_favorites';
const CACHE_KEY = 'neuroaxis_mailbox_cache';

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
