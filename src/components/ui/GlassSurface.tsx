import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { useBlurTarget } from './BlurTarget';

/**
 * Preenchimento de vidro: blur real + tinta translúcida + brilho reflexivo na borda.
 *
 * Renderiza absoluto — usar dentro de um container com `overflow: 'hidden'` e o
 * borderRadius desejado.
 *
 * `blurMethod` é obrigatório no Android: o default do expo-blur é 'none', que
 * renderiza só uma view semi-transparente sem desfoque nenhum. E desde o expo-blur 57
 * o método do Android também exige `blurTarget` — sem ele a lib avisa e volta pro
 * 'none' sozinha. O ref vem do `BlurTargetProvider`, montado na raiz do app.
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
  const blurTarget = useBlurTarget();

  return (
    <>
      <BlurView
        intensity={intensity}
        tint="light"
        // Sem alvo, o método do Android avisa no console e cai pro 'none' sozinho.
        // Pedir 'none' direto dá o mesmo resultado visual, sem o aviso.
        blurMethod={blurTarget ? 'dimezisBlurViewSdk31Plus' : 'none'}
        blurTarget={blurTarget}
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
