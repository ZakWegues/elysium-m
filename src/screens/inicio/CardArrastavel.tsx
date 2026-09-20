import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { ENTRA, LAYOUT, SAI, tempo } from '../../lib/motion';

/** O card que se arrasta e se redimensiona (bloco 81: saiu do HomeScreen, sem mudar). */
export default function CardArrastavel({
  indice, ativo, largura, alturaFixa, onMover, onArrastando, onRedimensionar, onFimRedimensionar, children,
}: {
  indice: number;
  ativo: boolean;
  /** Fração da linha que este card ocupa: 1 = inteiro, 0.5 = metade. */
  largura: number;
  /** Altura travada pelo usuário, em px, ou `null` para acompanhar o conteúdo. */
  alturaFixa: number | null;
  onMover: (de: number, para: number) => void;
  onArrastando: (v: boolean) => void;
  onRedimensionar: (alt: number | null, col: number) => void;
  /** Chamado uma vez, ao soltar a quina: e quem persiste. */
  onFimRedimensionar: () => void;
  /** Recebe a alça pronta para embrulhar o ícone ☰ — ver `Alca`, mais abaixo. */
  children: (Alca: React.ComponentType<{ children: React.ReactNode }>) => React.ReactNode;
}) {
  const y = useSharedValue(0);
  const altura = useSharedValue(120);
  const acumulado = useSharedValue(0);
  /** Altura e coluna no instante em que o dedo encostou — o arrasto é relativo a elas. */
  const baseAltura = useSharedValue(0);
  const baseLargura = useSharedValue(1);
  /** A altura VIVA do gesto. Enquanto o dedo anda, só ela muda — o React fica fora. */
  const altViva = useSharedValue(alturaFixa ?? 0);
  const travada = useSharedValue(alturaFixa !== null);
  const colViva = useSharedValue(largura);

  useEffect(() => {
    travada.value = alturaFixa !== null;
    if (alturaFixa !== null) altViva.value = alturaFixa;
  }, [alturaFixa]);
  useEffect(() => { colViva.value = largura; }, [largura]);

  /**
   * 🔴 OS RETORNOS DE CHAMADA PRECISAM DE IDENTIDADE ESTÁVEL, E NÃO É DETALHE.
   *
   * O `indice` deste card MUDA durante o próprio arrasto — é o que reordenar significa — e
   * `onMover` é recriado a cada render da tela. Se o objeto de gesto dependesse deles, ele
   * seria recriado no meio do gesto, o `GestureDetector` remontaria e o dedo seria solto
   * sozinho na primeira troca de posição. Com as ações atrás de um ref e o índice num valor
   * compartilhado, o gesto nasce uma vez e continua vendo sempre o valor atual.
   */
  const acoes = useRef({ onMover, onArrastando, onRedimensionar, onFimRedimensionar });
  acoes.current = { onMover, onArrastando, onRedimensionar, onFimRedimensionar };
  const indiceVivo = useSharedValue(indice);
  useEffect(() => { indiceVivo.value = indice; }, [indice]);

  const mover = useCallback((de: number, para: number) => acoes.current.onMover(de, para), []);
  const sinalizar = useCallback((v: boolean) => acoes.current.onArrastando(v), []);
  const aplicar = useCallback((alt: number, col: number) => acoes.current.onRedimensionar(alt, col), []);
  const soltar = useCallback((alt: number, col: number) => {
    acoes.current.onRedimensionar(alt, col);
    acoes.current.onFimRedimensionar();
  }, []);

  /**
   * 🔴 O ARRASTO SAIU DO CARD INTEIRO E FOI PARA A ALÇA.
   *
   * Antes o `PanResponder` cobria o card todo, e por isso o modo de edição precisava
   * desligar a rolagem (`scrollEnabled={!editando}`) para os dois gestos não brigarem
   * pelo mesmo dedo. O efeito colateral era grave: com a rolagem morta, **não dava para
   * chegar nos cards de baixo** — abrir a personalização travava você nos primeiros dois
   * ou três, e o card que você tocava sem querer virava o único que dava para mexer.
   *
   * Com o gesto restrito à alça, a `ScrollView` volta a funcionar durante a edição e a
   * rolagem só para enquanto um arrasto está de fato em curso.
   */
  const arrasto = useMemo(() => Gesture.Pan()
    .enabled(ativo)
    // Os mesmos 4 px de antes: abaixo disso é toque, e a `ScrollView` continua dona do dedo.
    .activeOffsetY([-4, 4])
    .onBegin(() => {
      acumulado.value = 0;
      runOnJS(sinalizar)(true);
    })
    .onUpdate((e) => {
      y.value = e.translationY;
      const passos = Math.round(e.translationY / altura.value);
      if (passos !== acumulado.value) {
        runOnJS(mover)(indiceVivo.value, indiceVivo.value + (passos - acumulado.value));
        acumulado.value = passos;
      }
    })
    // `onFinalize` cobre soltar E cancelar num lugar só. Com o `PanResponder` isto eram
    // dois caminhos, e o de cancelamento esquecia de devolver o card ao lugar.
    .onFinalize(() => {
      acumulado.value = 0;
      y.value = tempo(0);
      runOnJS(sinalizar)(false);
    }), [ativo, mover, sinalizar]);

  /**
   * Canto de redimensionar, como a quina de uma janela do Windows.
   *
   * Vertical muda a altura livremente; horizontal decide entre card inteiro e meio card.
   * A largura não é livre de propósito: numa tela de telefone, larguras arbitrárias
   * deixam sobras irregulares entre um card e o vizinho e nada nunca alinha. Duas
   * posições encaixam sempre.
   */
  const arrastoTamanho = useMemo(() => Gesture.Pan()
    .onBegin(() => {
      baseAltura.value = altura.value - 12;
      baseLargura.value = colViva.value;
      travada.value = true;
      altViva.value = altura.value - 12;
      runOnJS(sinalizar)(true);
    })
    .onUpdate((e) => {
      // A ALTURA NÃO PASSA MAIS PELO REACT DURANTE O GESTO. Antes cada quadro era um
      // `setState` na tela inteira; agora é uma escrita num valor compartilhado, e o React
      // só fica sabendo ao soltar — que é também quando a gravação acontece (§22, bloco 50).
      altViva.value = Math.max(72, Math.round((baseAltura.value + e.translationY) / 8) * 8);
      // 60 px de folga antes de trocar de coluna: sem isso, um arrasto vertical com o
      // dedo levemente torto trocaria a largura sem ninguém pedir.
      let col = baseLargura.value;
      if (e.translationX < -60) col = 0.5;
      else if (e.translationX > 60) col = 1;
      // A largura é layout de verdade (100% ou 48%), então essa parte precisa do React.
      // Só que ela muda nas travessias, não por quadro.
      if (col !== colViva.value) {
        colViva.value = col;
        runOnJS(aplicar)(altViva.value, col);
      }
    })
    .onFinalize(() => {
      runOnJS(sinalizar)(false);
      runOnJS(soltar)(altViva.value, colViva.value);
    }), [aplicar, sinalizar, soltar]);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    height: travada.value ? altViva.value : undefined,
  }));

  /**
   * A alça ☰, já embrulhada no detector. Vai memoizada porque o card a renderiza como
   * componente: identidade nova a cada render remontaria o `GestureDetector` — e remontar
   * no meio de um arrasto solta o dedo sozinho.
   */
  const Alca = useMemo(
    () => ({ children: filhos }: { children: React.ReactNode }) => (
      <GestureDetector gesture={arrasto}>
        <View hitSlop={12} style={styles.alca}>{filhos}</View>
      </GestureDetector>
    ),
    [arrasto],
  );

  return (
    <Animated.View
      layout={LAYOUT}
      entering={ENTRA}
      exiting={SAI}
      onLayout={e => { altura.value = e.nativeEvent.layout.height + 12; }}
      style={[
        {
          // `48%` em vez de `50%` para o `gap` da linha caber entre os dois meios-cards.
          width: largura === 1 ? '100%' : '48%',
          // A altura travada aparece nos DOIS lugares de propósito: aqui para a árvore do
          // React saber o tamanho do card, e no estilo animado para o gesto poder mexer
          // nela sem passar pelo React. Fora do gesto os dois valores são o mesmo, e é isso
          // que impede o `layout={LAYOUT}` de interpolar a altura de volta para a medida.
          ...(alturaFixa !== null ? { height: alturaFixa } : {}),
        },
        estilo,
      ]}
    >
      {/* `overflow: hidden` é o que faz a altura travada valer: sem ele o conteúdo
          transborda o card em vez de ser cortado, e o card "não redimensiona". */}
      <View style={{ flex: alturaFixa !== null ? 1 : undefined, overflow: 'hidden' }}>
        {children(Alca)}
      </View>

      {ativo && (
        <GestureDetector gesture={arrastoTamanho}>
          <View
            // Área de toque maior que o desenho: 12 px de canto é fácil de ver e difícil
            // de acertar com o dedo.
            hitSlop={{ top: 14, left: 14, right: 6, bottom: 6 }}
            style={styles.cantoTamanho}
          >
            <Feather name="corner-down-right" size={13} color="rgba(255,255,255,0.85)" />
          </View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  alca: { marginLeft: 'auto', paddingLeft: 10 },
  cantoTamanho: {
    position: 'absolute', right: 2, bottom: 2,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
