import { createContext, ReactNode, useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Uma aba que continua montada quando escondida (08/10 — ver `lib/abas.ts`).
 *
 * Escondida = `display: 'none'`: não desenha, não recebe toque, mas guarda estado, rolagem e
 * o que estava digitado. Quem dentro dela tem trabalho contínuo (telemetria, espelho, polls)
 * lê `useAbaAtiva()` e pausa enquanto ninguém olha.
 */
const AbaAtivaContext = createContext(true);

/** `true` fora de uma aba (gavetas, testes) — nada para sem motivo. */
export function useAbaAtiva(): boolean {
  return useContext(AbaAtivaContext);
}

export function AbaViva({ ativa, children }: { ativa: boolean; children: ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, !ativa && styles.escondida]} pointerEvents={ativa ? 'auto' : 'none'}>
      <AbaAtivaContext.Provider value={ativa}>{children}</AbaAtivaContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({ escondida: { display: 'none' } });

/**
 * Roda `fn` quando a aba VOLTA a ficar visível (não na montagem — essa cada tela já carrega).
 * É o "atualizar por trás": a tela aparece na hora com o que tinha, e os dados novos chegam
 * sem spinner nem tela vazia.
 */
export function useAoReativar(fn: () => void): void {
  const ativa = useAbaAtiva();
  const antes = useRef(ativa);
  const atual = useRef(fn);
  atual.current = fn;
  useEffect(() => {
    if (ativa && !antes.current) atual.current();
    antes.current = ativa;
  }, [ativa]);
}
