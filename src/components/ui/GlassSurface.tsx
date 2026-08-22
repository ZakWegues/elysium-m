import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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

  return (
    <>
      {blur && (
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
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: tintColor ?? (strong ? palette.glassSurfaceStrong : palette.glassSurface) },
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
  style,
  children,
}: {
  size?: number;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  /** Aceso: a tinta ganha a cor do tema em vez do branco translúcido. */
  ativo?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.glassBorder,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {/* Raio baixo de propósito: o pedido é ver o fundo, e blur alto sobre alfa alto é
          justamente o que devolve o aspecto leitoso. */}
      <GlassFill intensity={18} edge={false} tintColor={ativo ? palette.primarySoft : undefined} />
      {children}
    </Pressable>
  );
}
