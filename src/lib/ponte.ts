import { hmacSha256, utf8 } from './assinatura';
import type { Pairing } from './pairing';

/**
 * Fora de casa sem Tailscale (25/11, APK 2.15.0). O módulo nativo (`modules/ponte`) escuta em
 * 127.0.0.1, na mesma porta do PC, e leva tudo cifrado até a ponte do dono no Cloudflare. Para o resto
 * do app é só mais um endereço do PC, usado quando nenhum outro responde. As chaves saem do token do
 * aparelho: nada secreto viaja para cá.
 */
export const IP_DA_PONTE = '127.0.0.1';
export type InfoPonte = { url: string; sala: string };
type Nativo = {
  configurar(url: string, sala: string, psk: string, credencial: string, porta: number): void;
  esquecer(): void;
  estado(): { escutando: boolean; aberta: boolean; erro: string | null };
};

let modulo: Nativo | null | undefined;
/** Sob demanda, como em tls.ts: sem o módulo (APK antigo, prévia web, testes) é null. */
function nativo(): Nativo | null {
  if (modulo !== undefined) return modulo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    modulo = requireOptionalNativeModule<Nativo>('Ponte');
  } catch {
    modulo = null;
  }
  return modulo;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** O mesmo cálculo do PC (`segredosDoToken`). Pura. */
export function segredosDaPonte(token: string): { psk: string; credencial: string } {
  return { psk: hex(hmacSha256(utf8(token), utf8('ponte-psk'))), credencial: hex(hmacSha256(utf8(token), utf8('ponte-cel'))) };
}
/** O token deste aparelho, derivado do token do PC (o mesmo cálculo de `tokenDoAparelho`). Pura. */
export function tokenDoAparelho(mestre: string, id: string): string {
  return hex(hmacSha256(utf8(mestre), utf8(`aparelho:${id}`)));
}
/** Só uma ponte no Cloudflare do dono, e só aprendida do próprio PC já pareado. Pura. */
export function lerPonte(v: unknown): InfoPonte | null {
  const p = v as Partial<InfoPonte> | null;
  if (!p || typeof p.url !== 'string' || typeof p.sala !== 'string') return null;
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/.test(p.url) && /^[0-9a-f]{32}$/.test(p.sala) ? { url: p.url, sala: p.sala } : null;
}

/** Liga o lado nativo com o PC ativo. Barata: o nativo ignora a mesma configuração. */
export function prepararPonte(p: Pairing): void {
  const m = nativo();
  if (!m) return;
  try {
    if (!p.ponte) { m.esquecer(); return; }
    const s = segredosDaPonte(p.token);
    m.configurar(p.ponte.url, p.ponte.sala, s.psk, s.credencial, p.port);
  } catch { /* sem ponte nesta sessão */ }
}
export function ponteUtil(p: Pairing): boolean {
  const m = nativo();
  if (!m || !p.ponte) return false;
  prepararPonte(p);
  try { return m.estado().escutando; } catch { return false; }
}
