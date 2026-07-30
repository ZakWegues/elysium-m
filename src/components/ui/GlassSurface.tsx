import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

/**
 * Preenchimento de vidro: blur real + tinta translúcida + brilho reflexivo na borda.
 *
 * Renderiza absoluto — usar dentro de um container com `overflow: 'hidden'` e o
 * borderRadius desejado.
 *
 * `blurMethod` é obrigatório no Android: o default do expo-blur é 'none', que
 * renderiza só uma view semi-transparente sem desfoque nenhum.
 */
export function GlassFill({
  intensity = 40,
  strong = false,
  edge = true,
}: {
  intensity?: number;
  strong?: boolean;
  edge?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <>
      <BlurView
        intensity={intensity}
        tint="light"
        blurMethod="dimezisBlurViewSdk31Plus"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: strong ? palette.glassSurfaceStrong : palette.glassSurface },
        ]}
      />
      {edge && (
        <LinearGradient
          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.22)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      )}
    </>
  );
}
