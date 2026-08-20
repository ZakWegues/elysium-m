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
        // Tinta clara sobre fundo escuro deixaria o vidro leitoso e clarearia a tela
        // inteira; a paleta diz qual usar.
        tint={palette.blurTint}
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
        // 🔴 Isto já foi um gradiente branco fixo em `absoluteFill` — ou seja, cobrindo a
        // superfície INTEIRA de todo card e botão de vidro, apesar do nome "borda". No modo
        // claro passava despercebido; no escuro deixava o app inteiro leitoso, e era a
        // causa principal do modo escuro feio.
        //
        // Vidro real tem o brilho na ARESTA DE CIMA, onde a luz bate — é assim que o
        // GlassModal sempre desenhou. A intensidade agora vem da paleta, então o escuro
        // recebe um quinto do branco do claro.
        <LinearGradient
          colors={palette.glassSheen}
          locations={[0, 1]}
          pointerEvents="none"
          style={styles.sheen}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Altura fixa e não proporcional: o brilho é um reflexo na aresta, e reflexo não cresce
  // junto com o card. Num card alto, uma fração da altura viraria de novo um véu.
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 44 },
});
