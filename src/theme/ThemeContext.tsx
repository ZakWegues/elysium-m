import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palettes, Palette, ThemeName } from './palettes';
import { spacing, radii, fontSize, fontWeight, shadow } from './tokens';

const STORAGE_KEY = 'neuroaxis_theme';

type ThemeContextValue = {
  name: ThemeName;
  palette: Palette;
  tokens: { spacing: typeof spacing; radii: typeof radii; fontSize: typeof fontSize; fontWeight: typeof fontWeight; shadow: typeof shadow };
  setTheme: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>('default');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in palettes) {
        setName(stored as ThemeName);
      }
    });
  }, []);

  function setTheme(next: ThemeName) {
    setName(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }

  const value: ThemeContextValue = {
    name,
    palette: palettes[name],
    tokens: { spacing, radii, fontSize, fontWeight, shadow },
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() precisa estar dentro de <ThemeProvider>');
  return ctx;
}
