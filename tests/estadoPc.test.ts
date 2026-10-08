import { describe, expect, it } from 'vitest';
import { descreverEstadoPc, detalhesEstadoPc, haQuanto, type EstadoAppPc, type EstadoPc } from '../src/lib/estadoPc';

const AGORA = new Date(2026, 9, 8, 20, 0).getTime();
const min = (n: number) => AGORA - n * 60_000;
const app = (x: Partial<EstadoAppPc> = {}): EstadoAppPc => ({
  janela: 'aberta', janelaDesde: min(10), bloqueado: false, bloqueadoDesde: null, ociosoMin: 0,
  iniciadoEm: min(120), pcLigadoDesde: min(300), versao: '2.5.0', anterior: null, ...x,
});
const est = (x: Partial<EstadoPc>): EstadoPc => ({ app: null, vistoEm: AGORA, encerrando: null, online: true, ...x });

describe('estado do PC no celular', () => {
  it('janela: em uso, aberta, minimizada, bandeja', () => {
    expect(descreverEstadoPc(est({ app: app({ janela: 'foco' }) }), AGORA).titulo).toBe('ELYSIUM aberto e em uso');
    expect(descreverEstadoPc(est({ app: app({ janela: 'minimizada' }) }), AGORA)).toMatchObject({ titulo: 'ELYSIUM minimizado', detalhe: 'há 10 min' });
    const b = descreverEstadoPc(est({ app: app({ janela: 'bandeja', ociosoMin: 25 }) }), AGORA);
    expect(b.titulo).toBe('ELYSIUM na bandeja');
    expect(b.detalhe).toContain('PC parado há 25 min');
  });
  it('tela bloqueada vem antes da janela', () => {
    expect(descreverEstadoPc(est({ app: app({ bloqueado: true, bloqueadoDesde: min(3) }) }), AGORA).titulo).toBe('Tela do PC bloqueada');
  });
  it('fora do ar com aviso: diz o motivo e quando', () => {
    const d = descreverEstadoPc(est({ online: false, app: app(), encerrando: { motivo: 'fechado', em: min(5) } }), AGORA);
    expect(d.titulo).toBe('ELYSIUM fechado no PC');
    expect(d.detalhe).toContain('há 5 min');
    expect(descreverEstadoPc(est({ online: false, encerrando: { motivo: 'suspenso', em: min(60) } }), AGORA).titulo).toBe('PC em suspensão');
  });
  it('fora do ar sem aviso: última vez visto e como estava', () => {
    const d = descreverEstadoPc(est({ online: false, vistoEm: min(7), app: app({ janela: 'bandeja' }) }), AGORA);
    expect(d.titulo).toBe('PC sem resposta');
    expect(d.detalhe).toBe('visto há 7 min · estava na bandeja');
  });
  it('detalhes: no ar desde, PC ligado, sessão anterior', () => {
    const l = detalhesEstadoPc(est({ app: app({ anterior: { motivo: 'fechado', em: min(150) } }) }), AGORA);
    expect(l.map(x => x.rotulo)).toEqual(['Janela', 'ELYSIUM no ar', 'PC ligado', 'Antes disso', 'Última resposta']);
    expect(l[3].valor).toMatch(/^fechado às /);
  });
  it('haQuanto', () => {
    expect(haQuanto(min(0), AGORA)).toBe('agora');
    expect(haQuanto(min(45), AGORA)).toBe('há 45 min');
    expect(haQuanto(min(130), AGORA)).toBe('há 2 h 10 min');
    expect(haQuanto(new Date(2026, 9, 7, 18, 40).getTime(), AGORA)).toMatch(/^desde ontem 18:40/);
  });
});
