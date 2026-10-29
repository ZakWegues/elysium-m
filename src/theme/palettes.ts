/**
 * Temas do ELYSIUM-M — 29/10: o design novo do Zak (`dark.css` e `glass.css`).
 *
 * Três famílias, e só elas:
 *
 * | família | cara                                                                  |
 * |---------|-----------------------------------------------------------------------|
 * | Dark    | preto OLED, superfícies chapadas, fios finos, um acento frio (padrão) |
 * | Glass   | cena índigo com orbes coloridas e vidro líquido flutuando por cima    |
 * | Stark   | HUD escuro com três cores (Reator, Mark, Noite)                       |
 *
 * Vidro Líquido (`lg`), ELYSIUM (`ely`), Renascença e Minimal saíram. Quem tinha um deles
 * gravado cai no Dark (ver `resolverFamiliaEscolhida`), sem tela quebrada.
 *
 * As três "cores" (`ThemeName`) continuam existindo, mas só a Stark varia por elas: Dark e
 * Glass têm uma paleta só, a do arquivo de design.
 */

export type ThemeName = 'elisio' | 'mare' | 'crepusculo';

export type Familia = 'dark' | 'glass' | 'stark';

/** O que o usuário escolheu. Era maior quando havia `auto` e Minimal; hoje é a família. */
export type FamiliaEscolha = Familia;

/** Nome de cada família na tela. */
export const ROTULO_FAMILIA: Record<Familia, string> = {
  dark: 'Dark',
  glass: 'Glass',
  stark: 'Stark',
};

/** As três famílias são escuras. Fica como função para quem perguntava "é a noite?". */
export function familiaEscura(_f: Familia): boolean {
  return true;
}

/**
 * Nomes das fontes carregadas por `useFontes` (ver `fontes.ts`). No Android o peso não
 * escolhe arquivo dentro de uma família, então cada peso é um nome próprio.
 */
export type Fontes = {
  /** Texto corrido, por peso. */
  texto: { 400: string; 500: string; 600: string; 700: string; 800: string };
  /** Títulos (display/heading). */
  titulo: { 600: string; 700: string; 800: string };
  /** Números e rótulos técnicos. */
  mono: { 500: string; 600: string };
};

export type Palette = {
  name: ThemeName;
  label: string;
  familia: Familia;
  /** O nome desta combinação na tela de Ajustes. */
  rotulo: string;
  primary: string;
  primarySoft: string;
  accent: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  /** 29/10: o terceiro degrau de superfície (`--s3` do Dark). */
  surface3: string;
  border: string;
  text: string;
  textMuted: string;
  /** 29/10: o texto mais apagado (`--tx3` / `--ink3`), para rótulos. */
  textFaint: string;
  onPrimary: string;
  error: string;
  errorSoft: string;
  success: string;
  /** 29/10: as bolhas do chat de cada lado. */
  bolhaMinha: string;
  bolhaMinhaBorda: string;
  bolhaEla: string;
  bolhaElaBorda: string;
  // Vidro — translúcidos usados sobre BlurView.
  glassSurface: string;
  glassSurfaceStrong: string;
  glassBorder: string;
  glassBackdrop: string;
  /** Brilho da aresta de cima do vidro, em duas paradas (opaca → transparente). */
  glassSheen: readonly [string, string];
  /** Tinta dos painéis que precisam ser lidos (popover, avisos). Alfa alto. */
  glassPanel: string;
  /** Tinta da gaveta de Ajustes. */
  glassSheet: string;
  blurTint: 'light' | 'dark';
  /** Cores das manchas/orbes do fundo. A Glass usa as quatro do `glass.css`. */
  blobs: readonly [string, string, string];
  /** Fontes da família; `null` fica com a do sistema (Stark). */
  fontes: Fontes | null;
};

const MANROPE: Fontes = {
  texto: { 400: 'Manrope_500Medium', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold' },
  titulo: { 600: 'Manrope_700Bold', 700: 'Manrope_800ExtraBold', 800: 'Manrope_800ExtraBold' },
  mono: { 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_600SemiBold' },
};

const OUTFIT_FIGTREE: Fontes = {
  texto: { 400: 'Figtree_400Regular', 500: 'Figtree_500Medium', 600: 'Figtree_600SemiBold', 700: 'Figtree_700Bold', 800: 'Figtree_700Bold' },
  titulo: { 600: 'Outfit_600SemiBold', 700: 'Outfit_700Bold', 800: 'Outfit_700Bold' },
  mono: { 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_600SemiBold' },
};

/** `dark.css`: preto OLED, s1–s3, fio `--line`, acento `--ac`. */
const DARK: Omit<Palette, 'name'> = {
  label: 'Dark', familia: 'dark', rotulo: 'Dark',
  primary: '#9fb0ff', primarySoft: '#1b2142', accent: '#58d7a2',
  background: '#000000', surface: '#0d0e12', surfaceRaised: '#14161c', surface3: '#1c1f27',
  border: '#242832',
  text: '#eceef4', textMuted: '#a4aab8', textFaint: '#7d8493',
  onPrimary: '#0b0d1a',
  error: '#ff7a7a', errorSoft: 'rgba(255,122,122,0.14)', success: '#58d7a2',
  bolhaMinha: '#1b2142', bolhaMinhaBorda: '#2c3566', bolhaEla: '#14161c', bolhaElaBorda: '#242832',
  // Sem vidro: as superfícies do Dark são chapadas.
  glassSurface: '#0d0e12', glassSurfaceStrong: '#14161c', glassBorder: '#242832',
  glassBackdrop: 'rgba(0,0,0,0.6)',
  glassSheen: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'] as const,
  glassPanel: '#0d0e12', glassSheet: '#0d0e12',
  blurTint: 'dark',
  blobs: ['#000000', '#000000', '#000000'],
  fontes: MANROPE,
};

/** `glass.css`: cena #0b0930 → #05041a, tinta branca translúcida, aro de luz. */
const GLASS: Omit<Palette, 'name'> = {
  label: 'Glass', familia: 'glass', rotulo: 'Glass',
  primary: '#8fb4ff', primarySoft: 'rgba(127,182,255,0.22)', accent: '#b79bff',
  // `surface` fica sólida (hex): telas cheias e `comAlfa` precisam dela opaca. Os cards
  // da Glass desenham o vidro por cima (ver `Card`).
  background: '#05041a', surface: '#15123a', surfaceRaised: '#1c1947', surface3: '#252157',
  border: 'rgba(255,255,255,0.14)',
  text: '#f5f7ff', textMuted: '#c4c7da', textFaint: '#9497ad',
  onPrimary: '#0b0930',
  error: '#ff8a9a', errorSoft: 'rgba(255,138,154,0.16)', success: '#5af0b0',
  bolhaMinha: 'rgba(127,170,255,0.26)', bolhaMinhaBorda: 'rgba(190,210,255,0.42)',
  bolhaEla: 'rgba(255,255,255,0.10)', bolhaElaBorda: 'rgba(255,255,255,0.26)',
  glassSurface: 'rgba(255,255,255,0.10)', glassSurfaceStrong: 'rgba(255,255,255,0.15)',
  glassBorder: 'rgba(255,255,255,0.34)',
  glassBackdrop: 'rgba(3,2,25,0.55)',
  glassSheen: ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)'] as const,
  glassPanel: 'rgba(20,17,58,0.92)', glassSheet: 'rgba(16,13,48,0.94)',
  blurTint: 'dark',
  blobs: ['#705cff', '#19d3c5', '#ff4fa3'],
  fontes: OUTFIT_FIGTREE,
};

type FaceStark = {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  primarySoft: string;
  blobs: readonly [string, string, string];
};

const STARK: Record<ThemeName, { label: string; rotulo: string; face: FaceStark }> = {
  elisio: {
    label: 'Elísio', rotulo: 'Stark — Mark',
    face: {
      blobs: ['#5a1414', '#5a4214', '#2a1010'],
      primary: '#ff5a4e', accent: '#ffc857', primarySoft: 'rgba(255,90,78,0.18)',
      background: '#0b0607', surface: '#170c0e', surfaceRaised: '#120909',
    },
  },
  mare: {
    label: 'Maré', rotulo: 'Stark — Reator',
    face: {
      blobs: ['#0f3a52', '#123047', '#3a2a12'],
      primary: '#3cc8f0', accent: '#ffb547', primarySoft: 'rgba(60,200,240,0.18)',
      background: '#05080f', surface: '#0b1220', surfaceRaised: '#08101b',
    },
  },
  crepusculo: {
    label: 'Crepúsculo', rotulo: 'Stark — Noite',
    face: {
      blobs: ['#1a2a3a', '#123a35', '#20283a'],
      primary: '#7fb8d8', accent: '#64ffda', primarySoft: 'rgba(127,184,216,0.18)',
      background: '#03050a', surface: '#0a0f18', surfaceRaised: '#070b12',
    },
  },
};

/**
 * 🔴 Temas antigos, ainda gravados no `AsyncStorage` de quem já escolheu um.
 *
 * Sem esta tabela, um `elysium_theme` valendo `ocean` faria `palettes[name]` devolver
 * `undefined` e o app abrir sem paleta — tela quebrada, sem erro que explique.
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
  if (bruto in STARK) return bruto as ThemeName;
  return TEMAS_APOSENTADOS[bruto] ?? null;
}

/** `#rrggbb` → [r, g, b]. Só aceita hex de 6 dígitos, que é o que as faces usam. */
function canais(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mistura dois hex. `t` é quanto do segundo entra. */
function misturar(a: string, b: string, t: number): string {
  const [ar, ag, ab] = canais(a);
  const [br, bg, bb] = canais(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[c(ar, br), c(ag, bg), c(ab, bb)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function comAlfa(hex: string, alfa: number): string {
  const [r, g, b] = canais(hex);
  return `rgba(${r},${g},${b},${alfa})`;
}

function buildStark(name: ThemeName): Palette {
  const { label, rotulo, face } = STARK[name];
  // Painel quase sólido: a superfície do tema com 4% da primária.
  const base = misturar(face.surface, face.primary, 0.04);
  return {
    name, label, rotulo, familia: 'stark', ...face,
    surface3: misturar(face.surface, '#ffffff', 0.06),
    // Bordas com um fio da cor do reator, como as linhas de um HUD.
    border: comAlfa(face.primary, 0.18),
    text: '#EEF1F6', textMuted: '#9AA3B2', textFaint: '#6f7889',
    onPrimary: '#FFFFFF',
    error: '#FF6B6B', errorSoft: 'rgba(255,107,107,0.16)', success: '#4ADE80',
    bolhaMinha: comAlfa(face.primary, 0.18), bolhaMinhaBorda: comAlfa(face.primary, 0.35),
    bolhaEla: 'rgba(255,255,255,0.05)', bolhaElaBorda: comAlfa(face.primary, 0.18),
    glassSurface: comAlfa(base, 0.9), glassSurfaceStrong: comAlfa(base, 0.9),
    glassBorder: comAlfa(face.primary, 0.22),
    glassBackdrop: 'rgba(0,0,0,0.55)',
    glassSheen: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'] as const,
    glassSheet: comAlfa(base, 0.94), glassPanel: comAlfa(base, 0.96),
    blurTint: 'dark',
    fontes: null,
  };
}

/** A ordem em que as cores aparecem na tela — a mesma do `THEMES` do desktop. */
const names: ThemeName[] = ['crepusculo', 'mare', 'elisio'];

/** As três cores da Stark (é a única família que varia por cor). */
export const palettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, buildStark(n)]),
) as Record<ThemeName, Palette>;

export function getPalette(name: ThemeName, familia: Familia): Palette {
  if (familia === 'dark') return { ...DARK, name };
  if (familia === 'glass') return { ...GLASS, name };
  return palettes[name];
}

/**
 * Traduz a família guardada no disco (chave `elysium_color_scheme`).
 *
 * Os valores das famílias que saíram (`lg`/`light`, `ely`, `renascenca`, `minimal`,
 * `auto`/`system`) caem no Dark. `dark` sempre quis dizer "a noite", e continua.
 */
export function resolverFamiliaEscolhida(bruto: string | null | undefined): FamiliaEscolha | null {
  switch (bruto) {
    case 'dark':
    case 'glass':
    case 'stark':
      return bruto;
    case 'lg':
    case 'light':
    case 'ely':
    case 'renascenca':
    case 'minimal':
    case 'auto':
    case 'system':
      return 'dark';
    default:
      return null;
  }
}
