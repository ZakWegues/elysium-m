import * as SecureStore from 'expo-secure-store';
import { cabecalhoAssinado } from './assinatura';
import { fetchWithTimeout, PROBE_TIMEOUT_MS } from './http';
import { definirPcAtivo } from './pcAtivo';

/**
 * O token foi regenerado no PC, ou mudou, e este pareamento está inválido.
 * Diferente de "PC offline": o servidor respondeu 401, então a rede está boa.
 */
export class UnauthorizedError extends Error {
  constructor() { super('token inválido ou expirado — repareie o celular'); }
}

/** 26/10: o PC respondeu 429 — recusou tentativas demais deste IP e pausou por 10 min. */
export class BloqueadoError extends Error {
  constructor() { super('o PC pausou este celular por alguns minutos'); }
}

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

/**
 * 🔴 Esta chave e as irmãs dela (`elysium_chat_sessions`, `elysium_chat_deleted`,
 * `elysium_command_queue`, `elysium_mailbox_*`, `elysium_theme`, `elysium_color_scheme`)
 * só puderam ser renomeadas de `neuroaxis_*` porque a troca viajou no MESMO APK que mudou
 * o `android.package`. Pacote novo é um app novo para o Android: o armazenamento nasce
 * vazio, então não havia nada a perder.
 *
 * **Nunca renomeie uma destas por `npm run update`.** Um OTA chega num app já instalado,
 * com dados dentro — e o app acordaria despareado, sem histórico e sem tema, sem nenhum
 * erro que explicasse o motivo.
 */
const KEY = 'elysium_pairing';

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

// ── Vários PCs (fase 13, bloco 121) ───────────────────────────────────────────
//
// O cofre guarda a lista e qual está ativo. A chave antiga ('elysium_pairing') continua
// gravada com o PC ATIVO: tudo que chamava loadPairing/savePairing segue igual, e um OTA
// revertido para uma versão sem o cofre ainda encontra um pareamento válido.

const KEY_COFRE = 'elysium_pairings_v1';
/** Teto: o SecureStore do Android não gosta de valor acima de ~2 KB. */
export const MAX_PCS = 5;

export type Cofre = { ativo: string; principal: string; pcs: Pairing[] };

/** Identidade do PC: o hostname (sobrevive a IP novo e a QR regenerado); sem ele, o 1º endereço. */
export function idDoPc(p: Pairing): string {
  return (p.hostname || `${p.endpoints[0]}:${p.port}`).toLowerCase();
}

/** Acrescenta ou atualiza (mesmo PC, token novo) e torna ativo. Pura, para teste. */
export function cofreCom(c: Cofre | null, p: Pairing): Cofre {
  const id = idDoPc(p);
  if (!c) return { ativo: id, principal: id, pcs: [p] };
  const outros = c.pcs.filter(x => idDoPc(x) !== id);
  return { ...c, ativo: id, pcs: [...outros, p].slice(-MAX_PCS) };
}

/** Tira um PC; se era o ativo, o próximo da lista assume. null = não sobrou nenhum. Pura. */
export function cofreSem(c: Cofre, id: string): Cofre | null {
  const pcs = c.pcs.filter(x => idDoPc(x) !== id);
  if (!pcs.length) return null;
  const ativo = c.ativo === id ? idDoPc(pcs[0]) : c.ativo;
  // O principal é quem usa as chaves sem sufixo; se ele saiu, o próximo herda (e os dados
  // sem sufixo, que eram dele, ficam para trás — esquecer um PC é esquecer o que era dele).
  const principal = pcs.some(x => idDoPc(x) === c.principal) ? c.principal : idDoPc(pcs[0]);
  return { ativo, principal, pcs };
}

export function pcAtivoDo(c: Cofre): Pairing {
  return c.pcs.find(x => idDoPc(x) === c.ativo) ?? c.pcs[0];
}

async function lerCofre(): Promise<Cofre | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_COFRE);
    if (raw) {
      const c = JSON.parse(raw) as Cofre;
      const pcs = (c.pcs ?? []).map(migrate).filter((x): x is Pairing => x !== null);
      if (pcs.length) return { ativo: c.ativo, principal: c.principal, pcs };
    }
  } catch { /* cofre ilegível: cai no pareamento antigo */ }
  // Primeira vez nesta versão: o pareamento de sempre vira o PC principal.
  try {
    const antigo = await SecureStore.getItemAsync(KEY);
    const p = antigo ? migrate(JSON.parse(antigo)) : null;
    return p ? cofreCom(null, p) : null;
  } catch { return null; }
}

async function gravarCofre(c: Cofre | null): Promise<void> {
  if (!c) {
    await SecureStore.deleteItemAsync(KEY_COFRE);
    await SecureStore.deleteItemAsync(KEY);
    definirPcAtivo('', true);
    return;
  }
  const ativo = pcAtivoDo(c);
  await SecureStore.setItemAsync(KEY_COFRE, JSON.stringify(c));
  await SecureStore.setItemAsync(KEY, JSON.stringify(ativo));
  definirPcAtivo(idDoPc(ativo), idDoPc(ativo) === c.principal);
}

/** O PC ativo — e já deixa as chaves do AsyncStorage apontando para ele. */
export async function loadPairing(): Promise<Pairing | null> {
  const c = await lerCofre();
  if (!c) return null;
  const ativo = pcAtivoDo(c);
  definirPcAtivo(idDoPc(ativo), idDoPc(ativo) === c.principal);
  return ativo;
}

/** Grava o PC (novo ou o mesmo com endereço/token novos) e o torna o ativo. */
export async function savePairing(pairing: Pairing): Promise<void> {
  await gravarCofre(cofreCom(await lerCofre(), pairing));
}

/**
 * 31/10: grava um endereço novo SÓ se esse PC ainda é o ativo. A sonda começa com um PC e
 * termina segundos depois — se no meio o Zak trocou de PC ou desapareou, gravar ali reativava
 * (ou ressuscitava) o PC antigo.
 */
export async function savePairingSeAtivo(pairing: Pairing): Promise<boolean> {
  const c = await lerCofre();
  if (!c || c.ativo !== idDoPc(pairing) || !c.pcs.some(x => idDoPc(x) === idDoPc(pairing))) return false;
  await gravarCofre(cofreCom(c, pairing));
  return true;
}

/** Esquece o PC ATIVO. Se houver outro, ele assume; senão, o app volta para o QR. */
export async function clearPairing(): Promise<void> {
  const c = await lerCofre();
  if (!c) { await gravarCofre(null); return; }
  await gravarCofre(cofreSem(c, c.ativo));
}

export async function listarPcs(): Promise<{ id: string; nome: string; ativo: boolean; principal: boolean }[]> {
  const c = await lerCofre();
  if (!c) return [];
  return c.pcs.map(p => ({ id: idDoPc(p), nome: p.hostname || p.endpoints[0], ativo: idDoPc(p) === c.ativo, principal: idDoPc(p) === c.principal }));
}

/** Troca o PC ativo; devolve o pareamento dele. */
export async function trocarPc(id: string): Promise<Pairing | null> {
  const c = await lerCofre();
  if (!c || !c.pcs.some(x => idDoPc(x) === id)) return null;
  const novo = { ...c, ativo: id };
  await gravarCofre(novo);
  return pcAtivoDo(novo);
}

export function baseUrl(pairing: Pairing): string {
  return `http://${pairing.activeIp}:${pairing.port}`;
}

export function baseUrlFor(ip: string, port: number): string {
  return `http://${ip}:${port}`;
}

/**
 * Fase 23.2 (blindagem): só endereço de rede privada — casa, Tailscale/ZeroTier, cabo. Um QR
 * falso (cartaz, print, página) apontando para um servidor na internet levaria o token, a voz
 * e as conversas para fora. Pura.
 */
export function enderecoPrivado(e: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(e);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if ([m[1], m[2], m[3], m[4]].some(x => Number(x) > 255)) return false;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254);
  }
  const v6 = e.toLowerCase();
  if (/^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(v6);
}

export function parsePairingQr(data: string): Pairing | null {
  try {
    if (data.length > 4096) return null;
    const obj = JSON.parse(data);
    if (typeof obj.port !== 'number' || typeof obj.token !== 'string') return null;
    // Fase 23.2: formato esperado e nada mais — porta de app, token só com letras/números.
    if (!Number.isInteger(obj.port) || obj.port < 1024 || obj.port > 65535) return null;
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(obj.token)) return null;
    if (obj.hostname !== undefined && (typeof obj.hostname !== 'string' || !/^[\w.-]{1,63}$/.test(obj.hostname))) return null;

    const fromList: string[] = Array.isArray(obj.endpoints)
      ? obj.endpoints.filter((e: unknown): e is string => typeof e === 'string' && enderecoPrivado(e)).slice(0, 8)
      : [];
    // `ip` continua no payload v2 por compatibilidade; serve de fallback se um
    // desktop antigo (v1) gerou o QR.
    const endpoints = fromList.length > 0
      ? fromList
      : (typeof obj.ip === 'string' && enderecoPrivado(obj.ip) ? [obj.ip] : []);

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

/** Sem token: o servidor do ELYSIUM responde 401 com `{"error":"Unauthorized"}` no /api/health. */
async function pareceElysium(ip: string, port: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrlFor(ip, port)}/api/health`, {}, PROBE_TIMEOUT_MS);
    if (res.status !== 401) return false;
    const corpo = await res.text();
    return corpo.length < 200 && corpo.includes('Unauthorized');
  } catch { return false; }
}

async function probe(ip: string, port: number, token: string, prazoMs = PROBE_TIMEOUT_MS): Promise<string> {
  const url = `${baseUrlFor(ip, port)}/api/health`;
  const res = await fetchWithTimeout(
    url,
    { headers: cabecalhoAssinado(token, 'GET', url) },
    prazoMs
  );
  // 401: o servidor está respondendo mas o token mudou. Isso é diferente de PC offline —
  // tentar outro endpoint não vai ajudar, e o usuário precisa de outra orientação.
  if (res.status === 401) throw new UnauthorizedError();
  // 26/10: 429 é o PC pausando este IP (recusas demais) — também não adianta tentar outro endereço.
  if (res.status === 429) throw new BloqueadoError();
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
 *
 * 🔴 Propaga `UnauthorizedError` imediatamente: se qualquer endpoint responde 401,
 * é o token que está errado — não adianta tentar os outros.
 */
export async function resolveActiveEndpoint(pairing: Pairing, prazoMs = PROBE_TIMEOUT_MS): Promise<Pairing | null> {
  const others = pairing.endpoints.filter(ip => ip !== pairing.activeIp);

  // O endereço atual é SEMPRE preferido quando responde, mesmo que outro responda
  // antes. Sem essa preferência, em casa — onde tanto a rede local quanto o túnel
  // funcionam — o vencedor mudava a cada verificação, e cada troca derrubava e
  // reabria o WebSocket de telemetria num laço sem fim.
  //
  // `currentOk` propaga UnauthorizedError: se o endereço atual devolve 401, já
  // sabemos que o token está inválido e não precisamos tentar os outros.
  const currentOk = probe(pairing.activeIp, pairing.port, pairing.token, prazoMs)
    .then(() => true, (err) => { if (err instanceof UnauthorizedError || err instanceof BloqueadoError) throw err; return false; });

  // Os outros correm em paralelo, não depois: fora de casa o endereço local vai dar
  // timeout, e esperar por ele antes de tentar o túnel deixaria a abertura do app
  // lenta à toa.
  const fallback = firstSuccess(others.map(ip => probe(ip, pairing.port, pairing.token, prazoMs)));

  if (await currentOk) return pairing;

  const winner = await fallback;
  if (!winner) return null;

  const updated = { ...pairing, activeIp: winner };
  // Grava só se ainda for o PC ativo; no pareamento novo (ainda fora do cofre) quem grava é
  // a tela de pareamento, com o endereço que respondeu.
  await savePairingSeAtivo(updated);
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
    // Fase 23.2: a varredura NÃO manda o token para os 254 vizinhos — primeiro pergunta sem
    // token (o ELYSIUM responde 401), e só quem parece ser o ELYSIUM recebe o token.
    const results = await Promise.allSettled(
      batch.map(async ip => { if (!(await pareceElysium(ip, pairing.port))) throw new Error('não é'); return probe(ip, pairing.port, pairing.token); })
    );
    done += batch.length;
    onProgress?.(Math.min(done, hosts.length), hosts.length);

    const hit = results.find(r => r.status === 'fulfilled');
    if (hit && hit.status === 'fulfilled') return hit.value;
  }

  return null;
}
