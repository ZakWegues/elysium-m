import { Linking, StyleSheet, View } from 'react-native';
import { Text } from './ui';
import { useTheme } from '../theme';
import { Bloco, parseMarkdown, Trecho } from '../lib/markdown';

/**
 * Desenha a resposta do chat com o markdown mínimo de `lib/markdown.ts` (bloco 130).
 * Tudo é `Text` aninhado — seleção e cópia continuam funcionando como antes.
 */
export function Markdown({ texto, cor }: { texto: string; cor: string }) {
  const { palette, tokens } = useTheme();
  const blocos = parseMarkdown(texto);
  // Uma linha só, sem marcação: o caminho de sempre, sem custo.
  if (blocos.length === 1 && blocos[0].tipo === 'paragrafo' && blocos[0].trechos.every(t => t.tipo === 'texto')) {
    return <Text variant="body" color={cor}>{texto}</Text>;
  }
  const trechos = (ts: Trecho[]) => ts.map((t, i) => {
    switch (t.tipo) {
      case 'negrito': return <Text key={i} variant="body" color={cor} style={styles.negrito}>{t.texto}</Text>;
      case 'italico': return <Text key={i} variant="body" color={cor} style={styles.italico}>{t.texto}</Text>;
      case 'codigo': return <Text key={i} variant="body" color={cor} style={[styles.mono, { backgroundColor: palette.border }]}>{` ${t.texto} `}</Text>;
      case 'link': return (
        <Text key={i} variant="body" color={palette.primary} style={styles.link} onPress={() => { Linking.openURL(t.url).catch(() => {}); }}>
          {t.texto}
        </Text>
      );
      default: return t.texto;
    }
  });
  const bloco = (b: Bloco, i: number) => {
    switch (b.tipo) {
      case 'titulo':
        return <Text key={i} variant={b.nivel === 1 ? 'subheading' : 'body'} color={cor} style={styles.negrito}>{trechos(b.trechos)}</Text>;
      case 'item':
        return (
          <View key={i} style={[styles.item, { paddingLeft: b.nivel * 14 }]}>
            <Text variant="body" color={cor} style={styles.marcador}>{b.marcador}</Text>
            <Text variant="body" color={cor} style={{ flex: 1 }}>{trechos(b.trechos)}</Text>
          </View>
        );
      case 'codigo':
        return (
          <View key={i} style={[styles.codigo, { borderRadius: tokens.radii.sm, backgroundColor: palette.background, borderColor: palette.border }]}>
            <Text variant="caption" color={cor} style={styles.mono} selectable>{b.texto}</Text>
          </View>
        );
      default:
        return <Text key={i} variant="body" color={cor}>{trechos(b.trechos)}</Text>;
    }
  };
  return <View style={{ gap: 6 }}>{blocos.map(bloco)}</View>;
}

const styles = StyleSheet.create({
  negrito: { fontWeight: '700' },
  italico: { fontStyle: 'italic' },
  mono: { fontFamily: 'monospace' },
  link: { textDecorationLine: 'underline' },
  item: { flexDirection: 'row', gap: 6 },
  marcador: { minWidth: 14 },
  codigo: { padding: 8, borderWidth: StyleSheet.hairlineWidth },
});
