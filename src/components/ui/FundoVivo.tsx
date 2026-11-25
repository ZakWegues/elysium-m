/** Sem o módulo nativo (prévia web, iOS): o AppBackground usa as camadas em JS. */
export type TemaDoFundo = 'dark' | 'glass' | 'stark' | 'poeira';
export const FUNDO_VIVO = false;
export function FundoVivo(_: { cores: readonly string[]; tema: TemaDoFundo; vivo: boolean }) { return null; }
