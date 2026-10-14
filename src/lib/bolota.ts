import { useEffect, useState } from 'react';
import { makeMutable } from 'react-native-reanimated';
import { pulsoDeTecla } from './esferaLogica';

/**
 * A esfera 3D do Chat do celular (fase 21) — o estado que as telas alimentam.
 *
 * O Chat é quem grava a voz e sabe se está ouvindo ou pensando; a fala da Ely mora em
 * `falar.ts`. A esfera fica no fundo do Chat e lê daqui: a fase da voz (um
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

/**
 * Fase 22: os toques pequenos que a esfera sente. `impulso` é um piso de nível que decai
 * sozinho (a esfera lê e abaixa a cada quadro); `ondaTecla` faz a onda leve no lado de baixo;
 * `chute` é um empurrão na mola da inclinação (a esfera "olha" para a mensagem enviada).
 */
export const impulsoDaBolota = makeMutable(0);
export const ondaTeclaDaBolota = makeMutable(0);
export const chuteDaBolota = makeMutable(0);

/** Uma tecla no campo de texto: micro-pulso (+0,08, teto 0,35) e a onda do lado de baixo. */
export function pulsoDaBolota(quanto = 0.08): void {
  impulsoDaBolota.value = pulsoDeTecla(impulsoDaBolota.value, quanto);
  ondaTeclaDaBolota.value = 1;
}

/** Mensagem enviada: a esfera inclina para baixo e a mola a traz de volta. */
export function inclinarBolota(): void {
  chuteDaBolota.value = chuteDaBolota.value + 0.07;
}

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
