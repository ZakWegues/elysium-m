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
  Easing as EasingUI, FadeIn, FadeOut, LinearTransition, ReduceMotion,
  makeMutable, withSpring, withTiming,
} from 'react-native-reanimated';

export const MOV = {
  /** hover, foco, toggle */
  micro: 120,
  /** troca de tela, card entrando */
  base: 220,
  /** saída é sempre mais rápida que entrada */
  saida: 140,
} as const;

/** Equivalente ao `cubic-bezier(0.2, 0, 0.2, 1)` do desktop. */
export const CURVA = Easing.bezier(0.2, 0, 0.2, 1);
/** Equivalente ao `cubic-bezier(0.2, 0.8, 0.2, 1)`. */
export const SUAVE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Mola do popover: passa um pouco do alvo e volta. */
export const MOLA = { tension: 380, friction: 22, useNativeDriver: true } as const;

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
/** `cubic-bezier(0.2, 0.8, 0.2, 1)` — a curva padrão, para worklets. */
export const SUAVE_UI = EasingUI.bezier(0.2, 0.8, 0.2, 1);

/**
 * A mola do popover, traduzida.
 *
 * `Animated` fala em tensão e fricção; Reanimated fala em rigidez e amortecimento. 380 é o
 * mesmo número do bloco 24 — é a rigidez que a escala sempre pediu. O amortecimento 22
 * mantém a passada curta: o popover ultrapassa o alvo uma vez e volta, sem tremer.
 */
export const MOLA_UI = { stiffness: 380, damping: 22, mass: 1 } as const;

/** Duração já respeitando a acessibilidade, do lado da UI. */
export function durUI(ms: number): number {
  'worklet';
  return reduzirUI.value ? 0 : ms;
}

/** `anima()` do lado da thread de UI: mesma escala, mesmas curvas. */
export function tempo(
  para: number,
  ms: number = MOV.base,
  easing: EasingFactoryFn = SUAVE_UI,
  /** Roda na thread de UI ao terminar. `false` quando a animação foi interrompida. */
  aoFim?: (terminou?: boolean) => void,
) {
  'worklet';
  return withTiming(para, { duration: durUI(ms), easing }, aoFim);
}

/** Mola — só o popover usa, como manda o bloco 24. */
export function mola(para: number) {
  'worklet';
  if (reduzirUI.value) return withTiming(para, { duration: 0 });
  return withSpring(para, MOLA_UI);
}

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

/** Entrada de item em lista. */
export const ENTRA = FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System);
/** Saída — sempre mais rápida que a entrada. */
export const SAI = FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System);
