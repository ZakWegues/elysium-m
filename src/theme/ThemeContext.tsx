import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPalette, palettes, ColorScheme, Palette, ResolvedScheme, ThemeName,
} from './palettes';
import { spacing, radii, fontSize, fontWeight, shadow } from './tokens';

const STORAGE_KEY = 'neuroaxis_theme';
const SCHEME_KEY = 'neuroaxis_color_scheme';

type ThemeContextValue = {
  name: ThemeName;
  palette: Palette;
  /** O que o usuário escolheu, incluindo `system`. */
  scheme: ColorScheme;
  /** O que está valendo de fato. */
  resolvedScheme: ResolvedScheme;
  tokens: { spacing: typeof spacing; radii: typeof radii; fontSize: typeof fontSize; fontWeight: typeof fontWeight; shadow: typeof shadow };
  setTheme: (name: ThemeName) => void;
  setScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>('default');
  const [scheme, setSchemeState] = useState<ColorScheme>('system');
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, SCHEME_KEY])
      .then(([[, storedTheme], [, storedScheme]]) => {
        if (storedTheme && storedTheme in palettes) setName(storedTheme as ThemeName);
        if (storedScheme === 'light' || storedScheme === 'dark' || storedScheme === 'system') {
          setSchemeState(storedScheme);
        }
      })
      .catch((err) => console.error('[theme] falha lendo preferências salvas', err));
  }, []);

  function setTheme(next: ThemeName) {
    setName(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((err) =>
      console.error('[theme] falha salvando tema', err)
    );
  }

  function setScheme(next: ColorScheme) {
    setSchemeState(next);
    AsyncStorage.setItem(SCHEME_KEY, next).catch((err) =>
      console.error('[theme] falha salvando modo', err)
    );
  }

  // `useColorScheme` devolve null enquanto o sistema não responde; claro é o padrão
  // seguro, e o valor real chega logo em seguida sem piscar de forma perceptível.
  const resolvedScheme: ResolvedScheme =
    scheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : scheme;

  const value: ThemeContextValue = {
    name,
    palette: getPalette(name, resolvedScheme),
    scheme,
    resolvedScheme,
    tokens: { spacing, radii, fontSize, fontWeight, shadow },
    setTheme,
    setScheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() precisa estar dentro de <ThemeProvider>');
  return ctx;
}
