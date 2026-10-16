import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
import { enderecoPrivado, parsePairingQr } from '../src/lib/pairing';

const TOKEN = 'a'.repeat(64);

describe('pareamento por QR (fase 23.2)', () => {
  it('aceita o QR do ELYSIUM com endereços de casa e do Tailscale', () => {
    const p = parsePairingQr(JSON.stringify({ endpoints: ['192.168.0.10', '100.101.102.103'], port: 4200, token: TOKEN, hostname: 'MEU-PC' }));
    expect(p?.endpoints).toEqual(['192.168.0.10', '100.101.102.103']);
  });
  it('joga fora endereço da internet e recusa QR sem nenhum privado', () => {
    expect(parsePairingQr(JSON.stringify({ endpoints: ['8.8.8.8', '192.168.0.10'], port: 4200, token: TOKEN }))?.endpoints).toEqual(['192.168.0.10']);
    expect(parsePairingQr(JSON.stringify({ endpoints: ['203.0.113.5'], port: 4200, token: TOKEN }))).toBeNull();
    expect(parsePairingQr(JSON.stringify({ endpoints: ['mal.example'], port: 4200, token: TOKEN }))).toBeNull();
  });
  it('porta, token e nome fora do formato são recusados', () => {
    expect(parsePairingQr(JSON.stringify({ endpoints: ['192.168.0.10'], port: 80, token: TOKEN }))).toBeNull();
    expect(parsePairingQr(JSON.stringify({ endpoints: ['192.168.0.10'], port: 4200, token: 'curto' }))).toBeNull();
    expect(parsePairingQr(JSON.stringify({ endpoints: ['192.168.0.10'], port: 4200, token: TOKEN, hostname: '<script>' }))).toBeNull();
    expect(parsePairingQr('x'.repeat(5000))).toBeNull();
  });
  it('faixas privadas', () => {
    for (const ok of ['10.0.0.1', '172.20.1.1', '192.168.1.1', '100.64.0.1', '169.254.3.3', 'fd7a:115c::1', 'pc.tail9.ts.net']) expect(enderecoPrivado(ok), ok).toBe(true);
    for (const ruim of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '256.1.1.1', 'exemplo.com']) expect(enderecoPrivado(ruim), ruim).toBe(false);
  });
});

describe('anexos e links (fase 23.2)', () => {
  it('APK e scripts vindos do PC não abrem direto', async () => {
    vi.doMock('expo-intent-launcher', () => ({ startActivityAsync: async () => ({}) }));
    vi.doMock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
    const { podeAbrirDireto } = await import('../src/lib/anexos');
    expect(podeAbrirDireto('app.apk', 'application/vnd.android.package-archive')).toBe(false);
    expect(podeAbrirDireto('foto.jpg', 'application/vnd.android.package-archive')).toBe(false);
    expect(podeAbrirDireto('x.html', 'text/html')).toBe(false);
    expect(podeAbrirDireto('foto.jpg', 'image/jpeg')).toBe(true);
    expect(podeAbrirDireto('nota.pdf', 'application/pdf')).toBe(true);
  });
  it('link só http(s)', async () => {
    vi.doMock('react-native', () => ({ Linking: { openURL: async () => {} } }));
    const { linkSeguro } = await import('../src/lib/abrirLink');
    expect(linkSeguro('https://youtu.be/x')).toBe(true);
    for (const ruim of ['intent://x#Intent;end', 'file:///sdcard/a', 'javascript:alert(1)', 'elysium://falar']) expect(linkSeguro(ruim), ruim).toBe(false);
  });
});
