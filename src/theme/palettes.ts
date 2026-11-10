/**
 * Temas do ELYSIUM-M — 30/10: três famílias (Dark, Glass, Stark) em três cores cada
 * (Crepúsculo, Maré, Elísio). Vidro Líquido, ELYSIUM, Renascença e Minimal saíram; quem
 * tinha um deles gravado cai no Dark (ver `resolverFamiliaEscolhida`).
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

/** Uma cor de uma família: acento, detalhe, fundo, superfícies e as manchas do fundo. */
type Face = {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  primarySoft: string;
  blobs: readonly [string, string, string];
};

type Cor = { label: string; rotulo: string; face: Face };

/**
 * 30/10: as três cores voltam em todas as famílias — o Zak não quis as cores do exemplo.
 *
 * · Dark: a noite do ELYSIUM de antes (Campos Elísios, Éter, Crepúsculo), com aurora,
 *   manchas, feixes, traços e poeira no fundo.
 * · Glass: cena escura bem colorida (manchas fortes) para o vidro ter o que mostrar; o
 *   vidro é tinta ESCURA da cor do tema, nunca branca — o branco era o "leitoso".
 * · Stark: o HUD de sempre.
 */
const CORES: Record<Familia, Record<ThemeName, Cor>> = {
  dark: {
    elisio: { label: 'Elísio', rotulo: 'Dark — Campos Elísios', face: {
      blobs: ['#8a6a2e', '#2f5d57', '#4a3f6b'],
      primary: '#d9b168', accent: '#9fd8cf', primarySoft: 'rgba(217,177,104,0.20)',
      background: '#0a0c14', surface: '#131726', surfaceRaised: '#0e1220' } },
    mare: { label: 'Maré', rotulo: 'Dark — Éter', face: {
      blobs: ['#33506b', '#2b5f59', '#3a4560'],
      primary: '#a8c4d8', accent: '#7fd4c8', primarySoft: 'rgba(168,196,216,0.20)',
      background: '#080b12', surface: '#111624', surfaceRaised: '#0c101c' } },
    crepusculo: { label: 'Crepúsculo', rotulo: 'Dark — Crepúsculo', face: {
      blobs: ['#7a4520', '#6b2f47', '#3b2a6b'],
      primary: '#f0a850', accent: '#e07a9b', primarySoft: 'rgba(240,168,80,0.20)',
      background: '#0b0818', surface: '#171232', surfaceRaised: '#110d26' } },
  },
  glass: {
    elisio: { label: 'Elísio', rotulo: 'Glass — Âmbar', face: {
      blobs: ['#d2692e', '#c9971f', '#a8326e'],
      primary: '#f0a060', accent: '#f2c14e', primarySoft: 'rgba(240,160,96,0.22)',
      background: '#120905', surface: '#22140c', surfaceRaised: '#1a0f09' } },
    mare: { label: 'Maré', rotulo: 'Glass — Maré', face: {
      blobs: ['#1e7fd4', '#17b8a6', '#4b4bd8'],
      primary: '#6cb6ff', accent: '#3fe0c8', primarySoft: 'rgba(108,182,255,0.22)',
      background: '#040d1a', surface: '#0c1a2e', surfaceRaised: '#081424' } },
    crepusculo: { label: 'Crepúsculo', rotulo: 'Glass — Crepúsculo', face: {
      blobs: ['#6d4aff', '#22b8cf', '#c04bd8'],
      primary: '#a58cff', accent: '#4fd6e8', primarySoft: 'rgba(165,140,255,0.22)',
      background: '#0a0720', surface: '#171236', surfaceRaised: '#110d2a' } },
  },
  stark: {
    elisio: { label: 'Elísio', rotulo: 'Stark — Mark', face: {
      blobs: ['#5a1414', '#5a4214', '#2a1010'],
      primary: '#ff5a4e', accent: '#ffc857', primarySoft: 'rgba(255,90,78,0.18)',
      background: '#0b0607', surface: '#170c0e', surfaceRaised: '#120909' } },
    mare: { label: 'Maré', rotulo: 'Stark — Reator', face: {
      blobs: ['#0f3a52', '#123047', '#3a2a12'],
      primary: '#3cc8f0', accent: '#ffb547', primarySoft: 'rgba(60,200,240,0.18)',
      background: '#05080f', surface: '#0b1220', surfaceRaised: '#08101b' } },
    crepusculo: { label: 'Crepúsculo', rotulo: 'Stark — Noite', face: {
      blobs: ['#1a2a3a', '#123a35', '#20283a'],
      primary: '#7fb8d8', accent: '#64ffda', primarySoft: 'rgba(127,184,216,0.18)',
      background: '#03050a', surface: '#0a0f18', surfaceRaised: '#070b12' } },
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
  if (bruto in CORES.dark) return bruto as ThemeName;
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

function build(name: ThemeName, familia: Familia): Palette {
  const { label, rotulo, face } = CORES[familia][name];
  const vidro = familia === 'glass';
  const stark = familia === 'stark';
  // Painel: a superfície do tema com um pouco da primária. Na Glass a tinta é translúcida e
  // ESCURA (é o desfoque da cena colorida que dá o vidro); nas outras, quase sólida.
  const base = misturar(face.surface, face.primary, vidro ? 0.1 : 0.04);
  return {
    name, label, rotulo, familia, ...face,
    surface3: misturar(face.surface, '#ffffff', 0.06),
    border: stark ? comAlfa(face.primary, 0.18) : 'rgba(255,255,255,0.10)',
    text: '#EEF1F6', textMuted: '#9AA3B2', textFaint: '#6f7889',
    // 09/11: branco sobre as primárias claras do Stark dava 2:1; o escuro passa de 6:1 nas três.
    onPrimary: '#0b0d14',
    error: '#FF6B6B', errorSoft: 'rgba(255,107,107,0.16)', success: '#4ADE80',
    bolhaMinha: comAlfa(face.primary, vidro ? 0.24 : 0.18), bolhaMinhaBorda: comAlfa(face.primary, 0.35),
    bolhaEla: vidro ? comAlfa(base, 0.5) : 'rgba(255,255,255,0.05)',
    bolhaElaBorda: stark ? comAlfa(face.primary, 0.18) : 'rgba(255,255,255,0.10)',
    glassSurface: comAlfa(base, vidro ? 0.42 : 0.9),
    glassSurfaceStrong: comAlfa(base, vidro ? 0.6 : 0.9),
    glassBorder: stark ? comAlfa(face.primary, 0.22) : vidro ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)',
    glassBackdrop: 'rgba(0,0,0,0.55)',
    glassSheen: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'] as const,
    glassSheet: comAlfa(base, 0.94), glassPanel: comAlfa(base, 0.96),
    blurTint: 'dark',
    fontes: familia === 'dark' ? MANROPE : vidro ? OUTFIT_FIGTREE : null,
  };
}

/** A ordem em que as cores aparecem na tela — a mesma do `THEMES` do desktop. */
const names: ThemeName[] = ['crepusculo', 'mare', 'elisio'];

const TODAS: Record<Familia, Record<ThemeName, Palette>> = {
  dark: Object.fromEntries(names.map(n => [n, build(n, 'dark')])) as Record<ThemeName, Palette>,
  glass: Object.fromEntries(names.map(n => [n, build(n, 'glass')])) as Record<ThemeName, Palette>,
  stark: Object.fromEntries(names.map(n => [n, build(n, 'stark')])) as Record<ThemeName, Palette>,
};

/** As três cores (do Dark), para quem só precisa da lista. */
export const palettes: Record<ThemeName, Palette> = TODAS.dark;

export function getPalette(name: ThemeName, familia: Familia): Palette {
  return TODAS[familia][name];
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
