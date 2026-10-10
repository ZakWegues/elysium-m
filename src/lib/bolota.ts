import { useEffect, useState } from 'react';
import { makeMutable } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A bolota Stark do celular (fase 21, bloco 215) — o estado que as telas alimentam.
 *
 * O Chat é quem grava a voz e sabe se está ouvindo ou pensando; a fala da Ely mora em
 * `falar.ts`. A bolota fica no App, por cima de todas as abas, e lê daqui: a fase da voz (um
 * ouvinte simples) e o nível do microfone (um valor do Reanimated, lido direto na thread de UI,
 * sem re-render a cada 70 ms).
 *
 * O celular toca o MP3 do PC e não mede volume: o pulso da Ely sai do TEXTO do trecho, palavra
 * por palavra, no ritmo médio da voz neural (~65 ms por letra).
 */

export type FaseVozBolota = 'ouvindo' | 'pensando' | null;
export type EstadoBolota = 'dormindo' | 'ouvindo' | 'pensando' | 'falando';

/** Nível do microfone, 0–1 (o Chat escreve, a bolota lê na thread de UI). */
export const nivelDaBolota = makeMutable(0);

let fase: FaseVozBolota = null;
const ouvintes = new Set<(f: FaseVozBolota) => void>();

export function definirFaseDaBolota(f: FaseVozBolota): void {
  if (f === fase) return;
  fase = f;
  ouvintes.forEach(fn => fn(f));
}

export function useFaseDaBolota(): FaseVozBolota {
  const [f, setF] = useState(fase);
  useEffect(() => {
    ouvintes.add(setF);
    setF(fase);
    return () => { ouvintes.delete(setF); };
  }, []);
  return f;
}

/** Quem manda na cor: ouvir e pensar ganham da fala (um pedido novo corta a fala). Pura. */
export function estadoDaBolota(faseVoz: FaseVozBolota, falando: boolean): EstadoBolota {
  if (faseVoz === 'ouvindo') return 'ouvindo';
  if (faseVoz === 'pensando') return 'pensando';
  return falando ? 'falando' : 'dormindo';
}

export interface PalavraBolota { inicio: number; dur: number; tam: number }

/** As palavras do trecho espalhadas pela duração estimada. Pura. */
export function palavrasDoTrecho(texto: string, msPorLetra = 65): { palavras: PalavraBolota[]; durMs: number } {
  const tokens = texto.split(/\s+/).filter(Boolean);
  const durMs = Math.max(600, texto.replace(/\s+/g, ' ').trim().length * msPorLetra);
  if (!tokens.length) return { palavras: [], durMs };
  const pesos = tokens.map(t => t.replace(/[^\p{L}\p{N}]/gu, '').length + 2 + (/[.!?…;:,]$/.test(t) ? 3 : 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  const palavras: PalavraBolota[] = [];
  let t = 0;
  tokens.forEach((tok, i) => {
    const fatia = (pesos[i] / total) * durMs;
    palavras.push({ inicio: Math.round(t), dur: Math.round(fatia * (/[.!?…;:,]$/.test(tok) ? 0.6 : 0.85)), tam: tok.replace(/[^\p{L}\p{N}]/gu, '').length || 1 });
    t += fatia;
  });
  return { palavras, durMs };
}

/** O envelope (0–1 a cada `passoMs`): um "morro" por palavra, quase zero entre elas. Pura. */
export function envelopeDoTrecho(palavras: PalavraBolota[], durMs: number, passoMs = 50): number[] {
  const n = Math.ceil(durMs / passoMs) + 1;
  const env = new Array<number>(n).fill(0);
  for (const p of palavras) {
    const pico = Math.min(1, 0.45 + Math.min(p.tam, 12) * 0.05);
    const a = Math.floor(p.inicio / passoMs);
    const b = Math.max(a + 1, Math.ceil((p.inicio + p.dur) / passoMs));
    const subida = Math.max(1, Math.round((b - a) * 0.25));
    for (let i = a; i <= b && i < n; i++) {
      const k = i - a;
      const v = k <= subida ? pico * (k / subida) : pico * Math.max(0, 1 - (k - subida) / (b - a - subida + 1));
      env[i] = Math.max(env[i], v);
    }
  }
  return env.map(v => Math.round(v * 100) / 100);
}

/** Posição solta presa à tela (a bolota nunca some atrás da borda). Pura. */
export function prenderNaTela(x: number, y: number, tam: number, tela: { largura: number; altura: number; topo: number; base: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 8), tela.largura - tam - 8),
    y: Math.min(Math.max(y, tela.topo + 8), tela.altura - tela.base - tam - 8),
  };
}

const CHAVE_POS = 'bolota.posicao';
export async function lerPosicaoDaBolota(): Promise<{ x: number; y: number } | null> {
  try {
    const j = JSON.parse((await AsyncStorage.getItem(CHAVE_POS)) ?? 'null');
    return j && Number.isFinite(j.x) && Number.isFinite(j.y) ? j : null;
  } catch { return null; }
}
export function gravarPosicaoDaBolota(x: number, y: number): void {
  AsyncStorage.setItem(CHAVE_POS, JSON.stringify({ x: Math.round(x), y: Math.round(y) })).catch(() => {});
}
