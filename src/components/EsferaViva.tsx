/** Sem o módulo nativo (prévia web, APK antigo): o Esfera3D desenha em SVG. */
export type ModoDaEsfera = 0 | 1 | 2 | 3;
export const ESFERA_VIVA = false;
export function EsferaViva(_: { modo: ModoDaEsfera; cor: string; opacidade: number; ativa: boolean; noite: [number, number, number] }) { return null; }
