import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * 09/11 (APK 2.10.0): "Brilho segue o celular" — o brilho do vidro nativo acompanha a inclinação
 * do aparelho. Ligado por padrão; vale na hora para todos os vidros (assinatura simples).
 */
const CHAVE = 'elysium.brilhoSegueAparelho';
let ligado = true;
const ouvintes = new Set<() => void>();

AsyncStorage.getItem(CHAVE).then((v) => { if (v === '0') { ligado = false; ouvintes.forEach((f) => f()); } }).catch(() => {});

export function brilhoSegueAparelho(): boolean {
  return ligado;
}

export function ligarBrilhoSegueAparelho(v: boolean): void {
  ligado = v;
  ouvintes.forEach((f) => f());
  AsyncStorage.setItem(CHAVE, v ? '1' : '0').catch(() => {});
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export function useBrilhoSegueAparelho(): boolean {
  return useSyncExternalStore(assinar, brilhoSegueAparelho);
}
