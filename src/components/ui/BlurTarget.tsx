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

/**
 * 31/10: o alvo da BARRA DE ABAS. Ela flutua por cima das telas e precisa desfocar o que
 * passa por baixo dela (cards, texto), não só o fundo — então o alvo dela envolve fundo E
 * telas. Fica separado do alvo dos cards: um card dentro das telas não pode desfocar uma
 * árvore que contém ele mesmo.
 */
const BarraBlurContext = createContext<React.RefObject<View | null> | null>(null);

export function useBlurDaBarra(): React.RefObject<View | null> | undefined {
  return useContext(BarraBlurContext) ?? undefined;
}

export function BarraBlurProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);
  return (
    <BarraBlurContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={{ flex: 1 }} collapsable={false}>
        {children}
      </BlurTargetView>
    </BarraBlurContext.Provider>
  );
}
