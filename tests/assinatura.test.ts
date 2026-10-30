import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { cabecalhoAssinado, caminhoDe, hmacSha256, sha256, utf8 } from '../src/lib/assinatura';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('assinatura dos pedidos (31/10)', () => {
  it('SHA-256 e HMAC batem com o node em vários tamanhos e com acento', () => {
    for (const t of ['', 'abc', 'é ç ã 🚀', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
      expect(hex(sha256(utf8(t)))).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
      expect(hex(hmacSha256(utf8('k'.repeat(64)), utf8(t)))).toBe(createHmac('sha256', 'k'.repeat(64)).update(t).digest('hex'));
    }
    expect(hex(hmacSha256(utf8('c'.repeat(100)), utf8('msg')))).toBe(createHmac('sha256', 'c'.repeat(100)).update('msg').digest('hex'));
  });
  it('caminho com query, sem a origem', () => {
    expect(caminhoDe('http://192.168.0.5:4200/api/ui/foto?q=a%20b')).toBe('/api/ui/foto?q=a%20b');
    expect(caminhoDe('ws://100.64.1.2:4200/api/stream')).toBe('/api/stream');
  });
  it('o cabeçalho é a mesma conta do PC', () => {
    const token = 'f'.repeat(64);
    const h = cabecalhoAssinado(token, 'post', 'http://10.0.0.2:4200/api/rpc', 1_900_000_000_000)['X-Elysium-Assinatura'];
    const [v, s, nonce, mac] = h.split(':');
    expect(v).toBe('v1');
    expect(s).toBe('1900000000');
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(mac).toBe(createHmac('sha256', token).update(`POST\n/api/rpc\n1900000000\n${nonce}`).digest('hex'));
    expect(cabecalhoAssinado(token, 'GET', '/x')['X-Elysium-Assinatura'].split(':')[2]).not.toBe(nonce);
  });
});
