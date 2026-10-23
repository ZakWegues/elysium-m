import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { linhaDoCrash, marcaDoCrash, type MarcaTela } from './telas';

/**
 * Telas inteligentes: ligar/desligar e a guarda contra crash em série (23/10).
 *
 * Crash da WebView no Android derruba o PROCESSO — nenhum try/catch de JS pega. Então, antes
 * de montar uma tela, fica uma marca no disco; a tela que monta (ou desmonta) apaga a marca.
 * Se o app abre e a marca está lá, recente, a abertura anterior morreu montando uma tela: as
 * telas desligam sozinhas (o chat volta a funcionar, só em texto), ele é avisado, e o PC recebe
 * a linha do diagnóstico — é o único log que temos do aparelho.
 */

const CHAVE_LIGADAS = 'elysium:telasLigadas';
const CHAVE_MARCAS = 'elysium:telaMontando';

let ligadas = true;
const ouvintes = new Set<() => void>();
let marcas: Record<string, MarcaTela> = {};

function avisar(): void { for (const fn of ouvintes) fn(); }

export function useTelasLigadas(): boolean {
  return useSyncExternalStore(
    (fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
    () => ligadas,
  );
}

export function telasLigadasAgora(): boolean { return ligadas; }

export async function ligarTelas(v: boolean): Promise<void> {
  ligadas = v;
  avisar();
  try { await AsyncStorage.setItem(CHAVE_LIGADAS, v ? '1' : '0'); } catch { /* fica em memória */ }
}

function gravarMarcas(): void {
  AsyncStorage.setItem(CHAVE_MARCAS, JSON.stringify(marcas)).catch(() => {});
}

/** Antes de montar a WebView da tela `id`. */
export function marcarMontando(id: string, tamanho: number): void {
  marcas = { ...marcas, [id]: { em: Date.now(), tamanho } };
  gravarMarcas();
}

/** A tela `id` montou (ou saiu da tela, ou o processo dela morreu e foi tratado). */
export function limparMarca(id: string): void {
  if (!(id in marcas)) return;
  const { [id]: _fora, ...resto } = marcas;
  marcas = resto;
  gravarMarcas();
}

/**
 * Na abertura: lê o ajuste e confere se a anterior morreu montando uma tela. Devolve a linha do
 * diagnóstico quando desligou as telas agora (quem chama avisa e manda ao PC), ou null.
 */
export async function conferirAberturaAnterior(): Promise<string | null> {
  try {
    const [l, m] = await Promise.all([AsyncStorage.getItem(CHAVE_LIGADAS), AsyncStorage.getItem(CHAVE_MARCAS)]);
    ligadas = l !== '0';
    marcas = {};
    await AsyncStorage.removeItem(CHAVE_MARCAS);
    let guardado: unknown = null;
    try { guardado = m ? JSON.parse(m) : null; } catch { guardado = null; }
    const marca = marcaDoCrash(guardado);
    if (!marca || !ligadas) { avisar(); return null; }
    await ligarTelas(false);
    return linhaDoCrash(marca, { modelo: Device.modelName, android: Platform.OS === 'android' ? Device.osVersion : Platform.OS });
  } catch {
    return null;
  }
}
