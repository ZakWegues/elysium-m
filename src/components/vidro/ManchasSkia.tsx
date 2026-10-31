/**
 * Web (prévia) e qualquer plataforma sem Skia: nada — o AppBackground desenha as manchas em SVG.
 * No Android vale o `ManchasSkia.native.tsx`.
 */
export const TEM_SKIA = false;

export function ManchasSkia(_: { blobs: readonly [string, string, string]; forca: number }) {
  return null;
}
