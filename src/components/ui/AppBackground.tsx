import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

/**
 * Fundo do app: gradiente suave + duas manchas de cor do tema.
 *
 * Não é decoração à toa — vidro só parece vidro se houver algo variado por baixo pra
 * desfocar. Sobre um fundo chapado, qualquer blur devolve exatamente a mesma cor chapada.
 */
export function AppBackground() {
  const { palette, resolvedScheme } = useTheme();
  const dark = resolvedScheme === 'dark';

  // O meio do gradiente clareia no modo claro e escurece no modo escuro. Um valor fixo
  // deixaria uma faixa clara atravessando a tela no escuro.
  const middle = dark ? '#12151D' : '#EEF0F6';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[palette.background, middle, palette.background]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Manchas mais fortes no escuro: sobre fundo quase preto, 16% some. */}
      <View style={[styles.blob, styles.blobTop, { backgroundColor: palette.primary, opacity: dark ? 0.26 : 0.16 }]} />
      <View style={[styles.blob, styles.blobBottom, { backgroundColor: palette.accent, opacity: dark ? 0.20 : 0.14 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  blobTop: { top: -90, right: -70 },
  blobBottom: { bottom: 40, left: -110 },
});
