import * as Haptics from 'expo-haptics';

/**
 * Resposta tátil, numa escala tão curta quanto a de movimento (`motion.ts`).
 *
 * Três níveis e nada além disso: `leve` para toque em item (aba, card, chip), `medio`
 * para uma ação que mexe no PC (abrir programa, mandar clipboard), e `aviso` para o
 * momento antes de um destrutivo. Sucesso e erro fecham o ciclo de uma ação que demorou.
 * Vibrar em tudo lê como brinquedo; vibrar só onde há consequência lê como resposta.
 *
 * Nunca lança: aparelho sem motor de vibração ou com háptica desligada devolve rejeição,
 * e uma vibração que falhou não pode derrubar o toque que a pediu.
 */
export const haptica = {
  leve: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medio: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  aviso: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  sucesso: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  erro: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  /** Um tique curto — para a troca de aba e o encaixe de um card arrastado. */
  tique: () => Haptics.selectionAsync().catch(() => {}),
};
