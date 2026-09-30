import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { haptica } from '../lib/haptica';

/**
 * Slider do volume do PC (fase 12).
 *
 * Estava no backlog como "precisa de módulo nativo" — o `Slider` saiu do core do React
 * Native e o da comunidade é nativo. Mas o app já tem `gesture-handler` e `reanimated`
 * (bloco 51): uma trilha com um Pan e um Tap resolve em JS puro, e chega por OTA.
 *
 * O dedo mexe só o shared value (thread de UI, sem render por quadro). O PC recebe no
 * máximo um `volume.set` a cada 150 ms durante o arrasto e o valor final ao soltar — sem
 * isso, cada pixel virava uma chamada e o PowerShell do Core Audio enfileirava dezenas.
 *
 * 🔴 Worklet não enxerga constante de módulo nem valor padrão de parâmetro (§23): tudo que
 * os callbacks do gesto usam está DENTRO deles ou chega por shared value.
 */
export default function SliderVolume({ nivel, mudo, aoMudar }: {
  nivel: number;
  mudo: boolean;
  /** Recebe 0–100. `final` = o dedo soltou. */
  aoMudar: (valor: number, final: boolean) => void;
}) {
  const { palette } = useTheme();
  const largura = useSharedValue(0);
  const valor = useSharedValue(nivel);
  const arrastando = useSharedValue(false);
  const [mostrado, setMostrado] = useState(nivel);
  const ultimoEnvio = useRef(0);

  // Leitura nova do PC (fora de um arrasto) move o polegar.
  useEffect(() => {
    if (!arrastando.value) { valor.value = nivel; setMostrado(nivel); }
  }, [nivel, arrastando, valor]);

  function mudou(v: number, final: boolean) {
    setMostrado(v);
    const agora = Date.now();
    if (final || agora - ultimoEnvio.current > 150) {
      ultimoEnvio.current = agora;
      aoMudar(v, final);
    }
    if (final) haptica.leve();
  }

  const pan = Gesture.Pan()
    .minDistance(2)
    .onBegin((e) => {
      arrastando.value = true;
      const w = largura.value || 1;
      valor.value = Math.round(Math.min(100, Math.max(0, (e.x / w) * 100)));
      runOnJS(mudou)(valor.value, false);
    })
    .onUpdate((e) => {
      const w = largura.value || 1;
      const v = Math.round(Math.min(100, Math.max(0, (e.x / w) * 100)));
      if (v !== valor.value) {
        valor.value = v;
        runOnJS(mudou)(v, false);
      }
    })
    .onFinalize(() => {
      arrastando.value = false;
      runOnJS(mudou)(valor.value, true);
    });

  const preenchido = useAnimatedStyle(() => ({ width: `${valor.value}%` }));
  const polegar = useAnimatedStyle(() => ({ left: `${valor.value}%` }));

  const cor = mudo ? palette.textMuted : palette.primary;
  return (
    <View style={styles.linha}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.area}
          onLayout={(e: LayoutChangeEvent) => { largura.value = e.nativeEvent.layout.width; }}
          accessibilityRole="adjustable"
          accessibilityLabel="Volume do PC"
          accessibilityValue={{ min: 0, max: 100, now: mostrado }}
        >
          <View style={[styles.trilha, { backgroundColor: palette.primarySoft }]}>
            <Animated.View style={[styles.cheio, { backgroundColor: cor }, preenchido]} />
          </View>
          <Animated.View style={[styles.polegar, { backgroundColor: cor, borderColor: palette.background }, polegar]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flex: 1, justifyContent: 'center' },
  // Área de toque alta (32) para uma trilha fina (6): o dedo não precisa de mira.
  area: { height: 32, justifyContent: 'center' },
  trilha: { height: 6, borderRadius: 3, overflow: 'hidden' },
  cheio: { height: '100%', borderRadius: 3 },
  polegar: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9, borderWidth: 2, top: 7 },
});
