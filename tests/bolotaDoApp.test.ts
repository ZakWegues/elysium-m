import { describe, expect, it } from 'vitest';
import { ehMarcaNoPc, limparResposta } from '../src/lib/bolotaDoApp';

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
});
