import type { MusicasDaResposta } from './chatHistoryStore';

/** 23/11: `musicas` do reply, validado (capa só da Deezer). */
export function lerMusicas(v: unknown): { musicas?: MusicasDaResposta } {
  const m = v as { itens?: unknown; aprendi?: unknown } | null | undefined;
  if (!m || !Array.isArray(m.itens)) return {};
  const texto = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');
  const itens = (m.itens as Record<string, unknown>[]).slice(0, 12).map((x) => ({
    id: Number(x?.id), titulo: texto(x?.titulo, 120), artista: texto(x?.artista, 80), motivo: texto(x?.motivo, 120),
    capa: typeof x?.capa === 'string' && /^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(x.capa) ? x.capa : null,
  })).filter((x) => x.id > 0 && x.titulo);
  const aprendi = Array.isArray(m.aprendi) ? m.aprendi.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, 3) : [];
  return itens.length ? { musicas: { itens, aprendi } } : {};
}
