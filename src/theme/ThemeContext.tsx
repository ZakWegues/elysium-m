import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  getPalette, paletaMinimal, resolverNomeDeTema, resolverFamiliaEscolhida,
  Familia, FamiliaEscolha, Palette, ThemeName,
} from './palettes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spacing, radii, fontSize, fontWeight, shadow } from './tokens';
import { destaqueDoSistema } from '../lib/corDoSistema';

const STORAGE_KEY = 'elysium_theme';
/**
 * ⚠️ A chave continua com o nome antigo de propósito.
 *
 * O que ela guarda não mudou de significado — `light` sempre foi o vidro e `dark` sempre
 * foi a noite; o que mudou foi o nome disso na tela. Renomear a chave só criaria a chance
 * de um aparelho atualizado por OTA acordar sem preferência, que é exatamente o tipo de
 * falha silenciosa que o handoff manda evitar.
 */
const FAMILIA_KEY = 'elysium_color_scheme';

type ThemeContextValue = {
  name: ThemeName;
  palette: Palette;
  /** O que o usuário escolheu, incluindo `auto`. */
  familia: FamiliaEscolha;
  /** O que está valendo de fato, depois de resolver `auto`. */
  familiaResolvida: Familia;
  tokens: { spacing: typeof spacing; radii: typeof radii; fontSize: typeof fontSize; fontWeight: typeof fontWeight; shadow: typeof shadow };
  setTheme: (name: ThemeName) => void;
  setFamilia: (familia: FamiliaEscolha) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const CHAVE_STARK = 'elysium_tema_stark_aplicado_v1';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>('elisio');
  const [familia, setFamiliaState] = useState<FamiliaEscolha>('auto');
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, FAMILIA_KEY])
      .then(([[, storedTheme], [, storedFamilia]]) => {
        // Traduz tema aposentado em vez de ignorar: quem escolheu "ocean" um dia tem o
        // equivalente novo, e o disco para de carregar um id que não existe mais.
        const resolvido = resolverNomeDeTema(storedTheme);
        if (resolvido) {
          setName(resolvido);
          if (resolvido !== storedTheme) {
            AsyncStorage.setItem(STORAGE_KEY, resolvido).catch(() => { /* best-effort */ });
          }
        }
        const fam = resolverFamiliaEscolhida(storedFamilia);
        if (fam) setFamiliaState(fam);
        // Fase 16: o tema Stark vira o padrão UMA vez (o Zak pediu o visual "Jarvis
        // feminino"); escolher outro depois é respeitado.
        AsyncStorage.getItem(CHAVE_STARK).then((feito) => {
          if (feito) return;
          setName('mare');
          setFamiliaState('stark');
          AsyncStorage.multiSet([[STORAGE_KEY, 'mare'], [FAMILIA_KEY, 'stark'], [CHAVE_STARK, '1']]).catch(() => { /* tenta de novo na próxima */ });
        }).catch(() => { /* fica como está */ });
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

  // `useColorScheme` devolve null enquanto o sistema não responde; o vidro é o padrão
  // seguro, e o valor real chega logo em seguida sem piscar de forma perceptível.
  // O Minimal (20/10) também acompanha o modo do aparelho: claro = base do vidro, escuro = da noite.
  const familiaResolvida: Familia =
    familia === 'auto' || familia === 'minimal' ? (systemScheme === 'dark' ? 'ely' : 'lg') : familia;

  const value: ThemeContextValue = {
    name,
    palette: familia === 'minimal' ? paletaMinimal(systemScheme === 'dark', destaqueDoSistema(), name) : getPalette(name, familiaResolvida),
    familia,
    familiaResolvida,
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
