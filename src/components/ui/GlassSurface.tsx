import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useBlurTarget } from './BlurTarget';

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
 * 29/10 — o design novo do Zak (`dark.css` / `glass.css`):
 *
 * · **Dark**: superfície chapada, sem desfoque nem brilho (o `.dk-card`).
 * · **Glass**: o vidro líquido do `glass.css` — desfoque, gradiente de 160°, a luz
 *   radial no canto de cima e o aro claro no topo. Tudo View/gradiente, nada por quadro.
 * · **Stark**: como antes — painel quase sólido com um véu de desfoque mínimo.
 */
export function GlassFill({
  intensity = 40,
  strong = false,
  edge = true,
  blur = true,
  tintColor,
}: {
  intensity?: number;
  strong?: boolean;
  edge?: boolean;
  /** `false` troca o desfoque real por tinta chapada — ver o comentário acima. */
  blur?: boolean;
  /** Sobrepõe a tinta da paleta. Usado pela gaveta, que é a exceção de alfa alto. */
  tintColor?: string;
}) {
  const { palette } = useTheme();
  const blurTarget = useBlurTarget();
  const vidro = palette.familia === 'glass';
  const chapado = palette.familia === 'dark';
  const forca = vidro ? Math.min(100, Math.round(intensity * 1.1)) : BLUR_NOITE;

  return (
    <>
      {blur && !chapado && (
      <BlurView
        intensity={forca}
        // Na Glass o vidro é claro sobre a cena índigo; na Stark, tinta escura.
        tint={vidro ? 'default' : palette.blurTint}
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
      {vidro && edge && <BrilhoDeVidro />}
    </>
  );
}

/**
 * O material do `.lg` do `glass.css`: gradiente de 160° (0,15 → 0,04 → 0,10), a luz
 * radial no canto de cima à esquerda (0,30 até a metade) e o aro de luz no topo — o
 * `inset 0 1px` mais o gradiente da borda, que é mais forte em cima e nas pontas.
 */
export function BrilhoDeVidro() {
  return (
    <>
      <LinearGradient
        colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.10)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="luzDoVidro" cx="10%" cy="0%" rx="130%" ry="90%" fx="10%" fy="0%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.3} />
            <Stop offset="0.52" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#luzDoVidro)" />
      </Svg>
      <LinearGradient
        colors={['rgba(255,255,255,0.80)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.48)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={styles.fioTopo}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={styles.fioEsq}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fioTopo: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.2 },
  fioEsq: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 1 },
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
}) {
  const { palette } = useTheme();

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

  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [{ scale: escala.value }]
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: palette.familia === 'glass' ? 1 : StyleSheet.hairlineWidth,
          borderColor: palette.familia === 'dark' ? palette.border : palette.glassBorder,
          opacity: disabled ? 0.45 : 1,
        },
        style,
        estiloAnimado,
      ]}
    >
      {/* Meio-termo: o botão tem ícone, não texto corrido, e sobe menos que os painéis. */}
      <GlassFill intensity={45} edge={false} tintColor={ativo ? palette.primarySoft : undefined} />
      {children}
    </AnimatedPressable>
  );
}
