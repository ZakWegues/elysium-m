import { describe, expect, it } from 'vitest';
import { dentroDaTela, dentroDoCanto, ehMarcaNoPc, lerEstadoDaBolota, limparResposta } from '../src/lib/bolotaDoApp';

describe('bolota do celular (14/11)', () => {
  it('marcar na tela do PC só com PC/computador no pedido', () => {
    expect(ehMarcaNoPc('circula o YouTube no PC')).toBe(true);
    expect(ehMarcaNoPc('onde está o Gmail no computador?')).toBe(true);
    expect(ehMarcaNoPc('aponta o botão salvar na tela do pc')).toBe(true);
    expect(ehMarcaNoPc('circula o YouTube')).toBe(false);
    expect(ehMarcaNoPc('abre o spotify no pc')).toBe(false);
    expect(ehMarcaNoPc('que horas são')).toBe(false);
  });

  it('a resposta do balão sai sem Markdown cru', () => {
    expect(limparResposta('## Título\n**Negrito** aqui\n```\ncódigo\n```')).toBe('Título\nNegrito aqui\n\ncódigo');
    expect(limparResposta('')).toBe('');
  });

  it('guardar no canto: com folga, e só ali (23/11)', () => {
    const canto = { x: 10, y: 100, lado: 44 };
    expect(dentroDoCanto({ x: 32, y: 122 }, canto)).toBe(true);
    expect(dentroDoCanto({ x: 78, y: 122 }, canto)).toBe(true);
    expect(dentroDoCanto({ x: 90, y: 122 }, canto)).toBe(false);
    expect(dentroDoCanto({ x: 32, y: 300 }, canto)).toBe(false);
  });

  it('o estado guardado é conferido e o lugar cabe na tela', () => {
    expect(lerEstadoDaBolota('{"estado":"guardada","pos":{"x":5,"y":9}}')).toEqual({ estado: 'guardada', pos: { x: 5, y: 9 } });
    for (const v of [null, 'lixo', '{"estado":"x"}']) expect(lerEstadoDaBolota(v)).toEqual({ estado: 'solta', pos: null });
    expect(dentroDaTela({ x: 900, y: -5 }, 390, 844, 58)).toEqual({ x: 324, y: 60 });
  });
});
