import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export type KeyboardState = {
  /** Altura do teclado em pixels; 0 quando fechado. */
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
 * Ler a altura do evento e aplicar como padding funciona igual nos dois modos e nas
 * duas plataformas.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ height: 0, visible: false });

  useEffect(() => {
    // No iOS os eventos `will*` acompanham a animação do teclado; no Android só os
    // `did*` são emitidos de forma confiável.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, e => {
      setState({ height: e.endCoordinates?.height ?? 0, visible: true });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setState({ height: 0, visible: false });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return state;
}
