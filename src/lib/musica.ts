import { useEffect, useSyncExternalStore } from 'react';
import { ToastAndroid } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { abrirAlvo, lerAlvo } from './abrirNoCelular';
import { errMessage } from './errors';
import type { Pairing } from './pairing';
import { callRpc, MomentoMusical, MusicaSugerida } from './rpc';

/**
 * As sugestões de música e o trecho de 30 s (23/11). A conta é do PC (gostos.ts); aqui fica o que
 * já veio, dividido entre o card do Início, a tela do PC e a folha Música.
 */
type Estado = {
  momento: MomentoMusical;
  pronto: boolean | null;
  itens: MusicaSugerida[];
  carregando: boolean;
  erro: boolean;
  notas: Record<number, 1 | -1>;
  previa: number | null;
};
let e: Estado = { momento: 'geral', pronto: null, itens: [], carregando: false, erro: false, notas: {}, previa: null };
const ouvintes = new Set<() => void>();
function por(patch: Partial<Estado>): void { e = { ...e, ...patch }; ouvintes.forEach((f) => f()); }
function assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
export function useMusica(): Estado { return useSyncExternalStore(assinar, () => e); }

export async function carregarSugestoes(pairing: Pairing, opcoes: { momento?: MomentoMusical; refazer?: boolean } = {}): Promise<void> {
  if (e.carregando) return;
  por({ carregando: true, erro: false, ...(opcoes.momento ? { momento: opcoes.momento } : {}) });
  try {
    const r = await callRpc(pairing, 'gostos.sugestoes', { momento: e.momento, refazer: opcoes.refazer === true }, { timeoutMs: 25000 });
    por({ pronto: r.pronto, itens: r.itens, carregando: false });
  } catch { por({ carregando: false, erro: true }); }
}
/** Carrega na primeira vez que alguém mostra (e tenta de novo se a última falhou). */
export function useCarregarSugestoes(pairing: Pairing): void {
  useEffect(() => { if (e.pronto === null) void carregarSugestoes(pairing); }, [pairing]);
}
/** Respondeu algo no questionário: a próxima vista refaz a conta. */
export function gostosMudaram(): void { por({ pronto: null }); }
/** Fechou o questionário: os cards voltam com a conta nova. */
export function recarregarSeMudou(pairing: Pairing): void { if (e.pronto === null) void carregarSugestoes(pairing); }

const avisar = (t: string) => ToastAndroid?.show(t, ToastAndroid.SHORT);

export async function tocarSugestao(pairing: Pairing, m: { titulo: string; artista: string }, no: 'pc' | 'celular'): Promise<void> {
  pararPrevia();
  avisar(`Procurando ${m.titulo}…`);
  try {
    const r = await callRpc(pairing, 'musica.tocar', { titulo: m.titulo, artista: m.artista, no, abre: true }, { timeoutMs: 25000 });
    const alvo = lerAlvo(r.abrir);
    if (alvo) await abrirAlvo(alvo); else avisar(r.fala);
  } catch (err) { avisar(errMessage(err)); }
}

export async function passarPara(pairing: Pairing, para: 'pc' | 'celular'): Promise<void> {
  try {
    const r = await callRpc(pairing, 'musica.passar', { para, abre: true }, { timeoutMs: 15000 });
    avisar(r.fala);
    const alvo = lerAlvo(r.abrir);
    if (alvo) await abrirAlvo(alvo);
  } catch (err) { avisar(errMessage(err)); }
}

export async function avaliar(pairing: Pairing, m: MusicaSugerida, valor: 1 | -1): Promise<void> {
  // Na hora: "gostei" marca, "não gostei" tira da lista.
  por({ notas: { ...e.notas, [m.id]: valor }, ...(valor === -1 ? { itens: e.itens.filter((x) => x.id !== m.id) } : {}) });
  try { await callRpc(pairing, 'gostos.marcar', { tipo: 'musica', musica: m.id, titulo: m.titulo, artista: m.artista, valor }); }
  catch (err) { avisar(errMessage(err)); }
}

export async function porNaFila(pairing: Pairing): Promise<void> {
  try { avisar(`${(await callRpc(pairing, 'musica.fila', { musicas: e.itens }, { timeoutMs: 25000 })).total} músicas na fila.`); }
  catch (err) { avisar(errMessage(err)); }
}
export async function fazerPlaylist(pairing: Pairing): Promise<void> {
  try { const p = await callRpc(pairing, 'musica.playlist', { musicas: e.itens }, { timeoutMs: 25000 }); avisar(`Playlist "${p.nome}" com ${p.total} músicas.`); }
  catch (err) { avisar(errMessage(err)); }
}

// ── o trecho ────────────────────────────────────────────────────────────────

let tocador: AudioPlayer | null = null;
export function pararPrevia(): void {
  const t = tocador;
  tocador = null;
  if (t) { try { t.pause(); t.remove(); } catch { /* já liberado */ } }
  if (e.previa !== null) por({ previa: null });
}
export async function alternarPrevia(pairing: Pairing, id: number): Promise<void> {
  const era = e.previa === id;
  pararPrevia();
  if (era) return;
  por({ previa: id });
  try {
    const { url } = await callRpc(pairing, 'gostos.previa', { musica: id }, { timeoutMs: 10000 });
    if (e.previa !== id) return;
    if (!url || !/^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(url)) throw new Error('sem trecho');
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const t = createAudioPlayer(url);
    tocador = t;
    t.volume = 0.8;
    t.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish && tocador === t) pararPrevia(); });
    t.play();
  } catch {
    if (e.previa === id) { pararPrevia(); avisar('Esta música não tem trecho.'); }
  }
}
