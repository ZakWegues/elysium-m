import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { haptica } from '../lib/haptica';
import { Text } from './ui';
import { useTheme } from '../theme';
import { abrirLinkSeguro } from '../lib/abrirLink';
import { Bloco, parseMarkdown, Trecho } from '../lib/markdown';

/**
 * Desenha a resposta do chat com o markdown mínimo de `lib/markdown.ts` (bloco 130).
 * Tudo é `Text` aninhado — seleção e cópia continuam funcionando como antes.
 * 24/10: `memo` — sem ele cada letra digitada no chat reprocessava todas as respostas visíveis.
 */
export const Markdown = memo(function Markdown({ texto, cor }: { texto: string; cor: string }) {
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
        <Text key={i} variant="body" color={palette.primary} style={styles.link} onPress={() => abrirLinkSeguro(t.url)}>
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
            {/* Copiar só o código com um toque (02/10): o toque longo copia a bolha inteira. */}
            <Pressable
              onPress={() => { Clipboard.setStringAsync(b.texto).catch(() => {}); haptica.leve(); }}
              hitSlop={10}
              style={styles.copiarCodigo}
              accessibilityLabel="Copiar o código"
            >
              <Feather name="copy" size={13} color={palette.textMuted} />
            </Pressable>
            <Text variant="caption" color={cor} style={styles.mono} selectable>{b.texto}</Text>
          </View>
        );
      case 'tabela': {
        // Largura por COLUNA, medida pelo texto mais longo dela: cada linha era um flex
        // independente e as colunas não alinhavam entre as linhas.
        const linhasTab = [b.cabecalho, ...b.linhas];
        const nCols = Math.max(...linhasTab.map(l => l.length));
        const larguras = Array.from({ length: nCols }, (_, ci) => {
          const maior = Math.max(0, ...linhasTab.map(l => (l[ci] ?? []).map(x => x.texto).join('').length));
          return Math.min(200, Math.max(64, maior * 7.5 + 18));
        });
        return (
          <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false}>
            <View style={[styles.tabela, { borderColor: palette.border, borderRadius: tokens.radii.sm }]}>
              {linhasTab.map((linha, li) => (
                <View key={li} style={[styles.linhaTabela, li > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  {larguras.map((w, ci) => (
                    <Text key={ci} variant="caption" color={cor} style={[styles.celula, { width: w }, li === 0 && styles.negrito]}>{trechos(linha[ci] ?? [])}</Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      }
      default:
        return <Text key={i} variant="body" color={cor}>{trechos(b.trechos)}</Text>;
    }
  };
  return <View style={{ gap: 6 }}>{blocos.map(bloco)}</View>;
});

const styles = StyleSheet.create({
  negrito: { fontWeight: '700' },
  italico: { fontStyle: 'italic' },
  mono: { fontFamily: 'monospace' },
  link: { textDecorationLine: 'underline' },
  item: { flexDirection: 'row', gap: 6 },
  marcador: { minWidth: 14 },
  codigo: { padding: 8, paddingRight: 30, borderWidth: StyleSheet.hairlineWidth },
  copiarCodigo: { position: 'absolute', top: 6, right: 6, zIndex: 1 },
  tabela: { borderWidth: StyleSheet.hairlineWidth },
  linhaTabela: { flexDirection: 'row' },
  celula: { paddingHorizontal: 8, paddingVertical: 5 },
});
