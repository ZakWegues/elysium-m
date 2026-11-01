import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { useBlurTarget } from './BlurTarget';
import { VidroNativo, VIDRO_NATIVO } from '../vidro/VidroNativo';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
/**
 * 🔴 `blur` é OPCIONAL, e o padrão dele é o achado de desempenho deste bloco.
 *
 * A Início montava OITO `BlurView` ao mesmo tempo (seis cards + cabeçalho + barra de
 * abas), todas em `dimezisBlurViewSdk31Plus`, sobre um fundo de manchas e gradientes.
 * Cada quadro de rolagem sujava a região de todas elas — recaptura e desfoque de oito
 * regiões por quadro, na thread de render. Era a causa dominante do engasgo ao rolar, e
 * nenhuma quantidade de Reanimated conserta isso: o custo não está na thread de JS.
 *
 * Então blur REAL ficou só onde ele é fixo e único na tela — cabeçalho, barra de abas,
 * gaveta, popover, e os botões redondos do composer. Card usa `blur={false}`: tinta
 * chapada translúcida, que sobre um fundo com manchas continua lendo como vidro fosco e
 * custa uma view em vez de uma recaptura.
 */
/**
 * 🔴 AS DUAS FAMÍLIAS SÃO DUAS LINGUAGENS, E ISTO É ONDE ELAS DIVERGEM (bloco 70).
 *
 * O Zak, 18/09: "o tema Liquid Glass do mobile simplesmente não tem Liquid Glass, é só um
 * blur; e nos temas do ELYSIUM está muito zoado — zere o Liquid Glass e deixe no máximo um
 * blur extremamente levinho". Então:
 *
 * · **ELYSIUM (noite)** — o desfoque cai para `BLUR_NOITE` (era 40–100) e a
 *   tinta sobe: a superfície lê como um painel escuro quase sólido com um leve véu, não
 *   como vidro. Sem brilho de aresta além do fio de luz da borda.
 *
 * · **Vidro Líquido (dia)** — o desfoque sobe e ganha o que faltava para parecer vidro e
 *   não "blur": uma ARESTA ESPECULAR (fio branco no topo e à esquerda, de onde vem a
 *   luz), uma LENTE (mancha branca difusa no canto superior esquerdo, como a luz
 *   refratando na curva) e uma SOMBRA INTERNA no pé (o vidro é mais denso embaixo). Tudo
 *   é View e LinearGradient — nada por quadro, nada de custo novo.
 */
/**
 * 🔴 Bloco 128 (01/10): o Zak pediu de novo, agora sem meio-termo — "tire totalmente o
 * liquid glass dos temas ELYSIUM, deixe só um levíssimo blur". O bloco 70 tinha deixado o
 * fio especular nas arestas, a borda de vidro e o reflexo do modal; tudo isso sai na noite.
 * Sobra um desfoque fixo e mínimo e a tinta quase sólida da paleta.
 */
const BLUR_NOITE = 6;

/**
 * 31/10: o vidro líquido dos botões pequenos (topo das telas, atalhos, chips): tinta escura
 * translúcida com borda clara fina — a mesma da barra de abas. Sem desfoque real: são muitos
 * e o fundo colorido atrás já dá o efeito.
 */
export const VIDRO_BOTAO = {
  backgroundColor: 'rgba(22,22,26,0.42)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.16)',
} as const;

/**
 * 30/10 — o vidro sem véu branco (o Zak: "leitoso, parece tinta branca por cima"):
 *
 * · **Dark** e **Stark**: painel quase sólido da cor do tema, com um desfoque mínimo (a
 *   noite do ELYSIUM de antes).
 * · **Glass**: desfoque de verdade com tinta ESCURA da cor do tema; a cena colorida atrás é
 *   que dá o vidro. Só um fio fino de luz no topo — nada de gradiente branco por cima.
 */
export function GlassFill({
  intensity = 40,
  strong = false,
  edge = true,
  blur = true,
  tintColor,
  alvo,
}: {
  intensity?: number;
  strong?: boolean;
  edge?: boolean;
  /** `false` troca o desfoque real por tinta chapada — ver o comentário acima. */
  blur?: boolean;
  /** Sobrepõe a tinta da paleta. Usado pela gaveta, que é a exceção de alfa alto. */
  tintColor?: string;
  /** Outro alvo de desfoque (a barra de abas desfoca as telas, não só o fundo). */
  alvo?: React.RefObject<View | null>;
}) {
  const { palette } = useTheme();
  const alvoPadrao = useBlurTarget();
  const blurTarget = alvo ?? alvoPadrao;
  const vidro = palette.familia === 'glass';
  // Com `alvo` (a barra de abas) o desfoque é forte em todos os temas: ela fica por cima das
  // telas, e com o mínimo da noite o texto que passa por baixo brigaria com os ícones.
  const forca = vidro || alvo ?Math.min(90, Math.round(intensity * 1.2)) : BLUR_NOITE;

  return (
    <>
      {blur && (
      <BlurView
        intensity={forca}
        tint="dark"
        // Sem alvo, o método do Android avisa no console e cai pro 'none' sozinho.
        blurMethod={blurTarget ? 'dimezisBlurViewSdk31Plus' : 'none'}
        blurTarget={blurTarget}
        style={StyleSheet.absoluteFill}
      />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: tintColor ?? (strong ? palette.glassSurfaceStrong : palette.glassSurface) },
        ]}
      />
      {vidro && edge && <FioDeLuz />}
    </>
  );
}

/** O único brilho do vidro: um fio de 1 px no topo, mais forte no meio e sumindo nas pontas. */
function FioDeLuz() {
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      pointerEvents="none"
      style={styles.fioTopo}
    />
  );
}

const styles = StyleSheet.create({
  fioTopo: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});

/**
 * Botão redondo de vidro, estética iOS: círculo translúcido levemente borrado, ícone fino
 * em `currentColor`, sem glow.
 *
 * Existe como componente porque os dois lados do switch do Chat (IA e PC) e os dois
 * cantos do cabeçalho precisam do MESMO círculo — copiar o estilo em quatro lugares foi
 * como a bolinha dos presets acabou sendo a única com borda de vidro no app inteiro.
 *
 * O blur aqui é real e barato: são regiões de 44 px, fixas na tela, e não acompanham a
 * rolagem de lista nenhuma.
 */
export function GlassCircle({
  size = 44,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  ativo = false,
  pulsando = false,
  style,
  children,
  accessibilityLabel,
  anel,
}: {
  size?: number;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  /** Aceso: a tinta ganha a cor do tema em vez do branco translúcido. */
  ativo?: boolean;
  /** Pulsa continuamente entre 1.0 e 1.08 (escala) — feedback visual tátil contínuo. */
  pulsando?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** Botão só de ícone precisa de nome para o leitor de tela (fase 16). */
  accessibilityLabel?: string;
  /** Cor de um anel fino na borda (o estado do PC no botão de busca). */
  anel?: string;
}) {
  const { palette, familiaResolvida } = useTheme();
  // 01/11: o mesmo vidro líquido nativo da barra de abas, com pouco brilho. No topo flutuante ele
  // dobra o que rola por baixo; dentro das telas, o fundo. Stark e Android < 13: o vidro de antes.
  const raio = Math.round(size * 0.3);
  const lente = !VIDRO_NATIVO || familiaResolvida === 'stark' ? 0 : size >= 40 ? 8 : 6;
  // Apertar acende a gota no meio: o que está atrás amplia um pouco.
  const [gota, setGota] = React.useState(false);

  const escala = useSharedValue(1);

  React.useEffect(() => {
    if (pulsando) {
      escala.value = withRepeat(
        withSequence(withSpring(1.08), withSpring(1)),
        -1, // infinito
        false
      );
    } else {
      escala.value = withSpring(1);
    }
  }, [pulsando, escala]);

  // 30/10: apertar clareia o fundo e encolhe um pouco — o retorno do toque sem a bolha.
  const apertado = useSharedValue(0);
  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [{ scale: escala.value * (1 - 0.06 * apertado.value) }],
  }));
  const estiloRealce = useAnimatedStyle(() => ({ opacity: apertado.value }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { apertado.value = withTiming(1, { duration: 90 }); if (lente) setGota(true); onPressIn?.(); }}
      onPressOut={() => { apertado.value = withTiming(0, { duration: 160 }); if (lente) setGota(false); onPressOut?.(); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          // 30/10: quadrado de canto suave, não bolha (o Zak achou as bolinhas estranhas).
          borderRadius: raio,
          ...VIDRO_BOTAO,
          ...(lente ? { backgroundColor: 'transparent' } : null),
          ...(anel ? { borderColor: anel, borderWidth: 1.5 } : null),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: disabled ? 0.45 : 1,
        },
        style,
        estiloAnimado,
      ]}
    >
      {lente > 0 && (
        <VidroNativo alvo={null} lente={lente} raio={raio} brilho={0.3}
          seletor={[size / 2, size * 0.32, gota ? 1 : 0]}
          reserva={<View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: VIDRO_BOTAO.backgroundColor }]} />} />
      )}
      {/* Vidro dos botões; aceso, ganha a tinta da cor do tema. */}
      {ativo && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.primarySoft }]} />}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.09)' }, estiloRealce]} />
      {children}
    </AnimatedPressable>
  );
}
