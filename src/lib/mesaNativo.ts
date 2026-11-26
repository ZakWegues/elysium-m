import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';

/**
 * O lado Android do Modo Mesa (modules/mesa, APK 2.17.0): esconder as barras do sistema e ler a
 * bateria. No APK antigo (sem o módulo) nada disso existe e o modo segue sem.
 */
export type Bateria = { nivel: number; carregando: boolean };
type Nativo = {
  barras(mostrar: boolean): boolean;
  bateria(): Bateria | null;
  addListener(evento: 'bateria', f: (b: Bateria) => void): { remove(): void };
};
const nativo = requireOptionalNativeModule<Nativo>('Mesa');

/** Some com a barra de cima e a de baixo (ou devolve). */
export function barrasDoSistema(mostrar: boolean): void {
  try { nativo?.barras(mostrar); } catch { /* sem o módulo: ficam */ }
}

/** A bateria do celular enquanto `ligado`; null sem o módulo. */
export function useBateria(ligado: boolean): Bateria | null {
  const [b, setB] = useState<Bateria | null>(null);
  useEffect(() => {
    if (!ligado || !nativo) return;
    try { setB(nativo.bateria()); } catch { /* fica sem */ }
    const s = nativo.addListener('bateria', setB);
    return () => s.remove();
  }, [ligado]);
  return b;
}
