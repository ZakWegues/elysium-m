import { Linking, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { Text } from './ui';
import { useTheme } from '../theme';
import { partesComLinks } from '../lib/links';

/**
 * Texto simples com os links clicáveis (fase 23) — a minha mensagem no chat da Ely e os
 * recados da Caixa. O Android entrega o link ao app certo (YouTube, Instagram…).
 */
export function TextoComLinks({ texto, cor, variant = 'body', style }: {
  texto: string; cor: string; variant?: 'body' | 'caption'; style?: StyleProp<TextStyle>;
}) {
  const { palette } = useTheme();
  const partes = partesComLinks(texto);
  if (partes.length === 1 && partes[0].tipo === 'texto') return <Text variant={variant} color={cor} style={style}>{texto}</Text>;
  return (
    <Text variant={variant} color={cor} style={style}>
      {partes.map((p, i) => p.tipo === 'texto' ? p.texto : (
        <Text key={i} variant={variant} color={cor === palette.text ? palette.primary : cor} style={styles.link}
          onPress={() => { Linking.openURL(p.url).catch(() => {}); }}>
          {p.texto}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({ link: { textDecorationLine: 'underline' } });
