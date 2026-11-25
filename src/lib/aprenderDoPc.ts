import type { Pairing } from './pairing';
import { lerPonte, tokenDoAparelho } from './ponte';
import { callRpc } from './rpc';

async function nomeDoAparelho(): Promise<string> {
  try { return (await import('expo-device')).modelName ?? 'Celular'; } catch { return 'Celular'; }
}

/** Adota o token deste aparelho (uma vez) e aprende onde fica a ponte. Devolve o mesmo objeto se nada mudou. */
export async function aprenderDoPc(p: Pairing): Promise<Pairing> {
  let novo = p;
  try {
    if (!p.aparelho) {
      const { id, proprio } = await callRpc(p, 'aparelho.adotar', { nome: await nomeDoAparelho() }, { timeoutMs: 6000 });
      if (/^[0-9a-f]{16}$/.test(id)) {
        // O QR novo já traz o token do aparelho: aí o PC só confirma o id.
        novo = { ...p, token: proprio ? p.token : tokenDoAparelho(p.token, id), aparelho: id };
      }
    }
    const { ponte } = await callRpc(novo, 'ponte.info', {}, { timeoutMs: 6000 });
    const info = lerPonte(ponte);
    if (info?.url !== novo.ponte?.url || info?.sala !== novo.ponte?.sala) novo = { ...novo, ponte: info ?? undefined };
  } catch { /* PC antigo: segue como estava */ }
  return novo;
}
