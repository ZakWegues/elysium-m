import { describe, expect, it } from 'vitest';
import { contraste, paletaMinimal, resolverFamiliaEscolhida } from '../src/theme/palettes';

describe('tema Minimal (20/10)', () => {
  it('claro ou escuro conforme o aparelho, sem decoração', () => {
    const claro = paletaMinimal(false, null);
    expect(claro.minimal).toBe(true);
    expect(claro.familia).toBe('lg');
    expect(claro.background).toBe('#FFFFFF');
    expect(claro.glassSurface).toBe(claro.surface);
    const escuro = paletaMinimal(true, null);
    expect(escuro.familia).toBe('ely');
    expect(escuro.blurTint).toBe('dark');
  });

  it('usa a cor do sistema quando há, e ela sempre lê sobre o fundo', () => {
    expect(paletaMinimal(false, '#0078d4').primary).toBe('#0078d4');
    expect(contraste(paletaMinimal(false, '#ffee00').primary, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contraste(paletaMinimal(true, '#001040').primary, '#101012')).toBeGreaterThanOrEqual(3);
  });

  it('texto legível nos botões e no fundo', () => {
    for (const escuro of [false, true]) {
      for (const d of [null, '#0078d4', '#ffee00']) {
        const p = paletaMinimal(escuro, d);
        expect(contraste(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('a escolha "minimal" sobrevive no disco', () => {
    expect(resolverFamiliaEscolhida('minimal')).toBe('minimal');
  });
});
