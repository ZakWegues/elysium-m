import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';

/**
 * Fase 23.1: os micro-detalhes do PC no celular — o estouro de partículas ao concluir um
 * hábito ou tarefa (estilo Strava) e os fogos discretos quando todos os hábitos do dia
 * fecham (estilo Chrome). Mesma receita do `estourar()`/`fogos()` do `nucleo.js` do desktop.
 *
 * Uma camada só, montada na raiz; quem quer um estouro chama `estourar(x, y)` com a posição
 * do toque. Nada pega toque; com "reduzir movimento" as partículas não saem.
 */

type Rajada = { id: number; x: number; y: number; n: number };
let ouvinte: ((r: Rajada) => void) | null = null;
let seq = 0;

/** Onde foi o último toque na tela (a raiz do App atualiza) — o estouro sai dali. */
let toque = { x: 0, y: 0 };
export function registrarToque(x: number, y: number) { toque = { x, y }; }
/** Estouro no lugar do último toque: o botão de concluir que acabou de ser apertado. */
export function estourarNoToque(n = 14) { estourar(toque.x, toque.y, n); }

/** Estoura `n` partículas a partir de (x, y) da tela. */
export function estourar(x: number, y: number, n = 14) {
  ouvinte?.({ id: ++seq, x, y, n });
}

/** Três estouros grandes no alto da tela, em sequência. */
export function fogos(largura: number, altura: number) {
  [[0.3, 0.26, 0], [0.66, 0.18, 180], [0.48, 0.34, 360]].forEach(([fx, fy, atraso]) =>
    setTimeout(() => estourar(largura * fx, altura * fy, 26), atraso));
}

function Particula({ x, y, ang, dist, cor, dur, tam }: { x: number; y: number; ang: number; dist: number; cor: string; dur: number; tam: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: dur, easing: Easing.bezier(0.2, 0.7, 0.3, 1), reduceMotion: ReduceMotion.System });
  }, [t, dur]);
  const estilo = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [
      { translateX: Math.cos(ang) * dist * t.value },
      { translateY: Math.sin(ang) * dist * t.value },
      { scale: 1 - 0.8 * t.value },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', left: x - tam / 2, top: y - tam / 2, width: tam, height: tam, borderRadius: tam / 2, backgroundColor: cor }, estilo]} />;
}

export function CamadaEstouros() {
  const { palette } = useTheme();
  const [rajadas, setRajadas] = useState<Rajada[]>([]);
  useWindowDimensions();
  useEffect(() => {
    ouvinte = (r) => {
      setRajadas(l => [...l, r]);
      setTimeout(() => setRajadas(l => l.filter(x => x.id !== r.id)), 900);
    };
    return () => { ouvinte = null; };
  }, []);
  if (!rajadas.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {rajadas.map(r => Array.from({ length: r.n }, (_, i) => {
        // Determinístico por índice (sem sortear na render): ângulo com um desvio fixo.
        const ang = (i / r.n) * Math.PI * 2 + ((i * 37) % 10) * 0.04;
        const dist = 22 + ((i * 53) % 26);
        const cor = i % 3 === 0 ? palette.success : palette.primary;
        return <Particula key={`${r.id}-${i}`} x={r.x} y={r.y} ang={ang} dist={r.n > 20 ? dist * 1.8 : dist} cor={cor} dur={520 + ((i * 29) % 200)} tam={i % 5 === 0 ? 4 : 6} />;
      }))}
    </View>
  );
}
