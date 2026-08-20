/**
 * Temas do ELYSIUM-M — os MESMOS do desktop, e de propósito.
 *
 * São três cores, cada uma com uma cara clara (vidro) e uma escura (noite). O desktop
 * chama as seis combinações por nomes próprios (`lg`, `lg-tide`, `lg-amber`, `ely`,
 * `ely-dusk`, `ely-ether`); aqui elas aparecem como três temas mais o seletor de modo que
 * o app já tinha, para "seguir o sistema" continuar fazendo sentido — um aparelho no modo
 * noturno precisa poder escolher a versão escura sozinho.
 *
 * | tema       | claro (vidro)     | escuro (noite)          |
 * |------------|-------------------|-------------------------|
 * | Elísio     | Vidro — Âmbar     | Campos Elísios (ouro)   |
 * | Maré       | Vidro — Maré      | Éter (prata-ciano)      |
 * | Crepúsculo | Vidro Líquido     | Crepúsculo (âmbar/rosa) |
 *
 * Nenhuma cor foi inventada: são exatamente as do `THEMES` do `dashboard.html`.
 */

export type ThemeName = 'elisio' | 'mare' | 'crepusculo';

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

/** Neutros do modo claro, comuns às três cores. */
const neutrosClaro = {
  scheme: 'light' as const,
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
 * Não é o claro invertido: o fundo é um azulado bem escuro em vez de preto puro, para o
 * vidro ter o que desfocar, e as bordas são brancos translúcidos em vez de cinza sólido,
 * senão viram linhas duras sobre superfície escura.
 */
const neutrosEscuro = {
  scheme: 'dark' as const,
  border: 'rgba(255,255,255,0.10)',
  text: '#EEF1F6',
  textMuted: '#9AA3B2',
  onPrimary: '#FFFFFF',
  error: '#FF6B6B',
  errorSoft: 'rgba(255,107,107,0.16)',
  success: '#4ADE80',
  // Mais encorpado que a primeira versão: quem dava volume aos cards no escuro era o véu
  // branco que saiu do GlassSurface. Sem isto, vidro sobre a noite fica invisível.
  glassSurface: 'rgba(255,255,255,0.10)',
  glassSurfaceStrong: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.20)',
  glassBackdrop: 'rgba(0,0,0,0.55)',
  // Um quinto do brilho do modo claro. Branco forte sobre superfície escura não lê como
  // reflexo, lê como sujeira.
  glassSheen: ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0)'] as const,
  blurTint: 'dark' as const,
};

type Face = {
  primary: string;
  accent: string;
  /** Fundo e superfícies mudam por tema: cada noite tem a sua, cada vidro tem o seu. */
  background: string;
  surface: string;
  surfaceRaised: string;
  /** Pastel sólido no claro; translúcido no escuro, senão vira um bloco leitoso. */
  primarySoft: string;
};

const temas: Record<ThemeName, { label: string; light: Face; dark: Face }> = {
  elisio: {
    label: 'Elísio',
    light: {
      primary: '#c2602c', accent: '#c9971f', primarySoft: '#F7E7D6',
      background: '#f8f3ec', surface: '#FFFFFF', surfaceRaised: '#FFFFFF',
    },
    dark: {
      primary: '#d9b168', accent: '#9fd8cf', primarySoft: 'rgba(217,177,104,0.20)',
      background: '#0a0c14', surface: '#131726', surfaceRaised: '#0e1220',
    },
  },
  mare: {
    label: 'Maré',
    light: {
      primary: '#1e7fd4', accent: '#17b8a6', primarySoft: '#DCEBF9',
      background: '#eef4f9', surface: '#FFFFFF', surfaceRaised: '#FFFFFF',
    },
    dark: {
      primary: '#a8c4d8', accent: '#7fd4c8', primarySoft: 'rgba(168,196,216,0.20)',
      background: '#080b12', surface: '#111624', surfaceRaised: '#0c101c',
    },
  },
  crepusculo: {
    label: 'Crepúsculo',
    light: {
      primary: '#6d4aff', accent: '#22b8cf', primarySoft: '#E6E0FF',
      background: '#f2f1f7', surface: '#FFFFFF', surfaceRaised: '#FFFFFF',
    },
    dark: {
      primary: '#f0a850', accent: '#e07a9b', primarySoft: 'rgba(240,168,80,0.20)',
      background: '#0b0818', surface: '#171232', surfaceRaised: '#110d26',
    },
  },
};

/**
 * 🔴 Temas antigos, ainda gravados no `AsyncStorage` de quem já escolheu um.
 *
 * Sem esta tabela, um `elysium_theme` valendo `ocean` faria `palettes[name]` devolver
 * `undefined` e o app abrir sem paleta — tela quebrada, sem erro que explique. É a mesma
 * falha silenciosa que o desktop tratou ao aposentar os quatro temas dele.
 */
export const TEMAS_APOSENTADOS: Record<string, ThemeName> = {
  default: 'crepusculo',
  ocean: 'mare',
  ember: 'elisio',
  forest: 'mare',
};

/** Traduz o que veio do disco. Devolve `null` quando o valor não serve para nada. */
export function resolverNomeDeTema(bruto: string | null | undefined): ThemeName | null {
  if (!bruto) return null;
  if (bruto in temas) return bruto as ThemeName;
  return TEMAS_APOSENTADOS[bruto] ?? null;
}

function build(name: ThemeName, scheme: ResolvedScheme): Palette {
  const tema = temas[name];
  const face = scheme === 'dark' ? tema.dark : tema.light;
  const neutros = scheme === 'dark' ? neutrosEscuro : neutrosClaro;
  return { name, label: tema.label, ...neutros, ...face };
}

const names: ThemeName[] = ['elisio', 'mare', 'crepusculo'];

export const palettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, build(n, 'light')]),
) as Record<ThemeName, Palette>;

export const darkPalettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, build(n, 'dark')]),
) as Record<ThemeName, Palette>;

export function getPalette(name: ThemeName, scheme: ResolvedScheme): Palette {
  return scheme === 'dark' ? darkPalettes[name] : palettes[name];
}
