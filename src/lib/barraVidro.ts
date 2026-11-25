import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * 25/11 (APK 2.14.0): "Barra com liquid glass" — ligada por padrão onde o Android aguenta (13+).
 * Trava: cada abertura anota a tentativa antes de a barra entrar e apaga depois de 6 s de pé. Duas
 * aberturas seguidas que não chegaram lá (o app caiu) desligam a barra, senão não daria para abrir
 * Ajustes e desligar à mão.
 */
const CHAVE = 'elysium.barraVidro';
const CHAVE_TENTATIVAS = 'elysium.barraVidro.tentativas';
export const MAX_QUEDAS = 2;
let ligada = true;
let pronta = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** Com que ajuste abrir e quantas tentativas anotar. Pura. */
export function aoAbrir(guardado: string | null, tentativas: string | null): { ligada: boolean; tentativas: number } {
  if (guardado === '0') return { ligada: false, tentativas: 0 };
  const n = Number(tentativas) || 0;
  return n >= MAX_QUEDAS ? { ligada: false, tentativas: 0 } : { ligada: true, tentativas: n + 1 };
}

let confirmar: ReturnType<typeof setTimeout> | undefined;
async function anotar(n: number): Promise<void> {
  await AsyncStorage.setItem(CHAVE_TENTATIVAS, String(n)).catch(() => {});
  clearTimeout(confirmar);
  if (n) confirmar = setTimeout(() => { AsyncStorage.setItem(CHAVE_TENTATIVAS, '0').catch(() => {}); }, 6000);
}

Promise.all([AsyncStorage.getItem(CHAVE), AsyncStorage.getItem(CHAVE_TENTATIVAS)]).then(async ([g, t]) => {
  const r = aoAbrir(g, t);
  ligada = r.ligada;
  await anotar(r.tentativas);
  if (!r.ligada && g !== '0') await AsyncStorage.setItem(CHAVE, '0').catch(() => {});
}).catch(() => {}).finally(() => { pronta = true; avisar(); });

export function barraVidro(): boolean {
  return ligada;
}

export function ligarBarraVidro(v: boolean): void {
  ligada = v;
  // Ligou à mão: a anotação entra antes da barra.
  void anotar(v ? 1 : 0).then(avisar);
  if (!v) avisar();
  AsyncStorage.setItem(CHAVE, v ? '1' : '0').catch(() => {});
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** O ajuste (para o interruptor). */
export function useBarraVidro(): boolean {
  return useSyncExternalStore(assinar, barraVidro);
}
const podeMostrar = () => ligada && pronta;
/** Mostrar agora: ligada e com a tentativa já anotada. */
export function useMostrarBarraVidro(): boolean {
  return useSyncExternalStore(assinar, podeMostrar);
}
