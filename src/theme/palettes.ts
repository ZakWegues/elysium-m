export type ThemeName = 'default' | 'ocean' | 'ember' | 'forest';

export type Palette = {
  name: ThemeName;
  label: string;
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
};

// Aproximação dos 4 temas do NeuroAxis desktop (default/ocean/ember/forest) —
// hex exatos vivem em dashboard.html do repo desktop, não acessível daqui.
// Ajustar quando os valores reais forem confirmados.
const shared = {
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
  glassSurface: 'rgba(255,255,255,0.55)',
  glassSurfaceStrong: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.65)',
  glassBackdrop: 'rgba(20,22,26,0.35)',
};

export const palettes: Record<ThemeName, Palette> = {
  default: {
    name: 'default',
    label: 'Padrão',
    primary: '#7C5CFF',
    primarySoft: '#EDE9FE',
    accent: '#22D3EE',
    ...shared,
  },
  ocean: {
    name: 'ocean',
    label: 'Oceano',
    primary: '#2E86DE',
    primarySoft: '#E3F0FD',
    accent: '#48DBFB',
    ...shared,
  },
  ember: {
    name: 'ember',
    label: 'Brasa',
    primary: '#FF6B35',
    primarySoft: '#FFE7DC',
    accent: '#E63946',
    ...shared,
  },
  forest: {
    name: 'forest',
    label: 'Floresta',
    primary: '#2D9D63',
    primarySoft: '#E1F5EA',
    accent: '#8BC34A',
    ...shared,
  },
};
