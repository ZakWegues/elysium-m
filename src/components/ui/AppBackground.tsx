import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

/**
 * Fundo do app: gradiente suave + manchas de cor do tema, EM MOVIMENTO (bloco 71).
 *
 * Não é decoração à toa — vidro só parece vidro se houver algo variado por baixo pra
 * desfocar. Sobre um fundo chapado, qualquer blur devolve exatamente a mesma cor chapada.
 *
 * 🔴 A REGRA "MAIS ELEMENTOS, MENOS MOVIMENTO" FOI REVISTA. O bloco 47 mediu que animar
 * dois GRADIENTES em tela cheia custava quadro — e custava mesmo: gradiente muda a
 * pintura, e repintar a tela inteira por quadro é caro. O que anima agora é outra coisa:
 * o `transform` (translate/scale) e a `opacity` de views já pintadas, que o compositor
 * move sem repintar nada. É a mesma classe de custo do polegar da TabBar. O Zak pediu
 * ("o fundo está muito parado e muito esquisito, principalmente no mobile"), e o caminho
 * barato existe:
 *
 *   · cada mancha deriva (até ~60 px) e respira (escala e opacidade) num ciclo próprio de
 *     14–26 s — ciclos que não coincidem é o que tira a cara de loop;
 *   · uma AURORA: um gradiente cônico grande girando devagar (110 s). Um `rotate`, nada
 *     mais;
 *   · tudo roda na thread de UI (`withRepeat` de valores compartilhados) e para de vez com
 *     "reduzir movimento" (`ReduceMotion.System`).
 *
 * Tudo continua `pointerEvents="none"`.
 */

/** Quantas camadas formam cada mancha. Mais que isto não muda o que o olho vê. */
const CAMADAS = 7;

/**
 * 🔴 O React Native não tem equivalente ao `filter: blur()`.
 *
 * Sem dependência nova, a saída é somar círculos concêntricos: o de fora é o maior e o mais
 * fraco, o de dentro é o menor e o mais forte. A soma das opacidades cria uma queda suave da
 * borda para o centro — uma gaussiana barata, que é o que o olho lê como desfoque.
 */
function Mancha({ cor, opacidade, tamanho, style, deriva }: {
  cor: string;
  opacidade: number;
  tamanho: number;
  style: object;
  /** Amplitude (px) e período (ms) do movimento desta mancha. */
  deriva: { dx: number; dy: number; ms: number; escala: number };
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    // 0 → 1 → 0, para sempre. `reverse: true` evita o salto de volta ao início.
    t.value = withRepeat(
      withTiming(1, { duration: deriva.ms, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [deriva.ms, t]);

  const estilo = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * deriva.dx },
      { translateY: t.value * deriva.dy },
      { scale: 1 + (deriva.escala - 1) * t.value },
    ],
    // Respira ~15% junto com a deriva; a opacidade base já está nas camadas.
    opacity: 0.86 + 0.14 * t.value,
  }));

  return (
    <Animated.View style={[{ width: tamanho, height: tamanho }, style, estilo]} pointerEvents="none">
      {Array.from({ length: CAMADAS }, (_, i) => {
        // A camada 0 é a maior e a mais fraca; a última é a menor e a mais concentrada.
        const fracao = 1 - i / CAMADAS;
        const lado = tamanho * fracao;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: (tamanho - lado) / 2,
              left: (tamanho - lado) / 2,
              width: lado,
              height: lado,
              borderRadius: lado / 2,
              backgroundColor: cor,
              // Dividir pelas camadas: empilhar sete vezes a opacidade cheia daria um disco
              // sólido de novo. Como a composição é 1-(1-a)^n, o pico no centro fica em
              // ~84% do valor pedido (0,42 vira 0,35) e a borda em ~6% — que é justamente
              // a queda suave que se quer.
              opacity: opacidade / CAMADAS,
            }}
          />
        );
      })}
    </Animated.View>
  );
}

/**
 * A aurora: um disco maior que a tela com um gradiente em faixas nas cores do tema,
 * girando devagar. Como o gradiente é linear (não há cônico no expo-linear-gradient), as
 * faixas diagonais girando produzem o mesmo efeito de "luz que varre" — e a rotação é o
 * único valor animado, composto na GPU.
 */
function Aurora({ cores, opacidade }: { cores: [string, string, string]; opacidade: number }) {
  const angulo = useSharedValue(0);

  useEffect(() => {
    angulo.value = withRepeat(
      withTiming(360, { duration: 110_000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
      -1,
      false,
    );
    return () => cancelAnimation(angulo);
  }, [angulo]);

  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${angulo.value}deg` }] }));

  return (
    <Animated.View style={[styles.aurora, { opacity: opacidade }, estilo]} pointerEvents="none">
      <LinearGradient
        colors={['transparent', cores[0], 'transparent', cores[1], 'transparent', cores[2], 'transparent']}
        locations={[0, 0.18, 0.36, 0.52, 0.68, 0.84, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Feixes de luz — o elemento que só a família ELYSIUM tem.
 *
 * É a contrapartida do `#ely-shafts` do `dashboard.html`: duas faixas diagonais bem
 * fracas, como luz entrando de cima. Deslizam devagar (translateX, 40 s e 56 s).
 */
function Feixe({ cor, opacidade, left, rot, ms, dx }: { cor: string; opacidade: number; left: `${number}%`; rot: string; ms: number; dx: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }), -1, true);
    return () => cancelAnimation(t);
  }, [ms, t]);
  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * dx }, { rotate: rot }],
    opacity: opacidade * (0.7 + 0.3 * t.value),
  }));
  return (
    <Animated.View style={[styles.feixe, { left }, estilo]} pointerEvents="none">
      <LinearGradient
        colors={['transparent', cor, 'transparent']}
        locations={[0.15, 0.5, 0.85]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Traços de luz: linhas finas e longas, quase invisíveis, atravessando a tela na diagonal.
 * São o que dá DIREÇÃO ao fundo — as manchas dão profundidade, mas não dizem para onde a
 * luz vai. Duas bastam; três já lê como padrão de papel de parede. Ficam paradas: linha
 * de 2 px em movimento vira cintilação.
 */
function Tracos({ cor, forca }: { cor: string; forca: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['transparent', cor, 'transparent']}
        locations={[0.1, 0.5, 0.9]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.traco, { top: '28%', opacity: forca, transform: [{ rotate: '-32deg' }] }]}
      />
      <LinearGradient
        colors={['transparent', cor, 'transparent']}
        locations={[0.2, 0.5, 0.8]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.traco, { top: '62%', opacity: forca * 0.7, transform: [{ rotate: '-28deg' }] }]}
      />
    </View>
  );
}

/**
 * As partículas.
 *
 * 🔴 AS POSIÇÕES SÃO UMA CONSTANTE DE MÓDULO, não um `Math.random()` no corpo do
 * componente. Sorteadas na render, elas mudariam de lugar a cada troca de tema ou de
 * orientação — o fundo piscaria. Percentuais, para acompanharem qualquer tamanho de tela.
 * A camada inteira deriva 18 px num ciclo lento — um movimento só para 15 pontos.
 */
const PARTICULAS = [
  { x: '12%', y: '14%', d: 3 }, { x: '31%', y: '7%',  d: 2 }, { x: '68%', y: '11%', d: 2 },
  { x: '84%', y: '22%', d: 3 }, { x: '22%', y: '33%', d: 2 }, { x: '57%', y: '29%', d: 4 },
  { x: '78%', y: '41%', d: 2 }, { x: '15%', y: '52%', d: 3 }, { x: '44%', y: '58%', d: 2 },
  { x: '88%', y: '63%', d: 2 }, { x: '27%', y: '71%', d: 4 }, { x: '62%', y: '77%', d: 3 },
  { x: '9%',  y: '84%', d: 2 }, { x: '73%', y: '89%', d: 2 }, { x: '40%', y: '93%', d: 3 },
] as const;

function Particulas({ cor, forca }: { cor: string; forca: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 38_000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }), -1, true);
    return () => cancelAnimation(t);
  }, [t]);
  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * 18 }, { translateY: -t.value * 24 }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, estilo]} pointerEvents="none">
      {PARTICULAS.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.d,
            height: p.d,
            borderRadius: p.d / 2,
            backgroundColor: cor,
            // As maiores um pouco mais fortes: uniformizar tira a leitura de distância.
            opacity: forca * (0.6 + p.d / 10),
          }}
        />
      ))}
    </Animated.View>
  );
}

export function AppBackground() {
  const { palette, familiaResolvida } = useTheme();
  const noite = familiaResolvida !== 'lg';

  // O meio do gradiente clareia no vidro e escurece na noite. Um valor fixo deixaria uma
  // faixa clara atravessando a tela na família escura.
  const middle = noite ? '#12151D' : '#EEF0F6';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[palette.background, middle, palette.background]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Aurora cores={[palette.primary, palette.accent, palette.primarySoft]} opacidade={noite ? 0.10 : 0.16} />
      {/* Mais forte na noite: sobre fundo quase preto, pouca opacidade some. */}
      <Mancha cor={palette.primary} opacidade={noite ? 0.42 : 0.26} tamanho={420} style={styles.top}
        deriva={{ dx: -50, dy: 40, ms: 16_000, escala: 1.12 }} />
      <Mancha cor={palette.accent}  opacidade={noite ? 0.34 : 0.22} tamanho={440} style={styles.bottom}
        deriva={{ dx: 60, dy: -50, ms: 21_000, escala: 1.08 }} />
      {/* As duas do meio existem para o vidro ter variação onde ficam os cards. */}
      <Mancha cor={palette.accent}  opacidade={noite ? 0.22 : 0.15} tamanho={300} style={styles.meioEsq}
        deriva={{ dx: 45, dy: 30, ms: 14_000, escala: 0.9 }} />
      <Mancha cor={palette.primary} opacidade={noite ? 0.20 : 0.13} tamanho={260} style={styles.meioDir}
        deriva={{ dx: -40, dy: -60, ms: 26_000, escala: 1.15 }} />
      <Tracos cor={palette.primary} forca={noite ? 0.05 : 0.07} />
      <Particulas cor={noite ? '#FFFFFF' : palette.primary} forca={noite ? 0.22 : 0.16} />
      {noite && (
        <>
          <Feixe cor={palette.primary} opacidade={0.07} left="-5%" rot="-18deg" ms={40_000} dx={70} />
          <Feixe cor={palette.primary} opacidade={0.045} left="35%" rot="-24deg" ms={56_000} dx={-90} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: -130, right: -110 },
  bottom: { position: 'absolute', bottom: 10, left: -150 },
  meioEsq: { position: 'absolute', top: '32%', left: -120 },
  meioDir: { position: 'absolute', top: '54%', right: -90 },
  // Fino e longo: comprimento maior que a diagonal da tela para o giro não deixar ponta à
  // vista, e 2 px de altura porque acima disso deixa de ser traço e vira faixa.
  traco: { position: 'absolute', left: '-30%', width: '160%', height: 2 },
  // Mais alto que a tela para a diagonal não deixar canto vazio ao girar.
  feixe: { position: 'absolute', top: '-25%', width: '55%', height: '150%' },
  // Disco maior que a diagonal de qualquer telefone (≈ 1000 px), centrado.
  aurora: { position: 'absolute', width: 1400, height: 1400, borderRadius: 700, top: '50%', left: '50%', marginTop: -700, marginLeft: -700 },
});
