import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useFala } from '../lib/falar';
import { useTheme } from '../theme';
import { reduzirUI } from '../lib/motion';
import { envelopeDoTrecho, estadoDaBolota, nivelDaBolota, palavrasDoTrecho, useFaseDaBolota } from '../lib/bolota';
import { RITMO_PENSANDO, fatorNoturno } from '../lib/esferaLogica';

/**
 * A esfera 3D no fundo do Chat (fase 21) — a mesma do PC.
 *
 * Parada no fundo, girando e respirando; quando alguém fala, ela se mexe: a superfície ondula
 * com a voz — ciano com a dele (nível do gravador), roxo com a da Ely (pelo texto do trecho),
 * âmbar pensando. Com o chat vazio fica inteira no meio da tela; com conversa, maior e apagada
 * atrás do texto.
 *
 * 22.1 (14/10, pedido do Zak): sem toque nela e sem os efeitos de "nascer"/digitar — ela é
 * fundo, não botão. Fica só a reação à voz e a calma da noite (22h–6h).
 *
 * ~240 pontos numa esfera de Fibonacci, girados e projetados NUM WORKLET (thread de UI, sem
 * re-render): três camadas de profundidade viram três `Path` de SVG.
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

export function Esfera3D({ vazio }: { vazio: boolean }) {
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  const fala = useFala();
  const fase = useFaseDaBolota();
  const estado = estadoDaBolota(fase, fala.falando);
  const { palette } = useTheme();
  // Parada, a esfera é da cor de destaque do tema (dourada na Renascença).
  const cor = estado === 'dormindo' ? palette.primary : CORES[estado];
  const pontos = useMemo(fibonacci, []);
  const ritmo = RITMO_PENSANDO;

  const tamanho = Math.max(1, Math.min(caixa.w, caixa.h) * (vazio ? 0.7 : 0.86));
  const t = useSharedValue(0);
  const rot = useSharedValue(0);
  const nivel = useSharedValue(0);
  const pulso = useSharedValue(0);
  const modo = useSharedValue(0); // 0 parado · 1 ouvindo · 2 pensando · 3 falando
  const opac = useSharedValue(vazio ? 0.95 : 0.3);
  const giro = useSharedValue(1), respira = useSharedValue(1), brilho = useSharedValue(1);

  useEffect(() => { modo.value = estado === 'ouvindo' ? 1 : estado === 'pensando' ? 2 : estado === 'falando' ? 3 : 0; }, [estado, modo]);
  useEffect(() => { opac.value = withTiming(vazio ? 0.95 : 0.3, { duration: 500 }); }, [vazio, opac]);

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
    else if (modo.value === 2) alvo = 0.18 + 0.12 * Math.sin(t.value * ritmo);
    nivel.value += (alvo - nivel.value) * (alvo > nivel.value ? 0.35 : 0.08);
    rot.value += dt * (lento ? 0.12 : 0.28 + nivel.value * 1.6) * giro.value;
  });

  const meio = tamanho / 2;
  // Um worklet que desenha uma faixa de profundidade; os três useAnimatedProps ficam no topo.
  const caminho = (faixa: number): string => {
    'worklet';
    const n = nivel.value;
    const R = tamanho * 0.3 * (1 + 0.03 * Math.sin(t.value * 1.4 * respira.value) + n * 0.14);
    const sy = Math.sin(rot.value), cyR = Math.cos(rot.value);
    const rx = 0.42 + Math.sin(t.value * 0.23) * 0.12;
    const sx = Math.sin(rx), cx = Math.cos(rx);
    let d = '';
    for (let i = 0; i < N; i++) {
      const px = pontos[i * 3], py = pontos[i * 3 + 1], pz = pontos[i * 3 + 2];
      const onda = 0.012 * Math.sin(4 * py + t.value * 1.8 * respira.value)
        + n * (0.16 * Math.sin(3.1 * px + t.value * 5.3) * Math.sin(2.7 * py - t.value * 4.1) + 0.1 * Math.sin(5.3 * pz + t.value * 7.2));
      const r = 1 + onda;
      const x = px * r, y = py * r, z = pz * r;
      const x1 = x * cyR + z * sy, z1 = -x * sy + z * cyR;
      const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      // Camada pela profundidade: 0 = atrás, 1 = meio, 2 = frente.
      const c = z2 < -0.33 ? 0 : z2 < 0.33 ? 1 : 2;
      if (c !== faixa) continue;
      const f = 2.8 / (2.8 - z2);
      const X = meio + x1 * R * f, Y = meio + y2 * R * f;
      const rr = (0.7 + (z2 + 1) * 0.8) * f * (1 + n * 0.35);
      d += `M${(X - rr).toFixed(1)} ${Y.toFixed(1)}a${rr.toFixed(1)} ${rr.toFixed(1)} 0 1 0 ${(2 * rr).toFixed(1)} 0a${rr.toFixed(1)} ${rr.toFixed(1)} 0 1 0 ${(-2 * rr).toFixed(1)} 0`;
    }
    return d;
  };
  const atras = useAnimatedProps(() => ({ d: caminho(0), opacity: opac.value * brilho.value * 0.25 }));
  const meioP = useAnimatedProps(() => ({ d: caminho(1), opacity: opac.value * brilho.value * 0.55 }));
  const frente = useAnimatedProps(() => ({ d: caminho(2), opacity: opac.value * brilho.value * 0.95 }));
  const halo = useAnimatedProps(() => ({ r: tamanho * 0.42 * (1 + nivel.value * 0.12), opacity: opac.value * brilho.value * (0.55 + nivel.value * 0.45) }));
  const anel = useAnimatedProps(() => ({ r: tamanho * 0.3 * (1.32 + nivel.value * 0.08), opacity: opac.value * brilho.value * (0.18 + nivel.value * 0.35) }));

  const aoMedir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== caixa.w || height !== caixa.h) setCaixa({ w: width, h: height });
  };

  // Vazia: um pouco acima do meio (o campo de texto ocupa o rodapé). Com conversa: no meio.
  const topo = caixa.h * (vazio ? 0.42 : 0.5) - tamanho / 2;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.caixa]} onLayout={aoMedir}>
      {caixa.h > 0 && (
        <View style={{ position: 'absolute', top: topo, left: (caixa.w - tamanho) / 2, width: tamanho, height: tamanho }}>
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
          </Svg>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { zIndex: 0 },
});
