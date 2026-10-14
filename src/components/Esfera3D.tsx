import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useFala } from '../lib/falar';
import { useTheme } from '../theme';
import { reduzirUI } from '../lib/motion';
import { useAoReativar } from './AbaViva';
import {
  chuteDaBolota, envelopeDoTrecho, estadoDaBolota, impulsoDaBolota, nivelDaBolota, ondaTeclaDaBolota,
  palavrasDoTrecho, useFaseDaBolota,
} from '../lib/bolota';
import { NASCER_MS, RITMO_PENSANDO, centroDaEsfera, fatorNoturno, inclinacaoPeloArrasto } from '../lib/esferaLogica';

/**
 * A esfera 3D do Chat (fase 21) — a mesma do PC, e desde a fase 22 no mesmo lugar e com o
 * mesmo jeito: com o chat vazio fica inteira a 32% da altura; com conversa, recua (30%) atrás
 * do texto. Parada gira e respira; com voz, a superfície ondula — ciano com a dele (nível do
 * gravador), roxo com a da Ely (pelo texto do trecho), âmbar pensando.
 *
 * ~240 pontos numa esfera de Fibonacci, girados e projetados NUM WORKLET (thread de UI, sem
 * re-render): três camadas de profundidade viram três `Path` de SVG.
 *
 * Fase 22: nasce (pontos espalhados convergindo) ao abrir o Chat; sente a digitação e o envio
 * (`lib/bolota.ts`); fica mais calma à noite; e, com o chat vazio, responde ao dedo — toque é
 * um pulso, segurar fala, arrastar inclina, toque duplo liga o modo live.
 */

const N = 240;
const CORES = { dormindo: '#9678e1', ouvindo: '#4ecdc4', pensando: '#f0b240', falando: '#ba8cff' } as const;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function fibonacci(): number[] {
  const p: number[] = [];
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    p.push(Math.cos(ouro * i) * r, y, Math.sin(ouro * i) * r);
  }
  return p;
}

/** De onde cada ponto parte quando a esfera nasce: espalhados ao acaso. */
function espalhados(): number[] {
  const p: number[] = [];
  for (let i = 0; i < N; i++) p.push((Math.random() * 2 - 1) * 2.4, (Math.random() * 2 - 1) * 2.4, (Math.random() * 2 - 1) * 1.6);
  return p;
}

export interface Esfera3DProps {
  vazio: boolean;
  /** Toque na esfera (o pulso e a háptica são daqui; o Chat pode querer mais). */
  onToque?: () => void;
  /** Segurar = falar: começa ao prender, manda ao soltar. */
  onSegurarInicio?: () => void;
  onSegurarFim?: () => void;
  /** Toque duplo: modo live. */
  onDuploToque?: () => void;
}

export function Esfera3D({ vazio, onToque, onSegurarInicio, onSegurarFim, onDuploToque }: Esfera3DProps) {
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  const fala = useFala();
  const fase = useFaseDaBolota();
  const estado = estadoDaBolota(fase, fala.falando);
  const { palette } = useTheme();
  // Parada, a esfera é da cor de destaque do tema (dourada na Renascença).
  const cor = estado === 'dormindo' ? palette.primary : CORES[estado];
  const pontos = useMemo(fibonacci, []);
  const origem = useMemo(espalhados, []);

  const tamanho = Math.max(1, Math.min(caixa.w, caixa.h) * (vazio ? 0.62 : 0.86));
  const t = useSharedValue(0);
  const rot = useSharedValue(0);
  const nivel = useSharedValue(0);
  const pulso = useSharedValue(0);
  const modo = useSharedValue(0); // 0 parado · 1 ouvindo · 2 pensando · 3 falando
  const opac = useSharedValue(vazio ? 0.95 : 0.3);
  const nascer = useSharedValue(0);
  const onda = useSharedValue(-1); // -1 = sem onda; 0→1 = anel de R a 2R
  const inclAlvoX = useSharedValue(0), inclAlvoY = useSharedValue(0);
  const inclX = useSharedValue(0), inclY = useSharedValue(0), velX = useSharedValue(0), velY = useSharedValue(0);
  const giro = useSharedValue(1), brilho = useSharedValue(1), respira = useSharedValue(1);
  const segurando = useSharedValue(false);

  useEffect(() => { modo.value = estado === 'ouvindo' ? 1 : estado === 'pensando' ? 2 : estado === 'falando' ? 3 : 0; }, [estado, modo]);
  useEffect(() => { opac.value = withTiming((vazio ? 0.95 : 0.3) * brilho.value, { duration: 500 }); }, [vazio, opac, brilho]);

  // Nasce ao montar e toda vez que o Chat volta a ficar visível.
  const fazerNascer = () => {
    if (reduzirUI.value) { nascer.value = 1; return; }
    nascer.value = 0;
    nascer.value = withTiming(1, { duration: NASCER_MS, easing: Easing.out(Easing.cubic) });
  };
  useEffect(fazerNascer, []); // eslint-disable-line react-hooks/exhaustive-deps
  useAoReativar(fazerNascer);

  // De noite (22h–6h): mais devagar e mais apagada. Confere a cada minuto.
  useEffect(() => {
    const aplicar = () => {
      const f = fatorNoturno(new Date().getHours());
      giro.value = f.giro; respira.value = f.respira; brilho.value = f.brilho;
    };
    aplicar();
    const id = setInterval(aplicar, 60_000);
    return () => clearInterval(id);
  }, [giro, respira, brilho]);

  // Ely falando: o envelope do trecho, tocado a cada 50 ms (um número só, barato).
  useEffect(() => {
    if (!fala.falando || fala.pausada || !fala.trecho) { pulso.value = 0; return; }
    const { palavras, durMs } = palavrasDoTrecho(fala.trecho);
    const env = envelopeDoTrecho(palavras, durMs, 50);
    let i = 0;
    const id = setInterval(() => { pulso.value = env[i % env.length] ?? 0; i++; }, 50);
    return () => clearInterval(id);
  }, [fala.falando, fala.pausada, fala.trecho, pulso]);

  useFrameCallback((f) => {
    const dt = Math.min(0.05, (f.timeSincePreviousFrame ?? 16) / 1000);
    const lento = reduzirUI.value;
    t.value += dt * (lento ? 0.35 : 1);
    let alvo = 0;
    if (modo.value === 1) alvo = Math.min(1, nivelDaBolota.value * 1.3);
    else if (modo.value === 3) alvo = pulso.value;
    else if (modo.value === 2) alvo = 0.18 + 0.12 * Math.sin(t.value * RITMO_PENSANDO);
    // Toques pequenos (digitação, toque na esfera): um piso que decai sozinho.
    alvo = Math.max(alvo, impulsoDaBolota.value);
    impulsoDaBolota.value *= 0.9;
    ondaTeclaDaBolota.value *= 0.9;
    nivel.value += (alvo - nivel.value) * (alvo > nivel.value ? 0.35 : 0.08);
    // Mola da inclinação (k = 6, amortecimento 0,85 — a mesma do mouse no PC).
    if (chuteDaBolota.value !== 0) { velY.value += lento ? 0 : chuteDaBolota.value; chuteDaBolota.value = 0; }
    velX.value += (inclAlvoX.value - inclX.value) * 6 * dt; velX.value *= 0.85; inclX.value += velX.value;
    velY.value += (inclAlvoY.value - inclY.value) * 6 * dt; velY.value *= 0.85; inclY.value += velY.value;
    rot.value += dt * (lento ? 0.12 : 0.28 + nivel.value * 1.6) * giro.value;
  });

  const meio = tamanho / 2;
  // Um worklet que desenha uma faixa de profundidade; os três useAnimatedProps ficam no topo.
  const caminho = (faixa: number): string => {
    'worklet';
    const n = nivel.value;
    const R = tamanho * 0.3 * (1 + 0.03 * Math.sin(t.value * 1.4 * respira.value) + n * 0.14);
    const ry = rot.value + inclX.value;
    const sy = Math.sin(ry), cyR = Math.cos(ry);
    const rx = 0.42 + Math.sin(t.value * 0.23) * 0.12 + inclY.value;
    const sx = Math.sin(rx), cx = Math.cos(rx);
    const e = nascer.value, ot = ondaTeclaDaBolota.value;
    let d = '';
    for (let i = 0; i < N; i++) {
      const px = pontos[i * 3], py = pontos[i * 3 + 1], pz = pontos[i * 3 + 2];
      const onda0 = 0.012 * Math.sin(4 * py + t.value * 1.8 * respira.value)
        + n * (0.16 * Math.sin(3.1 * px + t.value * 5.3) * Math.sin(2.7 * py - t.value * 4.1) + 0.1 * Math.sin(5.3 * pz + t.value * 7.2))
        + (ot > 0.01 && py < 0 ? ot * 0.06 * py * py * Math.sin(9 * px + t.value * 12) : 0);
      const r = 1 + onda0;
      let x = px * r, y = py * r, z = pz * r;
      if (e < 1) {
        const ox = origem[i * 3], oy = origem[i * 3 + 1], oz = origem[i * 3 + 2];
        x = ox + (x - ox) * e; y = oy + (y - oy) * e; z = oz + (z - oz) * e;
      }
      const x1 = x * cyR + z * sy, z1 = -x * sy + z * cyR;
      const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      // Camada pela profundidade: 0 = atrás, 1 = meio, 2 = frente.
      const c = z2 < -0.33 ? 0 : z2 < 0.33 ? 1 : 2;
      if (c !== faixa) continue;
      const f = 2.8 / (2.8 - Math.min(2.2, z2));
      const X = meio + x1 * R * f, Y = meio + y2 * R * f;
      const rr = Math.max(0.3, (0.7 + (z2 + 1) * 0.8) * f * (1 + n * 0.35));
      d += `M${(X - rr).toFixed(1)} ${Y.toFixed(1)}a${rr.toFixed(1)} ${rr.toFixed(1)} 0 1 0 ${(2 * rr).toFixed(1)} 0a${rr.toFixed(1)} ${rr.toFixed(1)} 0 1 0 ${(-2 * rr).toFixed(1)} 0`;
    }
    return d;
  };
  const atras = useAnimatedProps(() => ({ d: caminho(0), opacity: opac.value * 0.25 }));
  const meioP = useAnimatedProps(() => ({ d: caminho(1), opacity: opac.value * 0.55 }));
  const frente = useAnimatedProps(() => ({ d: caminho(2), opacity: opac.value * 0.95 }));
  // Halo: acende com a voz e dá um flash leve enquanto a esfera nasce.
  const halo = useAnimatedProps(() => {
    const flash = nascer.value < 1 ? Math.sin(Math.PI * nascer.value) * 0.35 : 0;
    return { r: tamanho * 0.42 * (1 + nivel.value * 0.12), opacity: Math.min(1, opac.value * (0.55 + nivel.value * 0.45 + flash)) };
  });
  const anel = useAnimatedProps(() => ({ r: tamanho * 0.3 * (1.32 + nivel.value * 0.08), opacity: opac.value * (0.18 + nivel.value * 0.35) }));
  // Onda do toque: um anel saindo de R até 2R.
  const anelToque = useAnimatedProps(() => {
    const k = onda.value;
    if (k < 0) return { r: 0, opacity: 0 };
    const e = 1 - Math.pow(1 - k, 3);
    return { r: tamanho * 0.3 * (1 + e), opacity: (1 - k) * 0.7 * opac.value };
  });

  // ── gestos (só com o chat vazio) ──────────────────────────────────────────
  const pulsar = () => { 'worklet'; if (!reduzirUI.value) { onda.value = 0; onda.value = withTiming(1, { duration: 600 }); } impulsoDaBolota.value = Math.min(1, impulsoDaBolota.value + 0.6); };
  const toque = Gesture.Tap().maxDuration(250).onEnd((_e, ok) => {
    if (!ok) return;
    pulsar();
    if (onToque) runOnJS(onToque)();
  });
  const duplo = Gesture.Tap().numberOfTaps(2).onEnd((_e, ok) => {
    if (!ok) return;
    pulsar();
    if (onDuploToque) runOnJS(onDuploToque)();
  });
  const segurar = Gesture.LongPress().minDuration(350).maxDistance(30)
    .onStart(() => { segurando.value = true; if (onSegurarInicio) runOnJS(onSegurarInicio)(); })
    .onFinalize(() => { if (!segurando.value) return; segurando.value = false; if (onSegurarFim) runOnJS(onSegurarFim)(); });
  const arrastar = Gesture.Pan().minDistance(10)
    .onUpdate((e) => {
      inclAlvoX.value = inclinacaoPeloArrasto(e.translationX, tamanho);
      inclAlvoY.value = inclinacaoPeloArrasto(e.translationY, tamanho);
    })
    .onFinalize(() => { inclAlvoX.value = 0; inclAlvoY.value = 0; });
  const gestos = Gesture.Race(arrastar, segurar, Gesture.Exclusive(duplo, toque));

  // Posição: o centro desliza entre 32% (vazio) e 45% (conversa) da altura, como no PC.
  const topo = useSharedValue(0);
  useEffect(() => {
    if (!caixa.h) return;
    topo.value = withTiming(centroDaEsfera(caixa.h, vazio) - tamanho / 2, { duration: 500 });
  }, [caixa.h, vazio, tamanho, topo]);
  const posicao = useAnimatedStyle(() => ({ transform: [{ translateY: topo.value }] }));

  const aoMedir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== caixa.w || height !== caixa.h) setCaixa({ w: width, h: height });
  };

  const interativa = vazio && Boolean(onToque || onSegurarInicio || onDuploToque);
  const desenho = (
    <Animated.View
      pointerEvents={interativa ? 'auto' : 'none'}
      style={[{ width: tamanho, height: tamanho, left: (caixa.w - tamanho) / 2 }, styles.esfera, posicao]}
    >
      <Svg width={tamanho} height={tamanho}>
        <Defs>
          <RadialGradient id="nucleoEsfera" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={cor} stopOpacity={0.35} />
            <Stop offset="0.55" stopColor={cor} stopOpacity={0.1} />
            <Stop offset="1" stopColor={cor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <AnimatedCircle cx={meio} cy={meio} fill="url(#nucleoEsfera)" animatedProps={halo} />
        <AnimatedPath fill={cor} animatedProps={atras} />
        <AnimatedPath fill={cor} animatedProps={meioP} />
        <AnimatedPath fill={cor} animatedProps={frente} />
        <AnimatedCircle cx={meio} cy={meio} stroke={cor} strokeWidth={1.2} fill="none" animatedProps={anel} />
        <AnimatedCircle cx={meio} cy={meio} stroke={cor} strokeWidth={2} fill="none" animatedProps={anelToque} />
      </Svg>
    </Animated.View>
  );

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.caixa]} onLayout={aoMedir}>
      {caixa.h > 0 && (interativa ? <GestureDetector gesture={gestos}>{desenho}</GestureDetector> : desenho)}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { zIndex: 0 },
  esfera: { position: 'absolute', top: 0 },
});
