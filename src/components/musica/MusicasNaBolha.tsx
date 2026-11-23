import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MusicasDaResposta } from '../../lib/chatHistoryStore';
import type { Pairing } from '../../lib/pairing';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { FolhaMusica } from './FolhaMusica';
import { LinhaDeMusica } from './Sugestoes';

/** As músicas que a Ely sugeriu, embaixo da resposta (23/11). */
export function MusicasNaBolha({ pairing, musicas }: { pairing: Pairing; musicas: MusicasDaResposta }) {
  const { palette, tokens } = useTheme();
  const [folha, setFolha] = useState(false);
  return (
    <View style={[styles.caixa, { backgroundColor: palette.bolhaEla, borderColor: palette.bolhaElaBorda, borderRadius: tokens.radii.lg }]}>
      {musicas.itens.map((m) => <LinhaDeMusica key={m.id} pairing={pairing} m={m} comMotivo />)}
      {musicas.aprendi.length ? (
        <Pressable onPress={() => setFolha(true)} hitSlop={6} accessibilityRole="button" style={{ paddingTop: 4 }}>
          <Text variant="caption" color={palette.textMuted}>Anotei que você gosta de {musicas.aprendi.join(', ')}</Text>
        </Pressable>
      ) : null}
      {folha ? <FolhaMusica pairing={pairing} abaInicial="musicas" onFechar={() => setFolha(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { alignSelf: 'stretch', marginTop: 6, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, gap: 2 },
});
