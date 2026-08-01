import { createContext, ReactNode, useContext, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';

/**
 * Alvo de desfoque compartilhado.
 *
 * A partir do expo-blur 57 o Android exige que a `BlurView` receba, via `blurTarget`,
 * o ref de uma `BlurTargetView` que envolve o conteúdo a ser desfocado. Sem isso a
 * biblioteca avisa no console e **cai para o método "none"** — o app continua
 * funcionando, mas todo o vidro vira uma camada chapada semi-transparente, que é
 * exatamente o efeito que o tema inteiro depende.
 *
 * Como só existe um fundo no app (o gradiente com os círculos pastel), guardamos um
 * único ref num contexto em vez de exigir que cada card saiba onde ele está.
 */

const BlurTargetContext = createContext<React.RefObject<View | null> | null>(null);

export function useBlurTarget(): React.RefObject<View | null> | undefined {
  return useContext(BlurTargetContext) ?? undefined;
}

/**
 * Envolve o conteúdo que serve de fundo para o vidro. Fica no topo da árvore, em
 * volta do `AppBackground`.
 */
export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);

  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={StyleSheet.absoluteFill} collapsable={false}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}
