import { RefObject, useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';

export type KeyboardState = {
  /** Quanto o teclado COBRE da raiz, em pixels; 0 quando fechado (ou quando não cobre nada). */
  height: number;
  visible: boolean;
};

/**
 * Altura do teclado por evento nativo.
 *
 * Por que não `KeyboardAvoidingView`: a partir do SDK 54 o Expo liga edge-to-edge por
 * padrão no Android, e nesse modo a janela não é mais redimensionada pelo sistema —
 * `softwareKeyboardLayoutMode: "resize"` deixa de ter efeito prático e o
 * KeyboardAvoidingView com `behavior="height"` ou não faz nada ou encolhe demais.
 *
 * 🔴 31/10: "não ter efeito prático" não é sempre — em alguns aparelhos e situações a janela
 * ENCOLHE mesmo, e aí somar a altura inteira do teclado jogava a caixa de texto lá para cima;
 * em outras a altura do evento não conta a barra de navegação de 3 botões, e o teclado cobria
 * a caixa. Com `raiz`, a conta passa a ser a SOBREPOSIÇÃO de verdade: onde o teclado começa
 * na tela contra onde a raiz termina. Encolheu a janela → 0; não encolheu → o que cobre.
 */
export function useKeyboard(raiz?: RefObject<View | null>): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ height: 0, visible: false });

  useEffect(() => {
    // No iOS os eventos `will*` acompanham a animação do teclado; no Android só os
    // `did*` são emitidos de forma confiável.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, e => {
      const altura = e.endCoordinates?.height ?? 0;
      const topoDoTeclado = e.endCoordinates?.screenY;
      const no = raiz?.current;
      if (!no || typeof topoDoTeclado !== 'number' || topoDoTeclado <= 0) {
        setState({ height: altura, visible: true });
        return;
      }
      no.measureInWindow((_x, y, _w, h) => {
        const cobre = Number.isFinite(y + h) && h > 0 ? Math.max(0, Math.round(y + h - topoDoTeclado)) : altura;
        setState({ height: cobre, visible: true });
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setState({ height: 0, visible: false });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [raiz]);

  return state;
}
