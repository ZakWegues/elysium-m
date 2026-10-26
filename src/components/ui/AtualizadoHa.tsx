import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Text } from './Text';
import { useAbaAtiva } from '../AbaViva';
import { haQuanto } from '../conexao/IndicadorConexao';

/**
 * "Atualizado há 3 min" (26/10, modo offline): aparece quando a tela mostra dados guardados e o
 * PC não está respondendo. Atualiza o texto a cada 30 s, só com a aba à vista.
 */
export function AtualizadoHa({ em }: { em: number | null }) {
  const { palette } = useTheme();
  const ativa = useAbaAtiva();
  const [, tique] = useState(0);
  useEffect(() => {
    if (!ativa || !em) return;
    const t = setInterval(() => tique((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [ativa, em]);
  if (!em) return null;
  return (
    <View style={styles.linha} accessibilityLabel={`Dados guardados, atualizados ${haQuanto(em)}`}>
      <Feather name="clock" size={12} color={palette.textMuted} />
      <Text variant="caption" color={palette.textMuted} style={{ fontSize: 12 }}>Atualizado {haQuanto(em)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
