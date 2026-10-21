import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { Familia, getPalette, paletaMinimal, Palette, resolverFamiliaEscolhida, TEMAS_APOSENTADOS, ThemeName } from '../theme/palettes';
import { destaqueDoSistema } from '../lib/corDoSistema';

/**
 * A paleta para os widgets, lida do disco (bloco 73).
 *
 * O handler dos widgets roda sem UI e sem o `ThemeProvider`; as mesmas chaves que o
 * provider grava (`elysium_theme`, `elysium_color_scheme`) são lidas aqui. `auto` segue o
 * modo do sistema, como no app. Qualquer falha cai no Crepúsculo/vidro, que é o padrão.
 */
export async function paletaDosWidgets(): Promise<Palette> {
  let nome: ThemeName = 'mare';
  let familia: Familia = 'stark';
  try {
    const [[, tema], [, fam]] = await AsyncStorage.multiGet(['elysium_theme', 'elysium_color_scheme']);
    const t = tema ? (TEMAS_APOSENTADOS[tema] ?? tema) : 'mare';
    if (t === 'crepusculo' || t === 'mare' || t === 'elisio') nome = t;
    const escolha = resolverFamiliaEscolhida(fam) ?? 'stark';
    // Minimal (20/10): claro/escuro do aparelho, sem decoração.
    if (escolha === 'minimal') return paletaMinimal(Appearance.getColorScheme() === 'dark', destaqueDoSistema(), nome);
    familia = escolha === 'auto' ? (Appearance.getColorScheme() === 'dark' ? 'ely' : 'lg') : escolha;
  } catch { /* padrão */ }
  return getPalette(nome, familia);
}
