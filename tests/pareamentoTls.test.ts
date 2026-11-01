import { describe, expect, it, vi } from 'vitest';

// 31/10: o TLS fixado tem que sobreviver a gravar e ler o pareamento (antes o migrate() o descartava
// e o app refazia a fixação a cada abertura).
const cofre = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => cofre.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { cofre.set(k, v); },
  deleteItemAsync: async (k: string) => { cofre.delete(k); },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));

const { loadPairing, savePairing } = await import('../src/lib/pairing');

describe('pareamento com TLS', () => {
  it('guarda e devolve a porta e a impressão do certificado', async () => {
    const sha = 'ab'.repeat(32);
    await savePairing({ endpoints: ['192.168.0.10'], activeIp: '192.168.0.10', port: 4200, token: 't'.repeat(64), hostname: 'PC', tls: { porta: 4201, sha256: sha } });
    expect((await loadPairing())?.tls).toEqual({ porta: 4201, sha256: sha });
  });

  it('impressão inválida é descartada', async () => {
    await savePairing({ endpoints: ['192.168.0.11'], activeIp: '192.168.0.11', port: 4200, token: 'u'.repeat(64), hostname: 'PC2', tls: { porta: 4201, sha256: 'xyz' } });
    expect((await loadPairing())?.tls).toBeUndefined();
  });
});
