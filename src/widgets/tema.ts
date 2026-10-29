import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPalette, Palette, resolverFamiliaEscolhida, resolverNomeDeTema, ThemeName } from '../theme/palettes';

/**
 * A paleta para os widgets, lida do disco (bloco 73).
 *
 * O handler dos widgets roda sem UI e sem o `ThemeProvider`; as mesmas chaves que o
 * provider grava (`elysium_theme`, `elysium_color_scheme`) são lidas aqui. Qualquer falha
 * cai no Dark, que é o padrão desde 29/10.
 */
export async function paletaDosWidgets(): Promise<Palette> {
  let nome: ThemeName = 'mare';
  try {
    const [[, tema], [, fam]] = await AsyncStorage.multiGet(['elysium_theme', 'elysium_color_scheme']);
    nome = resolverNomeDeTema(tema) ?? 'mare';
    return getPalette(nome, resolverFamiliaEscolhida(fam) ?? 'dark');
  } catch {
    return getPalette(nome, 'dark');
  }
}
