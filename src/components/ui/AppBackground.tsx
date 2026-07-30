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
  const { palette } = useTheme();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[palette.background, '#EEF0F6', palette.background]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobTop, { backgroundColor: palette.primary, opacity: 0.16 }]} />
      <View style={[styles.blob, styles.blobBottom, { backgroundColor: palette.accent, opacity: 0.14 }]} />
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
