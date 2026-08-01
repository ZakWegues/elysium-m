/**
 * Fila de comandos digitados sem conexão.
 *
 * Sem isso, mandar uma mensagem com o PC desligado simplesmente falha e o texto se
 * perde. Com a fila, o comando fica guardado e é reenviado sozinho quando o PC volta —
 * o que importa porque metade dos comandos ("abre o Spotify", "toca lofi") continua
 * fazendo sentido alguns minutos depois.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pairing } from './pairing';
import { sendCommand } from './api';

const KEY = 'neuroaxis_command_queue';
/** Comando velho demais provavelmente não faz mais sentido executar. */
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ITEMS = 20;

export type QueuedCommand = {
  id: string;
  text: string;
  queuedAt: number;
};

export async function listQueue(): Promise<QueuedCommand[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as QueuedCommand[];
    if (!Array.isArray(items)) return [];
    const now = Date.now();
    return items.filter(i => i && typeof i.text === 'string' && now - i.queuedAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedCommand[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
}

export async function enqueueCommand(text: string): Promise<QueuedCommand> {
  const item: QueuedCommand = { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, queuedAt: Date.now() };
  const items = await listQueue();
  await writeQueue([...items, item]);
  return item;
}

export async function removeFromQueue(id: string): Promise<void> {
  const items = await listQueue();
  await writeQueue(items.filter(i => i.id !== id));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Reenvia tudo que está na fila, na ordem original.
 *
 * Para no primeiro erro de rede em vez de continuar: se o PC caiu de novo, insistir
 * nos itens seguintes só produz uma cascata de falhas e esvazia a fila à toa.
 */
export async function flushQueue(
  pairing: Pairing,
  onResult: (item: QueuedCommand, reply: string | null, error?: string) => void
): Promise<number> {
  const items = await listQueue();
  let sent = 0;

  for (const item of items) {
    try {
      const reply = await sendCommand(pairing, item.text);
      await removeFromQueue(item.id);
      onResult(item, reply);
      sent += 1;
    } catch (err) {
      onResult(item, null, err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return sent;
}
