/**
 * 09/11 (APK 2.10.0): o brilho do vidro inclina para o lado em que o seletor da barra corre.
 * Velocidade em abas por segundo → −1 a 1; 6 abas/s já é o máximo. Em quartos (10/11; eram
 * décimos): cada valor novo re-renderiza a TabBar no JS, e o nativo já suaviza entre um e outro.
 * Pura e worklet.
 */
export function inclinaDoArrasto(abasPorSegundo: number): number {
  'worklet';
  if (!Number.isFinite(abasPorSegundo)) return 0;
  const v = Math.max(-1, Math.min(1, abasPorSegundo / 6));
  return Math.round(v * 4) / 4 || 0;
}
