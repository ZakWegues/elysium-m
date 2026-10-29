import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  getPalette, resolverNomeDeTema, resolverFamiliaEscolhida,
  Familia, FamiliaEscolha, Palette, ThemeName,
} from './palettes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spacing, radii, fontSize, fontWeight, shadow } from './tokens';
import { useFontes } from './fontes';

const STORAGE_KEY = 'elysium_theme';
/**
 * ⚠️ A chave continua com o nome antigo de propósito: renomear criaria a chance de um
 * aparelho atualizado por OTA acordar sem preferência.
 */
const FAMILIA_KEY = 'elysium_color_scheme';

type ThemeContextValue = {
  name: ThemeName;
  palette: Palette;
  /** O que o usuário escolheu. */
  familia: FamiliaEscolha;
  /** Igual a `familia` desde que o `auto` saiu (29/10); fica pelo nome que as telas usam. */
  familiaResolvida: Familia;
  tokens: { spacing: typeof spacing; radii: typeof radii; fontSize: typeof fontSize; fontWeight: typeof fontWeight; shadow: typeof shadow };
  setTheme: (name: ThemeName) => void;
  setFamilia: (familia: FamiliaEscolha) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
/** 29/10: o design novo vira o padrão UMA vez (Dark); escolher outro depois é respeitado. */
const CHAVE_DESIGN = 'elysium_tema_design_2910_aplicado';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>('mare');
  const [familia, setFamiliaState] = useState<FamiliaEscolha>('dark');
  const fontesProntas = useFontes();

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, FAMILIA_KEY, CHAVE_DESIGN])
      .then(([[, storedTheme], [, storedFamilia], [, designFeito]]) => {
        // Traduz tema aposentado em vez de ignorar: o disco para de carregar um id que não existe mais.
        const resolvido = resolverNomeDeTema(storedTheme);
        if (resolvido) {
          setName(resolvido);
          if (resolvido !== storedTheme) {
            AsyncStorage.setItem(STORAGE_KEY, resolvido).catch(() => { /* best-effort */ });
          }
        }
        if (!designFeito) {
          AsyncStorage.multiSet([[FAMILIA_KEY, 'dark'], [CHAVE_DESIGN, '1']]).catch(() => { /* tenta de novo na próxima */ });
          return;
        }
        const fam = resolverFamiliaEscolhida(storedFamilia);
        if (fam) setFamiliaState(fam);
        if (fam && fam !== storedFamilia) AsyncStorage.setItem(FAMILIA_KEY, fam).catch(() => { /* best-effort */ });
      })
      .catch((err) => console.error('[theme] falha lendo preferências salvas', err));
  }, []);

  function setTheme(next: ThemeName) {
    setName(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((err) =>
      console.error('[theme] falha salvando tema', err)
    );
  }

  function setFamilia(next: FamiliaEscolha) {
    setFamiliaState(next);
    AsyncStorage.setItem(FAMILIA_KEY, next).catch((err) =>
      console.error('[theme] falha salvando a família', err)
    );
  }

  // Sem as fontes carregadas, o texto fica na do sistema (nome de fonte desconhecido avisa no iOS).
  const palette = useMemo(() => {
    const p = getPalette(name, familia);
    return fontesProntas ? p : { ...p, fontes: null };
  }, [name, familia, fontesProntas]);

  const value: ThemeContextValue = {
    name,
    palette,
    familia,
    familiaResolvida: familia,
    tokens: { spacing, radii, fontSize, fontWeight, shadow },
    setTheme,
    setFamilia,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() precisa estar dentro de <ThemeProvider>');
  return ctx;
}
