import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
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
  const { palette, familiaResolvida } = useTheme();
  const blurTarget = useBlurTarget();
  const noite = familiaResolvida !== 'lg';
  // Minimal (20/10): superfície sólida, sem desfoque nem brilho.
  const liso = !!palette.minimal;
  // Noite: blur "extremamente levinho". Dia: um pouco mais que antes, para o vidro
  // parecer espesso (o desfoque é o que dá a sensação de material).
  const forca = noite ? BLUR_NOITE : Math.min(100, Math.round(intensity * 1.25));

  return (
    <>
      {blur && forca > 0 && !liso && (
      <BlurView
        intensity={forca}
        // Tinta clara sobre fundo escuro deixaria o vidro leitoso e clarearia a tela
        // inteira; a paleta diz qual usar.
        tint={palette.blurTint}
        // Sem alvo, o método do Android avisa no console e cai pro 'none' sozinho.
        // Pedir 'none' direto dá o mesmo resultado visual, sem o aviso.
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
      {edge && !noite && !liso && (
        <>
          {/* Brilho difuso na aresta de cima — o que sempre existiu, agora só no dia. */}
          <LinearGradient colors={palette.glassSheen} locations={[0, 1]} pointerEvents="none" style={styles.sheen} />
          {/* A lente: luz refratando na curva do canto de onde ela vem. */}
          <View pointerEvents="none" style={styles.lente} />
          {/* Sombra interna no pé: o vidro é mais denso embaixo. */}
          <LinearGradient
            colors={['rgba(20,24,40,0)', 'rgba(20,24,40,0.07)']}
            locations={[0, 1]}
            pointerEvents="none"
            style={styles.pe}
          />
        </>
      )}
      {edge && !noite && !liso && (
        // Aresta especular: um fio de luz no topo e à esquerda — só no dia (bloco 128).
        <>
          <LinearGradient
            colors={noite ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)'] : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.15)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={styles.fioTopo}
          />
          <LinearGradient
            colors={noite ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            pointerEvents="none"
            style={styles.fioEsq}
          />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Altura fixa e não proporcional: o brilho é um reflexo na aresta, e reflexo não cresce
  // junto com o card. Num card alto, uma fração da altura viraria de novo um véu.
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 44 },
  fioTopo: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  fioEsq: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 1.5 },
  // Um círculo branco grande e quase transparente, meio para fora do canto: a parte que
  // fica dentro é a "lente". Sem blur nativo, a suavidade vem do raio e do alfa baixo.
  lente: {
    position: 'absolute', top: -70, left: -60, width: 180, height: 140, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  pe: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 },
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
          borderWidth: palette.familia === 'renascenca' ? 1 : StyleSheet.hairlineWidth,
          borderColor: palette.familia === 'ely' ? 'transparent' : palette.familia === 'renascenca' ? palette.primary : palette.glassBorder,
          opacity: disabled ? 0.45 : 1,
        },
        style,
        estiloAnimado,
      ]}
    >
      {/* Meio-termo: o botão tem ícone, não texto corrido, e sobe menos que os painéis. */}
      <GlassFill intensity={45} edge={false} tintColor={ativo ? palette.primarySoft : undefined} />
      {/* Fase 22: moeda da Renascença — um filete de ouro por dentro da borda. */}
      {palette.familia === 'renascenca' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: size / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.primary, opacity: 0.6 }} />
      )}
      {children}
    </AnimatedPressable>
  );
}
