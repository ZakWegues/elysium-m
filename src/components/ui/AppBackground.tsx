import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

/**
 * Fundo do app: gradiente suave + duas manchas de cor do tema.
 *
 * Não é decoração à toa — vidro só parece vidro se houver algo variado por baixo pra
 * desfocar. Sobre um fundo chapado, qualquer blur devolve exatamente a mesma cor chapada.
 */

/** Quantas camadas formam cada mancha. Mais que isto não muda o que o olho vê. */
const CAMADAS = 7;

/**
 * 🔴 O React Native não tem equivalente ao `filter: blur()`.
 *
 * A versão do desktop desfoca os blobs com `blur(36px)` no CSS. Aqui isso não existe, e a
 * primeira versão deste componente desenhava um `View` redondo e pronto — o que dava um
 * DISCO DE BORDA DURA. No modo claro, a 16% de opacidade, quase não se notava; no escuro,
 * a 26% sobre um fundo quase preto, eram dois círculos chapados atravessando a tela. Era
 * um dos três motivos do modo escuro feio.
 *
 * Sem dependência nova, a saída é somar círculos concêntricos: o de fora é o maior e o mais
 * fraco, o de dentro é o menor e o mais forte. A soma das opacidades cria uma queda suave da
 * borda para o centro — uma gaussiana barata, que é o que o olho lê como desfoque.
 */
function Mancha({ cor, opacidade, tamanho, style }: {
  cor: string;
  opacidade: number;
  tamanho: number;
  style: object;
}) {
  return (
    <View style={[{ width: tamanho, height: tamanho }, style]} pointerEvents="none">
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
    </View>
  );
}

/**
 * Feixes de luz — o elemento que só a família ELYSIUM tem.
 *
 * É a contrapartida do `#ely-shafts` do `dashboard.html`: duas faixas diagonais bem
 * fracas, como luz entrando de cima. No desktop elas derivam devagar (44 s e 58 s); aqui
 * ficam paradas de propósito, porque animar dois gradientes em tela cheia o tempo todo
 * custa quadro no telefone e o ganho é quase invisível — o valor do elemento está na
 * profundidade que ele dá ao fundo, não no movimento.
 *
 * Não existem na família Vidro Líquido: lá o fundo é claro, e uma faixa de luz sobre
 * claro não lê como luz, lê como mancha de impressão.
 */
function Feixes({ cor }: { cor: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['transparent', cor, 'transparent']}
        locations={[0.15, 0.5, 0.85]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.feixe, { opacity: 0.06, transform: [{ rotate: '-18deg' }] }]}
      />
      <LinearGradient
        colors={['transparent', cor, 'transparent']}
        locations={[0.2, 0.5, 0.8]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.feixe, { opacity: 0.04, left: '35%', transform: [{ rotate: '-24deg' }] }]}
      />
    </View>
  );
}

export function AppBackground() {
  const { palette, familiaResolvida } = useTheme();
  const noite = familiaResolvida === 'ely';

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
      {/* Mais forte na noite: sobre fundo quase preto, pouca opacidade some. Agora que a
          mancha tem queda suave, dá para subir sem virar um disco visível. */}
      <Mancha cor={palette.primary} opacidade={noite ? 0.42 : 0.26} tamanho={420} style={styles.top} />
      <Mancha cor={palette.accent}  opacidade={noite ? 0.34 : 0.22} tamanho={440} style={styles.bottom} />
      {noite && <Feixes cor={palette.primary} />}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: -130, right: -110 },
  bottom: { position: 'absolute', bottom: 10, left: -150 },
  // Mais alto que a tela para a diagonal não deixar canto vazio ao girar.
  feixe: { position: 'absolute', top: '-25%', left: '-5%', width: '55%', height: '150%' },
});
