import * as SecureStore from 'expo-secure-store';
import { fetchWithTimeout, PROBE_TIMEOUT_MS } from './http';

/**
 * O pareamento guarda VÁRIOS endereços do mesmo PC, não um só.
 *
 * Antes era `{ip, port, token}` com o IP congelado no momento do QR. Bastava o
 * roteador redistribuir o DHCP para o app parar de achar o PC, sem nenhum caminho
 * de recuperação além de reparear. Agora o QR traz todos os IPv4 da máquina —
 * incluindo o do túnel (Tailscale/ZeroTier), que funciona fora de casa — e o app
 * corre todos até um responder.
 */
export type Pairing = {
  /** Candidatos, em ordem de preferência definida pelo desktop. */
  endpoints: string[];
  /** O que respondeu por último. baseUrl() usa este. */
  activeIp: string;
  port: number;
  token: string;
  hostname?: string;
};

const KEY = 'neuroaxis_pairing';

/** Formato antigo, ainda presente em quem já tinha pareado. */
type LegacyPairing = { ip: string; port: number; token: string };

function migrate(raw: unknown): Pairing | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<Pairing> & Partial<LegacyPairing>;

  if (typeof obj.port !== 'number' || typeof obj.token !== 'string') return null;

  if (Array.isArray(obj.endpoints) && obj.endpoints.length > 0) {
    const endpoints = obj.endpoints.filter((e): e is string => typeof e === 'string');
    if (endpoints.length === 0) return null;
    return {
      endpoints,
      activeIp: typeof obj.activeIp === 'string' && endpoints.includes(obj.activeIp)
        ? obj.activeIp
        : endpoints[0],
      port: obj.port,
      token: obj.token,
      hostname: typeof obj.hostname === 'string' ? obj.hostname : undefined,
    };
  }

  // v1 → v2: um IP vira uma lista de um.
  if (typeof obj.ip === 'string') {
    return { endpoints: [obj.ip], activeIp: obj.ip, port: obj.port, token: obj.token };
  }

  return null;
}

export async function loadPairing(): Promise<Pairing | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
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
  return `http://${pairing.activeIp}:${pairing.port}`;
}

export function baseUrlFor(ip: string, port: number): string {
  return `http://${ip}:${port}`;
}

export function parsePairingQr(data: string): Pairing | null {
  try {
    const obj = JSON.parse(data);
    if (typeof obj.port !== 'number' || typeof obj.token !== 'string') return null;

    const fromList: string[] = Array.isArray(obj.endpoints)
      ? obj.endpoints.filter((e: unknown): e is string => typeof e === 'string')
      : [];
    // `ip` continua no payload v2 por compatibilidade; serve de fallback se um
    // desktop antigo (v1) gerou o QR.
    const endpoints = fromList.length > 0
      ? fromList
      : (typeof obj.ip === 'string' ? [obj.ip] : []);

    if (endpoints.length === 0) return null;

    return {
      endpoints,
      activeIp: endpoints[0],
      port: obj.port,
      token: obj.token,
      hostname: typeof obj.hostname === 'string' ? obj.hostname : undefined,
    };
  } catch {
    return null;
  }
}

// ── descoberta ────────────────────────────────────────────────────────────────

async function probe(ip: string, port: number, token: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrlFor(ip, port)}/api/health`,
    { headers: { Authorization: `Bearer ${token}` } },
    PROBE_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`health ${res.status}`);
  return ip;
}

/**
 * Corre todos os endpoints em paralelo e devolve o pareamento com `activeIp`
 * apontando pro primeiro que respondeu. `null` quando nenhum responde.
 *
 * Paralelo em vez de sequencial de propósito: sair de casa significa que o IP da
 * rede local vai dar timeout, e esperar 2,5s por candidato antes de tentar o túnel
 * deixaria a abertura do app lenta sem motivo.
 */
export async function resolveActiveEndpoint(pairing: Pairing): Promise<Pairing | null> {
  const ordered = [
    pairing.activeIp,
    ...pairing.endpoints.filter(ip => ip !== pairing.activeIp),
  ];

  const winner = await firstSuccess(ordered.map(ip => probe(ip, pairing.port, pairing.token)));
  if (!winner) return null;

  if (winner === pairing.activeIp) return pairing;
  const updated = { ...pairing, activeIp: winner };
  await savePairing(updated);
  return updated;
}

/**
 * Primeiro que resolver vence; `null` se todos falharem.
 *
 * Escrito à mão em vez de Promise.any porque o suporte a Promise.any no Hermes
 * varia por versão do runtime, e uma falha aqui derrubaria a conexão inteira.
 */
function firstSuccess(promises: Promise<string>[]): Promise<string | null> {
  if (promises.length === 0) return Promise.resolve(null);

  return new Promise(resolve => {
    let pending = promises.length;
    let settled = false;

    for (const p of promises) {
      p.then(
        value => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        () => {
          pending -= 1;
          if (pending === 0 && !settled) {
            settled = true;
            resolve(null);
          }
        }
      );
    }
  });
}

/**
 * Último recurso quando nenhum endpoint conhecido responde: varre a /24 da rede
 * atual procurando um PC que aceite o nosso token.
 *
 * Só roda quando o usuário pede explicitamente — 254 requisições é barulho de rede
 * que ninguém quer disparado sozinho a cada abertura de app.
 */
export async function scanSubnet(
  pairing: Pairing,
  onProgress?: (done: number, total: number) => void
): Promise<string | null> {
  const seed = pairing.endpoints.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  if (!seed) return null;

  const prefix = seed.split('.').slice(0, 3).join('.');
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);

  const BATCH = 32;
  let done = 0;

  for (let i = 0; i < hosts.length; i += BATCH) {
    const batch = hosts.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(ip => probe(ip, pairing.port, pairing.token))
    );
    done += batch.length;
    onProgress?.(Math.min(done, hosts.length), hosts.length);

    const hit = results.find(r => r.status === 'fulfilled');
    if (hit && hit.status === 'fulfilled') return hit.value;
  }

  return null;
}
