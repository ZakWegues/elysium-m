export type ThemeName = 'default' | 'ocean' | 'ember' | 'forest';

/** Escolha do usuário. `system` acompanha o aparelho. */
export type ColorScheme = 'light' | 'dark' | 'system';

/** O que fica valendo depois de resolver `system`. */
export type ResolvedScheme = 'light' | 'dark';

export type Palette = {
  name: ThemeName;
  label: string;
  scheme: ResolvedScheme;
  primary: string;
  primarySoft: string;
  accent: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  onPrimary: string;
  error: string;
  errorSoft: string;
  success: string;
  // Vidro (estilo iOS "liquid glass") — translúcidos usados sobre BlurView.
  glassSurface: string;
  glassSurfaceStrong: string;
  glassBorder: string;
  glassBackdrop: string;
  /**
   * Brilho da aresta de cima do vidro, em duas paradas (opaca → transparente).
   *
   * Existe como token porque era literal: um branco fixo de 55% desenhado sobre a
   * superfície INTEIRA de todo card e botão de vidro. No claro passava despercebido; no
   * escuro cobria o app de uma névoa leitosa. Agora a intensidade vem do modo.
   */
  glassSheen: readonly [string, string];
  /** Tinta da BlurView: precisa acompanhar o modo, senão o vidro clareia o escuro. */
  blurTint: 'light' | 'dark';
};

/** Neutros do modo claro. */
const lightNeutrals = {
  scheme: 'light' as const,
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E4E7EC',
  text: '#14161A',
  textMuted: '#6B7280',
  onPrimary: '#FFFFFF',
  error: '#C0392B',
  errorSoft: '#F8D7DA',
  success: '#2E8B47',
  // Bem translúcidos de propósito — o blur por baixo é que dá corpo, não a tinta.
  glassSurface: 'rgba(255,255,255,0.18)',
  glassSurfaceStrong: 'rgba(255,255,255,0.34)',
  glassBorder: 'rgba(255,255,255,0.55)',
  glassBackdrop: 'rgba(18,20,24,0.28)',
  glassSheen: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'] as const,
  blurTint: 'light' as const,
};

/**
 * Neutros do modo escuro.
 *
 * Não é o claro invertido: o fundo é um azulado bem escuro em vez de preto puro, para
 * o vidro ter o que desfocar, e as bordas são brancos translúcidos em vez de cinza
 * sólido, senão viram linhas duras sobre superfície escura.
 */
const darkNeutrals = {
  scheme: 'dark' as const,
  background: '#0B0D12',
  surface: '#151922',
  surfaceRaised: '#1C2130',
  border: 'rgba(255,255,255,0.10)',
  text: '#EEF1F6',
  textMuted: '#9AA3B2',
  onPrimary: '#FFFFFF',
  error: '#FF6B6B',
  errorSoft: 'rgba(255,107,107,0.16)',
  success: '#4ADE80',
  // Mais encorpado que antes: quem dava volume aos cards no escuro era o véu branco que
  // saiu daqui. Sem isto, cartão de vidro sobre #0B0D12 fica invisível.
  glassSurface: 'rgba(255,255,255,0.10)',
  glassSurfaceStrong: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.20)',
  glassBackdrop: 'rgba(0,0,0,0.55)',
  // Um quinto do brilho do modo claro. Branco forte sobre superfície escura não lê como
  // reflexo, lê como sujeira.
  glassSheen: ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0)'] as const,
  blurTint: 'dark' as const,
};

/**
 * Cores de marca por tema. `primarySoft` muda entre os modos: no claro é um pastel
 * sólido, no escuro precisa ser translúcido para não virar um bloco leitoso.
 */
const brands: Record<ThemeName, {
  label: string;
  primary: string;
  accent: string;
  softLight: string;
  softDark: string;
}> = {
  default: { label: 'Padrão',   primary: '#7C5CFF', accent: '#22D3EE', softLight: '#EDE9FE', softDark: 'rgba(124,92,255,0.20)' },
  ocean:   { label: 'Oceano',   primary: '#2E86DE', accent: '#48DBFB', softLight: '#E3F0FD', softDark: 'rgba(46,134,222,0.20)' },
  ember:   { label: 'Brasa',    primary: '#FF6B35', accent: '#E63946', softLight: '#FFE7DC', softDark: 'rgba(255,107,53,0.20)' },
  forest:  { label: 'Floresta', primary: '#2D9D63', accent: '#8BC34A', softLight: '#E1F5EA', softDark: 'rgba(45,157,99,0.20)' },
};

function build(name: ThemeName, scheme: ResolvedScheme): Palette {
  const brand = brands[name];
  const neutrals = scheme === 'dark' ? darkNeutrals : lightNeutrals;
  return {
    name,
    label: brand.label,
    primary: brand.primary,
    accent: brand.accent,
    primarySoft: scheme === 'dark' ? brand.softDark : brand.softLight,
    ...neutrals,
  };
}

const names: ThemeName[] = ['default', 'ocean', 'ember', 'forest'];

export const palettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, build(n, 'light')]),
) as Record<ThemeName, Palette>;

export const darkPalettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, build(n, 'dark')]),
) as Record<ThemeName, Palette>;

export function getPalette(name: ThemeName, scheme: ResolvedScheme): Palette {
  return scheme === 'dark' ? darkPalettes[name] : palettes[name];
}
