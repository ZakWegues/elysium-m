import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Pairing } from './pairing';
import { fetchWithTimeout } from './http';
import { liberarMicrofone, ocuparMicrofone } from './microfone';

/**
 * Falar uma resposta no celular (bloco 85).
 *
 * Antes era sempre o `expo-speech` — a voz do Android, bem pior que a neural que o PC usa.
 * Agora o celular pede o MP3 ao PC (`GET /api/tts`) e toca; é a mesma voz que sai na caixa
 * de som do PC, escolhida em Ajustes → Voz lá. Sem PC, sem rede, ou se a síntese passar de
 * 8 s (a primeira do dia leva ~14 s para abrir a conexão com o serviço de voz), cai no
 * `expo-speech`: responder com a voz pior é melhor que ficar mudo.
 *
 * Baixa para um arquivo em vez de dar a URL ao player: assim o prazo é nosso, e uma falha
 * vira fallback em vez de um player mudo esperando para sempre.
 *
 * A promessa só resolve quando a fala TERMINA (bloco 89): a conversa mão livre precisa
 * saber a hora de voltar a ouvir — antes disso o microfone gravaria a própria resposta.
 */

const CHAVE = 'elysium_voz_do_pc_v1';
const PRAZO_MS = 8000;

let player: AudioPlayer | null = null;
let preferencia: boolean | null = null;
/** Resolve a fala em curso quando alguém interrompe — ninguém fica esperando para sempre. */
let terminarAtual: (() => void) | null = null;

export async function vozDoPcLigada(): Promise<boolean> {
  if (preferencia === null) {
    try { preferencia = (await AsyncStorage.getItem(CHAVE)) !== '0'; } catch { preferencia = true; }
  }
  return preferencia;
}

export async function ligarVozDoPc(ligar: boolean): Promise<void> {
  preferencia = ligar;
  try { await AsyncStorage.setItem(CHAVE, ligar ? '1' : '0'); } catch { /* fica só na memória */ }
}

export function pararDeFalar(): void {
  Speech.stop();
  try { player?.pause(); player?.remove(); } catch { /* já liberado */ }
  player = null;
  const t = terminarAtual;
  terminarAtual = null;
  t?.();
}

/** Teto de segurança: o evento de fim pode não vir (player liberado por fora, áudio mudo). */
function tetoDaFala(texto: string): number {
  return Math.min(120_000, 6000 + texto.length * 90);
}

export async function falar(texto: string, pairing: Pairing | null): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  pararDeFalar();
  // Bloco 129: enquanto fala, a palavra "Elysium" não escuta — ouviria a própria voz.
  ocuparMicrofone('falar');
  try { await falarAgora(t, pairing); } finally { liberarMicrofone('falar'); }
}

async function falarAgora(t: string, pairing: Pairing | null): Promise<void> {
  if (pairing && (await vozDoPcLigada())) {
    try {
      const url = `http://${pairing.activeIp}:${pairing.port}/api/tts?text=${encodeURIComponent(t.slice(0, 2000))}`;
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${pairing.token}` } }, PRAZO_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const arquivo = new File(Paths.cache, `fala-${Date.now()}.mp3`);
      arquivo.write(bytes);
      const este = createAudioPlayer(arquivo.uri);
      player = este;
      await new Promise<void>((resolver) => {
        let feito = false;
        const terminar = () => {
          if (feito) return;
          feito = true;
          clearTimeout(teto);
          try { este.remove(); } catch { /* já liberado */ }
          if (player === este) player = null;
          try { arquivo.delete(); } catch { /* o sistema limpa o cache */ }
          if (terminarAtual === terminar) terminarAtual = null;
          resolver();
        };
        const teto = setTimeout(terminar, tetoDaFala(t));
        terminarAtual = terminar;
        este.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish) terminar(); });
        este.play();
      });
      return;
    } catch {
      // Cai na voz do aparelho logo abaixo.
    }
  }
  await new Promise<void>((resolver) => {
    let feito = false;
    const terminar = () => {
      if (feito) return;
      feito = true;
      clearTimeout(teto);
      if (terminarAtual === terminar) terminarAtual = null;
      resolver();
    };
    const teto = setTimeout(terminar, tetoDaFala(t));
    terminarAtual = terminar;
    Speech.speak(t, { language: 'pt-BR', onDone: terminar, onStopped: terminar, onError: terminar });
  });
}
