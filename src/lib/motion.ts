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
 * ⚠️ NENHUMA DEPENDÊNCIA NOVA. `Animated` e `LayoutAnimation` são do core do React
 * Native. `react-native-reanimated` e `react-native-gesture-handler` são nativas: mudariam
 * o fingerprint do `expo-updates` e obrigariam a um APK novo, quando o caminho aqui é OTA.
 */

import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';

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
AccessibilityInfo.isReduceMotionEnabled().then(v => { reduzir = v; }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', v => { reduzir = v; });

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

// O LayoutAnimation da arquitetura antiga do Android exige este interruptor. Na Nova
// Arquitetura ele é ignorado, mas chamá-lo continua sendo inofensivo — e o app roda nas
// duas dependendo do build.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Anima a próxima mudança de layout: reordenar cards, abrir uma gaveta, um item saindo da
 * lista. Uma linha antes do `setState` e o React Native interpola as posições sozinho.
 */
export function animarProximoLayout(ms: number = MOV.base): void {
  if (reduzir) return;
  LayoutAnimation.configureNext({
    duration: ms,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}
