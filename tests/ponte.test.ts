import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { lerPonte, segredosDaPonte, tokenDoAparelho } from '../src/lib/ponte';
import { baseUrl, primeiroCaminho } from '../src/lib/pairing';

const TOKEN = 'a1b2'.repeat(16);
const hmac = (chave: string, texto: string) => crypto.createHmac('sha256', chave).update(texto).digest('hex');

describe('a ponte no celular (25/11)', () => {
  it('as chaves e o token do aparelho batem com as contas do PC', () => {
    expect(segredosDaPonte(TOKEN)).toEqual({ psk: hmac(TOKEN, 'ponte-psk'), credencial: hmac(TOKEN, 'ponte-cel') });
    expect(tokenDoAparelho(TOKEN, '0011223344556677')).toBe(hmac(TOKEN, 'aparelho:0011223344556677'));
  });

  it('só aceita ponte no workers.dev com sala válida', () => {
    const sala = 'ab'.repeat(16);
    expect(lerPonte({ url: 'https://elysium-ponte.x-1.workers.dev', sala })).not.toBeNull();
    for (const url of ['http://a.workers.dev', 'https://a.workers.dev.mau.com', 'https://mau.com/a.workers.dev', 'https://a.workers.dev/x']) expect(lerPonte({ url, sala })).toBeNull();
    expect(lerPonte({ url: 'https://a.b.workers.dev', sala: 'curta' })).toBeNull();
    expect(lerPonte(null)).toBeNull();
  });

  it('pela ponte o endereço é local e sem o TLS do PC', () => {
    const p = { endpoints: ['192.168.0.2'], activeIp: '127.0.0.1', port: 4200, token: TOKEN, tls: { porta: 4201, sha256: 'a'.repeat(64) } };
    expect(baseUrl(p)).toBe('http://127.0.0.1:4200');
  });

  it('o caminho direto ganha se vier logo; senão, o primeiro que der certo', async () => {
    const em = (ms: number, v: string | null) => new Promise<string | null>((r) => setTimeout(() => r(v), ms));
    expect(await primeiroCaminho(em(30, 'casa'), em(1, 'ponte'), 100)).toBe('casa');
    expect(await primeiroCaminho(em(300, 'casa'), em(1, 'ponte'), 30)).toBe('ponte');
    expect(await primeiroCaminho(em(10, null), em(60, 'ponte'), 30)).toBe('ponte');
    expect(await primeiroCaminho(em(60, 'casa'), em(1, null), 10)).toBe('casa');
    expect(await primeiroCaminho(em(10, null), em(10, null), 5)).toBeNull();
  });

  it('token recusado no caminho direto não fica escondido atrás da ponte', async () => {
    await expect(primeiroCaminho(Promise.reject(new Error('401')), Promise.resolve(null), 50)).rejects.toThrow('401');
  });
});
