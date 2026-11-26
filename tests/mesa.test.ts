import { describe, expect, it, vi } from 'vitest';
import { getPalette, type Familia, type ThemeName } from '../src/theme/palettes';

vi.mock('expo-clipboard', () => ({ setStringAsync: async () => true, getStringAsync: async () => '' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
const chamadas: { m: string; p: unknown; o: unknown }[] = [];
vi.mock('../src/lib/rpc', () => ({ callRpc: async (_p: unknown, m: string, p: unknown, o: unknown) => { chamadas.push({ m, p, o }); return m === 'screen.screenshot' ? { message: 'ok' } : {}; } }));
vi.mock('../src/lib/telemetry', () => ({ openTelemetryStream: () => () => {} }));

const { acentoDaCapa, coresDosGrupos, ehNavegador, matiz, executarAtalho, layoutDaMesa, nomeCurto, posicaoAgora, teclaQueCabe, teclasDoAtalho, tempo } = await import('../src/lib/mesa');
const pc = { endpoints: ['192.168.0.2'], activeIp: '192.168.0.2', port: 4200, token: 't' };

describe('Modo Mesa (25/11)', () => {
  it('o relógio da música anda só tocando e para no fim', () => {
    const m = { pos: 10, posEm: 1_000, dur: 200, tocando: true };
    expect(posicaoAgora(m, 6_000)).toBe(15);
    expect(posicaoAgora({ ...m, tocando: false }, 60_000)).toBe(10);
    expect(posicaoAgora({ ...m, posEm: 0 }, 60_000)).toBe(10);
    expect(posicaoAgora(m, 10_000_000)).toBe(200);
  });

  it('tempo em m:ss e h:mm:ss', () => {
    expect(tempo(0)).toBe('0:00');
    expect(tempo(187.9)).toBe('3:07');
    expect(tempo(3729)).toBe('1:02:09');
  });

  it('o layout segue o jeito do celular', () => {
    expect(layoutDaMesa(390, 844)).toEqual({ deitado: false, colunas: 4 });
    expect(layoutDaMesa(844, 390)).toEqual({ deitado: true, colunas: 4 });
    // A página de 4 × 4 cabe inteira: deitado, a altura manda; em pé, quase quadrada.
    const d = teclaQueCabe(430, 300, 8);
    expect(d.lado * 4 + 24).toBeLessThanOrEqual(430);
    expect(d.alto * 4 + 24).toBeLessThanOrEqual(300);
    expect(teclaQueCabe(361, 0, 8)).toEqual({ lado: 84, alto: 72 });
    expect(ehNavegador('Chrome')).toBe(true);
    expect(ehNavegador('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')).toBe(false);
  });

  it('teclas de um atalho', () => {
    expect(teclasDoAtalho('Ctrl + Shift+Esc')).toEqual(['ctrl', 'shift', 'esc']);
    expect(teclasDoAtalho('a+'.repeat(20)).length).toBe(8);
  });

  it('cada atalho vira a chamada certa', async () => {
    chamadas.length = 0;
    await executarAtalho(pc, { id: '1', tipo: 'acao', rotulo: 'Bloquear', icone: 'lock', valor: 'bloquear' }, null);
    await executarAtalho(pc, { id: '2', tipo: 'acao', rotulo: 'Mic', icone: 'mic', valor: 'microfone' }, { volume: 50, mudo: false, micMudo: true });
    await executarAtalho(pc, { id: '3', tipo: 'teclas', rotulo: 'TM', icone: 'zap', valor: 'ctrl+shift+esc' }, null);
    await executarAtalho(pc, { id: '4', tipo: 'acao', rotulo: 'Área', icone: 'monitor', valor: 'area' }, null);
    expect(chamadas.map((c) => c.m)).toEqual(['power.control', 'microfone.mudo', 'input.combo', 'input.combo']);
    expect(chamadas[0]).toMatchObject({ p: { operation: 'lock' }, o: { confirmed: true } });
    expect(chamadas[1].p).toEqual({ mudo: false });
    expect(chamadas[2].p).toEqual({ keys: ['ctrl', 'shift', 'esc'] });
    expect(chamadas[3].p).toEqual({ keys: ['win', 'd'] });
  });

  it('cor da capa escura demais fica a do tema', () => {
    expect(acentoDaCapa('#000000', '#abc')).toBe('#abc');
    expect(acentoDaCapa('#ff6a3d', '#abc')).toBe('#ff6a3d');
    expect(acentoDaCapa('', '#abc')).toBe('#abc');
  });

  it('nome curto da saída de som', () => {
    expect(nomeCurto('SAMSUNG (NVIDIA High Definition Audio)')).toBe('SAMSUNG');
    expect(nomeCurto('Fones')).toBe('Fones');
  });
});

describe('Modo Mesa — cores das fileiras (26/11)', () => {
  it('quatro matizes afastados em todos os temas, e o Glass Âmbar não repete', () => {
    for (const f of ['dark', 'glass', 'stark'] as Familia[]) {
      for (const t of ['elisio', 'mare', 'crepusculo', 'neon'] as ThemeName[]) {
        const p = getPalette(t, f);
        const c = coresDosGrupos(p.primary, p.accent);
        expect(new Set(c).size).toBe(4);
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
          const d = Math.abs(matiz(c[i]) - matiz(c[j])) % 360;
          expect(Math.min(d, 360 - d), `${f}/${t}: ${c}`).toBeGreaterThanOrEqual(30);
        }
      }
    }
    const ambar = getPalette('elisio', 'glass');
    expect(coresDosGrupos(ambar.primary, ambar.accent)).not.toContain('#f2c14e');
  });
});
