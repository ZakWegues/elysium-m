/**
 * A escala de movimento do ELYSIUM-M — a mesma do desktop.
 *
 * POR QUE UMA ESCALA, E NÃO UM EFEITO POR TELA
 *
 * Movimento com assinatura única lê como produto acabado; movimento inventado caso a caso
 * lê como enfeite. "Um bounce em todo hover" é, aliás, um dos sinais listados de interface
 * gerada por IA — e a última coisa que se quer é resolver o desenho e denunciar de novo
 * pela animação. Então há três durações e duas curvas, e nada além disso.
 *
 * REGRAS
 *   · nada passa de 300 ms — acima disso vira espera, não resposta;
 *   · mola só no popover, porque é a assinatura daquele formato;
 *   · sempre `useNativeDriver: true` para transform/opacity. Sem isso a animação roda na
 *     thread de JS e engasga junto com as chamadas RPC, que é exatamente quando ela
 *     aparece.
 *
 * ⚠️ A PROIBIÇÃO DE DEPENDÊNCIA NATIVA FOI REVOGADA (bloco 51).
 *
 * O bloco 24 barrou `react-native-reanimated` e `react-native-gesture-handler` porque são
 * módulos nativos: mudam o fingerprint do `expo-updates` e obrigam a um APK novo, e naquele
 * momento tudo precisava viajar por OTA. Um APK novo passou a ser obrigatório de qualquer
 * forma, então a restrição perdeu o motivo. As duas entraram.
 *
 * O QUE MUDOU NA PRÁTICA: a escala é a MESMA — 120 / 220 / 140 ms, mola só no popover. O
 * que muda é onde ela roda. `Animated` com `useNativeDriver` só sai da thread de JS depois
 * que o JS monta a animação; um gesto continuava indo e voltando por quadro. Com worklets,
 * gesto e animação vivem na thread de UI e não sentem o RPC que a tela dispara ao montar.
 *
 * `LayoutAnimation` saiu de vez: na Nova Arquitetura o
 * `UIManager.setLayoutAnimationEnabledExperimental` é no-op (§14) e nada do que este módulo
 * agendava por ali chegava a rodar. O substituto é `layout={LAYOUT}` na própria view.
 *
 * A camada `Animated` do core continua exportada: telas que ainda não foram migradas
 * dependem dela, e ter as duas convivendo é o que permite migrar por partes.
 */

import { AccessibilityInfo, Animated, Easing } from 'react-native';
import {
  Easing as EasingUI, FadeInDown, FadeOut, LinearTransition, ReduceMotion,
  makeMutable, withSpring, withTiming,
} from 'react-native-reanimated';

export const MOV = {
  /** hover, foco, toggle */
  micro: 140,
  /** troca de tela, card entrando */
  base: 260,
  /** saída é sempre mais rápida que entrada */
  saida: 160,
} as const;

/** Equivalente ao `cubic-bezier(0.22, 1, 0.36, 1)` do desktop (ease-out quint, fase 23.2). */
export const SUAVE = Easing.bezier(0.22, 1, 0.36, 1);


/**
 * Quem liga "reduzir movimento" no Android costuma ter um motivo físico. A leitura é
 * assíncrona, então fica em cache num módulo: consultar o sistema a cada animação seria
 * um `await` no caminho quente.
 */
let reduzir = false;

/**
 * O mesmo valor, legível de dentro de um worklet.
 *
 * Um worklet captura variáveis do módulo por VALOR, no instante em que é criado — ler
 * `reduzir` lá dentro daria para sempre o `false` da montagem. Um valor compartilhado é
 * lido na thread de UI a cada quadro, e por isso responde a alguém ligando "reduzir
 * movimento" com o app já aberto.
 */
export const reduzirUI = makeMutable(false);

function aplicarReducao(v: boolean) {
  reduzir = v;
  reduzirUI.value = v;
}
AccessibilityInfo.isReduceMotionEnabled().then(aplicarReducao).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', aplicarReducao);

export function movimentoReduzido(): boolean {
  return reduzir;
}

/** Duração já respeitando a preferência de acessibilidade. */
export function dur(ms: number): number {
  return reduzir ? 0 : ms;
}

/** Atalho para o par transform+opacity, que é 90% do movimento do app. */
export function anima(
  valor: Animated.Value,
  para: number,
  ms: number = MOV.base,
  easing: Animated.TimingAnimationConfig['easing'] = SUAVE,
): Animated.CompositeAnimation {
  return Animated.timing(valor, {
    toValue: para,
    duration: dur(ms),
    easing,
    useNativeDriver: true,
  });
}

// ─────────────────────────────────────────────────
// A MESMA ESCALA, NA THREAD DE UI
// ─────────────────────────────────────────────────

/** `cubic-bezier(0.2, 0, 0.2, 1)` — a curva do micro, para worklets. */
export const CURVA_UI = EasingUI.bezier(0.2, 0, 0.2, 1);
/** `cubic-bezier(0.22, 1, 0.36, 1)` — a curva padrão, para worklets. */
export const SUAVE_UI = EasingUI.bezier(0.22, 1, 0.36, 1);

/**
 * A mola do popover, traduzida.
 *
 * `Animated` fala em tensão e fricção; Reanimated fala em rigidez e amortecimento. 380 é o
 * mesmo número do bloco 24 — é a rigidez que a escala sempre pediu. O amortecimento 22
 * mantém a passada curta: o popover ultrapassa o alvo uma vez e volta, sem tremer.
 */
export const MOLA_UI = { stiffness: 380, damping: 22, mass: 1 } as const;


/**
 * 🔴 VALOR PADRÃO EM PARÂMETRO DE WORKLET DERRUBA O APP.
 *
 * A primeira versão disto era `ms: number = MOV.base, easing = SUAVE_UI`, e o app morria
 * com `ReferenceError: Property 'SUAVE_UI' doesn't exist` ao soltar o dedo na barra de
 * abas. O plugin do Babel monta o worklet capturando o que o CORPO da função referencia; o
 * valor padrão mora na assinatura, fica fora dessa varredura, e na thread de UI — onde
 * escopo de módulo não existe — o identificador simplesmente não está lá.
 *
 * O sintoma engana porque o mesmo identificador funciona no corpo de outro worklet. A regra
 * é a posição, não o identificador: dentro do corpo, capturado; na assinatura, não.
 *
 * Daí a forma abaixo. Os padrões são resolvidos no corpo, e são LITERAIS mais o `Easing` do
 * próprio Reanimated (que é worklet), sem depender de nenhuma constante deste módulo. A
 * escala continua sendo uma só: o `conferenciaDaEscala` logo abaixo quebra o typecheck se
 * alguém mudar `MOV` e esquecer daqui.
 */
export function tempo(
  para: number,
  ms?: number,
  easing?: EasingFactoryFn,
  /** Roda na thread de UI ao terminar. `false` quando a animação foi interrompida. */
  aoFim?: (terminou?: boolean) => void,
) {
  'worklet';
  const duracao = reduzirUI.value ? 0 : (ms ?? 220);
  const curva = easing ?? EasingUI.bezier(0.22, 1, 0.36, 1);
  return withTiming(para, { duration: duracao, easing: curva }, aoFim);
}

/** Mola — só o popover usa, como manda o bloco 24. Números literais, mesmo motivo. */
export function mola(para: number) {
  'worklet';
  if (reduzirUI.value) return withTiming(para, { duration: 0 });
  return withSpring(para, { stiffness: 380, damping: 22, mass: 1 });
}

/**
 * A amarra entre os literais dos worklets e a escala declarada em cima. Não roda nada: se
 * `MOV.base` deixar de ser 220 ou a mola deixar de ser 380/22, isto para de compilar.
 */
const conferenciaDaEscala: [220, 380, 22] = [MOV.base, MOLA_UI.stiffness, MOLA_UI.damping];
void conferenciaDaEscala;

type EasingFactoryFn = typeof SUAVE_UI;

/**
 * O substituto do `LayoutAnimation`, que era no-op na Nova Arquitetura.
 *
 * Vai na própria view (`layout={LAYOUT}`) em vez de numa chamada antes do `setState`, e
 * por isso não depende de nenhum interruptor experimental: quem interpola é a thread de
 * UI, olhando a posição de antes e a de depois.
 */
export const LAYOUT = LinearTransition
  .duration(MOV.base)
  .easing(SUAVE_UI)
  .reduceMotion(ReduceMotion.System);

/**
 * Entrada de item em lista: aparece subindo 8 px, como o `mov-entra` do desktop (bloco 74).
 * O `FadeInDown` nasce com 50 px de deslocamento; aqui é 8 — acima disso lê como "caiu".
 */
export const ENTRA = FadeInDown.withInitialValues({ transform: [{ translateY: 8 }] })
  .duration(MOV.base).easing(SUAVE_UI).reduceMotion(ReduceMotion.System);
/** Saída — sempre mais rápida que a entrada. */
export const SAI = FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System);
