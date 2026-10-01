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

/**
 * As duas FAMÍLIAS visuais, iguais às do desktop.
 *
 * 🔴 POR QUE ISTO SUBSTITUIU "claro/escuro": as seis combinações sempre foram os seis
 * temas do `dashboard.html`, mas o app as apresentava como "três cores + um interruptor
 * de claro/escuro". O nome escondia o que a escolha realmente faz — `lg` e `ely` não são
 * o mesmo desenho com o brilho trocado, são duas linguagens visuais diferentes: o Vidro
 * Líquido é translúcido e claro, o ELYSIUM é noite azul com luz dourada e feixes de luz
 * no fundo. É a mesma pergunta que o desktop faz, e agora com o mesmo vocabulário.
 *
 * A correspondência com os ids do desktop:
 *
 * | cor        | família `lg`      | família `ely`     |
 * |------------|-------------------|-------------------|
 * | crepusculo | `lg` Vidro Líquido | `ely-dusk` Crepúsculo |
 * | mare       | `lg-tide` Maré     | `ely-ether` Éter      |
 * | elisio     | `lg-amber` Âmbar   | `ely` Campos Elísios  |
 */
export type Familia = 'lg' | 'ely';

/** O que o usuário escolheu. `auto` acompanha o modo do aparelho. */
export type FamiliaEscolha = 'auto' | 'lg' | 'ely';

/** Nome de cada família na tela. */
export const ROTULO_FAMILIA: Record<Familia, string> = {
  lg: 'Vidro Líquido',
  ely: 'ELYSIUM',
};

export type Palette = {
  name: ThemeName;
  label: string;
  /** Qual das duas linguagens visuais está valendo. */
  familia: Familia;
  /** O nome que o desktop dá a esta combinação exata de cor e família. */
  rotulo: string;
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
  /**
   * Tinta dos PAINÉIS que precisam ser lidos: predefinições, notificações, qualquer
   * caixa flutuante com texto dentro.
   *
   * 🔴 DIREÇÃO NOVA — HyperOS / One UI, não iOS. O painel do One UI não mostra as
   * formas do fundo: mostra COR e luz difusa, e o texto lê perfeitamente. Isso é alfa
   * ALTO com raio ALTO, que é o oposto do "leitoso": leitoso era alfa alto de BRANCO
   * PURO com raio baixo, e é por isso que a tinta daqui vem da paleta do tema, não do
   * branco. Nenhum painel de texto abaixo deste alfa — legibilidade vem antes de vidro.
   */
  glassPanel: string;
  /** Tinta da gaveta de Ajustes. Mesma regra do `glassPanel`: cor do tema, alfa alto. */
  glassSheet: string;
  /** Tinta da BlurView: precisa acompanhar o modo, senão o vidro clareia o escuro. */
  blurTint: 'light' | 'dark';
};

/** Neutros da família Vidro Líquido, comuns às três cores. */
const neutrosClaro = {
  familia: 'lg' as const,
  border: '#E4E7EC',
  text: '#14161A',
  textMuted: '#6B7280',
  onPrimary: '#FFFFFF',
  error: '#C0392B',
  errorSoft: '#F8D7DA',
  success: '#2E8B47',
  glassBorder: 'rgba(255,255,255,0.45)',
  glassBackdrop: 'rgba(18,20,24,0.28)',
  // O brilho da aresta continua baixo: ELE é o que fazia o app leitoso, e subir alfa de
  // painel não é motivo para trazer de volta um véu de branco puro por cima de tudo.
  glassSheen: ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)'] as const,
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
  familia: 'ely' as const,
  border: 'rgba(255,255,255,0.10)',
  text: '#EEF1F6',
  textMuted: '#9AA3B2',
  onPrimary: '#FFFFFF',
  error: '#FF6B6B',
  errorSoft: 'rgba(255,107,107,0.16)',
  success: '#4ADE80',
  // Bloco 128: sem borda de vidro na noite — a mesma linha discreta do `border`.
  glassBorder: 'rgba(255,255,255,0.10)',
  glassBackdrop: 'rgba(0,0,0,0.55)',
  // Um quinto do brilho do modo claro. Branco forte sobre superfície escura não lê como
  // reflexo, lê como sujeira.
  // Bloco 128: sem reflexo na noite (o modal e o popover desenham este gradiente).
  glassSheen: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'] as const,
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

/**
 * O nome que o desktop dá a cada combinação.
 *
 * Fica numa tabela e não junto da cor porque a mesma cor tem nome diferente em cada
 * família — "Elísio" é "Vidro — Âmbar" no vidro e "Campos Elísios" na noite. Guardar o
 * par junto da face duplicaria a cor em dois lugares para acrescentar só um texto.
 */
const ROTULOS: Record<ThemeName, Record<Familia, string>> = {
  elisio:     { lg: 'Vidro — Âmbar', ely: 'Campos Elísios' },
  mare:       { lg: 'Vidro — Maré',  ely: 'Éter' },
  crepusculo: { lg: 'Vidro Líquido', ely: 'Crepúsculo' },
};

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

function comAlfa(hex: string, alfa: number): string {
  const [r, g, b] = canais(hex);
  return `rgba(${r},${g},${b},${alfa})`;
}

/**
 * 🔴 A TINTA DO VIDRO VEM DA PALETA, NÃO DO BRANCO.
 *
 * Branco puro em alfa alto é literalmente a definição de "leitoso" — foi o que o véu do
 * `GlassSurface` fazia, e é o que se vê quando um painel translúcido some no fundo claro.
 * Aqui a base é a cor da superfície do tema puxada um pouco na direção da primária: no
 * vidro, branco com 10% de primária; na noite, a `surface` com 14%. O painel passa a
 * mostrar COR e luz difusa em vez de formas do fundo, que é o desenho do One UI.
 *
 * Os alfas sobem em escada conforme a superfície precise ser LIDA:
 * card < barra < gaveta < painel de texto.
 */
function vidro(face: Face, familia: Familia) {
  const noite = familia === 'ely';
  const base = noite ? misturar(face.surface, face.primary, 0.14) : misturar('#FFFFFF', face.primary, 0.10);
  // 🔴 Bloco 70: a noite quase não tem desfoque (GlassFill limita a 10), então a tinta é
  // o que segura a leitura — subiu de 0,26/0,42 para 0,62/0,74. O dia baixou um pouco
  // (0,34 → 0,30) porque ganhou aresta especular e lente, que já dão presença ao card.
  return {
    // Bloco 128: a noite virou painel quase sólido (era 0,62/0,74) — sem vidro, só o véu do blur leve.
    glassSurface: comAlfa(base, noite ? 0.84 : 0.30),
    glassSurfaceStrong: comAlfa(base, noite ? 0.90 : 0.48),
    // Gaveta e painel são quase opacos de propósito: o critério de aceite é texto legível
    // sobre QUALQUER fundo, inclusive sobre uma mancha clara passando por baixo.
    glassSheet: comAlfa(base, noite ? 0.94 : 0.88),
    glassPanel: comAlfa(base, noite ? 0.96 : 0.92),
  };
}

function build(name: ThemeName, familia: Familia): Palette {
  const tema = temas[name];
  const face = familia === 'ely' ? tema.dark : tema.light;
  const neutros = familia === 'ely' ? neutrosEscuro : neutrosClaro;
  return {
    name, label: tema.label, rotulo: ROTULOS[name][familia],
    ...neutros, ...face, ...vidro(face, familia),
  };
}

/**
 * A ordem em que as três cores aparecem na tela — a MESMA do `THEMES` do
 * `dashboard.html`, que lista Vidro Líquido, Maré e Âmbar nessa sequência. Estava
 * invertida, e as duas telas do mesmo ecossistema mostravam a mesma lista em ordens
 * diferentes.
 */
const names: ThemeName[] = ['crepusculo', 'mare', 'elisio'];

/** Família Vidro Líquido — os três `lg` do desktop. */
export const palettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, build(n, 'lg')]),
) as Record<ThemeName, Palette>;

/** Família ELYSIUM — os três `ely` do desktop. */
export const darkPalettes: Record<ThemeName, Palette> = Object.fromEntries(
  names.map(n => [n, build(n, 'ely')]),
) as Record<ThemeName, Palette>;

export function getPalette(name: ThemeName, familia: Familia): Palette {
  return familia === 'ely' ? darkPalettes[name] : palettes[name];
}

/**
 * Traduz a escolha de família guardada no disco.
 *
 * ⚠️ A chave gravada continua sendo `elysium_color_scheme`, com os valores antigos
 * `light`/`dark`/`system`. Renomear a chave só traria o risco de despareamento silencioso
 * que o handoff descreve, e não traria nada: o que mudou foi o vocabulário na tela, não o
 * significado do valor. `light` sempre quis dizer vidro e `dark` sempre quis dizer noite.
 */
export function resolverFamiliaEscolhida(bruto: string | null | undefined): FamiliaEscolha | null {
  switch (bruto) {
    case 'lg':
    case 'light':  return 'lg';
    case 'ely':
    case 'dark':   return 'ely';
    case 'auto':
    case 'system': return 'auto';
    default:       return null;
  }
}
