import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ AppState: { currentState: 'background' }, Linking: { openURL: async () => {} }, ToastAndroid: { show() {} } }));

import { abrirDaResposta, alvoDoRef, lerAlvo, tratarEntregaDeAbrir } from '../src/lib/abrirNoCelular';

describe('abrir no celular (23/11)', () => {
  it('só passa https, Spotify, pacote e telas conhecidas', () => {
    expect(lerAlvo({ rotulo: 'YouTube', pacote: 'com.google.android.youtube', reserva: 'https://www.youtube.com' })).toMatchObject({ pacote: 'com.google.android.youtube' });
    expect(lerAlvo({ rotulo: 'x', url: 'spotify:track:abc' })?.url).toBe('spotify:track:abc');
    expect(lerAlvo({ rotulo: 'x', url: 'file:///sdcard/x' })).toBe(null);
    expect(lerAlvo({ rotulo: 'x', url: 'intent://x' })).toBe(null);
    expect(lerAlvo({ rotulo: 'x', acao: 'android.intent.action.CALL' })).toBe(null);
    expect(lerAlvo({ rotulo: 'x', acao: 'android.media.action.STILL_IMAGE_CAMERA' })?.acao).toBeTruthy();
    expect(lerAlvo('lixo')).toBe(null);
  });

  it('o ref vai e volta, com acento', () => {
    let visto: [string, string] | null = null;
    abrirDaResposta({ rotulo: 'a câmera', acao: 'android.media.action.STILL_IMAGE_CAMERA' }, (t, r) => { visto = [t, r]; });
    expect(visto![0]).toBe('Abrir a câmera');
    expect(alvoDoRef(visto![1])).toMatchObject({ rotulo: 'a câmera' });
    expect(alvoDoRef('tela:abc')).toBe(null);
    expect(alvoDoRef('abrir:@@@@')).toBe(null);
  });

  it('no fundo avisa; velha não abre', () => {
    const ref = `abrir:${Buffer.from(JSON.stringify({ rotulo: 'x', url: 'https://a.b' })).toString('base64url')}`;
    expect(tratarEntregaDeAbrir(ref, Date.now())).toBe('avisar');
    expect(tratarEntregaDeAbrir(ref, Date.now() - 10 * 60_000)).toBe('velha');
    expect(tratarEntregaDeAbrir('tela:x', Date.now())).toBe(null);
  });
});
