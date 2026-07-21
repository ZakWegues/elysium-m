import * as SecureStore from 'expo-secure-store';

export type Pairing = {
  ip: string;
  port: number;
  token: string;
};

const KEY = 'neuroaxis_pairing';

export async function loadPairing(): Promise<Pairing | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pairing;
  } catch {
    return null;
  }
}

export async function savePairing(pairing: Pairing): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pairing));
}

export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export function baseUrl(pairing: Pairing): string {
  return `http://${pairing.ip}:${pairing.port}`;
}

export function parsePairingQr(data: string): Pairing | null {
  try {
    const obj = JSON.parse(data);
    if (typeof obj.ip === 'string' && typeof obj.port === 'number' && typeof obj.token === 'string') {
      return { ip: obj.ip, port: obj.port, token: obj.token };
    }
    return null;
  } catch {
    return null;
  }
}
