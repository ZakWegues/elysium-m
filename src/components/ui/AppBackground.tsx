import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

/**
 * Fundo do app: gradiente suave + duas manchas de cor do tema.
 *
 * Não é decoração à toa — vidro só parece vidro se houver algo variado por baixo pra
 * desfocar. Sobre um fundo chapado, qualquer blur devolve exatamente a mesma cor chapada.
 * Com a tinta do vidro em alfa baixo (este bloco), o fundo passou a ser QUASE TUDO o que
 * se vê através dele: pobre aqui é vidro cinza lá.
 *
 * 🔴 MAIS ELEMENTOS, MENOS MOVIMENTO. O bloco 47 já tinha medido que animar dois
 * gradientes em tela cheia custa quadro no telefone, e os feixes ficaram parados por isso.
 * A resposta a "o fundo está pobre" é densidade, não animação: quatro manchas em vez de
 * duas, dois traços finos de luz e uma constelação de partículas — tudo estático, tudo
 * `pointerEvents="none"`, nada que precise ser recalculado por quadro.
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

/**
 * Traços de luz: linhas finas e longas, quase invisíveis, atravessando a tela na diagonal.
 * São o que dá DIREÇÃO ao fundo — as manchas dão profundidade, mas não dizem para onde a
 * luz vai. Duas bastam; três já lê como padrão de papel de parede.
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
 * orientação — o fundo piscaria, e é exatamente o tipo de movimento involuntário que o
 * bloco 24 proibiu. Percentuais, para acompanharem qualquer tamanho de tela.
 */
const PARTICULAS = [
  { x: '12%', y: '14%', d: 3 }, { x: '31%', y: '7%',  d: 2 }, { x: '68%', y: '11%', d: 2 },
  { x: '84%', y: '22%', d: 3 }, { x: '22%', y: '33%', d: 2 }, { x: '57%', y: '29%', d: 4 },
  { x: '78%', y: '41%', d: 2 }, { x: '15%', y: '52%', d: 3 }, { x: '44%', y: '58%', d: 2 },
  { x: '88%', y: '63%', d: 2 }, { x: '27%', y: '71%', d: 4 }, { x: '62%', y: '77%', d: 3 },
  { x: '9%',  y: '84%', d: 2 }, { x: '73%', y: '89%', d: 2 }, { x: '40%', y: '93%', d: 3 },
] as const;

function Particulas({ cor, forca }: { cor: string; forca: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
      {/* As duas do meio são as novas, e são mais fracas de propósito: elas existem para o
          vidro ter variação onde antes só havia gradiente liso — no meio da tela, que é
          justamente onde ficam os cards. */}
      <Mancha cor={palette.accent}  opacidade={noite ? 0.22 : 0.15} tamanho={300} style={styles.meioEsq} />
      <Mancha cor={palette.primary} opacidade={noite ? 0.20 : 0.13} tamanho={260} style={styles.meioDir} />
      <Tracos cor={palette.primary} forca={noite ? 0.05 : 0.07} />
      <Particulas cor={noite ? '#FFFFFF' : palette.primary} forca={noite ? 0.22 : 0.16} />
      {noite && <Feixes cor={palette.primary} />}
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
  feixe: { position: 'absolute', top: '-25%', left: '-5%', width: '55%', height: '150%' },
});
