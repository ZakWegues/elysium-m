import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { diagTela } from './telaDiag';

/**
 * O ritmo do que se mexe sozinho (25/11, bateria): o fundo e a esfera nativos (modules/vidro,
 * Ritmo.kt) param com o toque, na troca de aba, depois de 20 s sem toque e com economia de bateria.
 * Aqui o JS avisa do toque, e o que ainda anima no JS pergunta `useOcioso()`.
 */
const CHAVE = 'elysium.economiaDeBateria';
type Nativo = { contarQuadros?(ms: number): Promise<number>; mexeu?(): void; pausarFundo?(ms: number): void; economia?(sempre: boolean): void; nivelDaVoz?(v: number): void };
const nativo = requireOptionalNativeModule<Nativo>('Vidro');

export const OCIOSO_MS = 20_000;
/** Ligada vale sempre; desligada, o nativo liga sozinho com pouca bateria. */
let economia = false;
let ocioso = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** Uma vez por abertura: parado há 20 s, quantos quadros o app ainda desenha? Vai para o log do PC. */
let medido = false;
async function medir(): Promise<void> {
  if (medido || !nativo?.contarQuadros || AppState.currentState !== 'active') return;
  medido = true;
  try {
    const n = await nativo.contarQuadros(10_000);
    if (ocioso && AppState.currentState === 'active') diagTela(`bateria: ${n} quadros em 10 s parado`);
    else medido = false;
  } catch { /* só diagnóstico */ }
}

function rearmar(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; ocioso = true; avisar(); void medir(); }, OCIOSO_MS);
}
rearmar();
AppState.addEventListener('change', (s) => { if (s === 'active') tocouNaTela(); });

AsyncStorage.getItem(CHAVE).then((v) => { if (v === '1') { economia = true; nativo?.economia?.(true); avisar(); } }).catch(() => {});

export function tocouNaTela(): void {
  nativo?.mexeu?.();
  rearmar();
  if (ocioso) { ocioso = false; avisar(); }
}
export function pausarNativo(ms: number): void { nativo?.pausarFundo?.(ms); }
export function nivelDaVoz(v: number): void { nativo?.nivelDaVoz?.(v); }

export function ligarEconomia(v: boolean): void {
  economia = v;
  nativo?.economia?.(v);
  avisar();
  AsyncStorage.setItem(CHAVE, v ? '1' : '0').catch(() => {});
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export function useEconomia(): boolean { return useSyncExternalStore(assinar, () => economia); }
/** 20 s sem toque (ou economia ligada): nada de animação em laço. */
export function useOcioso(): boolean { return useSyncExternalStore(assinar, () => ocioso || economia); }
