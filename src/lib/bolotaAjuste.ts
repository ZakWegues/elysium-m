import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { EstadoDaBolota, lerEstadoDaBolota } from './bolotaDoApp';

/**
 * 23/11: onde a bolota está — solta na tela, guardada no containerzinho do canto ou desligada nos
 * Ajustes — e o último lugar dela. Vale na hora para todo mundo e sobrevive a fechar o app.
 */
const CHAVE = 'elysium.bolota';

export type AjusteDaBolota = { estado: EstadoDaBolota; pos: { x: number; y: number } | null };

let atual: AjusteDaBolota = { estado: 'solta', pos: null };
let mudou = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

AsyncStorage.getItem(CHAVE).then((v) => {
  // Mexeu antes de a leitura chegar: vale o que ele fez agora.
  if (!mudou) { atual = lerEstadoDaBolota(v); avisar(); }
}).catch(() => {});

export function ajusteDaBolota(): AjusteDaBolota { return atual; }

export function mudarBolota(patch: Partial<AjusteDaBolota>): void {
  mudou = true;
  atual = { ...atual, ...patch };
  avisar();
  AsyncStorage.setItem(CHAVE, JSON.stringify(atual)).catch(() => {});
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export function useAjusteDaBolota(): AjusteDaBolota {
  return useSyncExternalStore(assinar, ajusteDaBolota);
}
