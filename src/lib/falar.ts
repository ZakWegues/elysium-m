import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Pairing } from './pairing';
import { fetchWithTimeout } from './http';

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
 */

const CHAVE = 'elysium_voz_do_pc_v1';
const PRAZO_MS = 8000;

let player: AudioPlayer | null = null;
let preferencia: boolean | null = null;

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
}

export async function falar(texto: string, pairing: Pairing | null): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  pararDeFalar();
  if (pairing && (await vozDoPcLigada())) {
    try {
      const url = `http://${pairing.activeIp}:${pairing.port}/api/tts?text=${encodeURIComponent(t.slice(0, 2000))}`;
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${pairing.token}` } }, PRAZO_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const arquivo = new File(Paths.cache, `fala-${Date.now()}.mp3`);
      arquivo.write(bytes);
      player = createAudioPlayer(arquivo.uri);
      const este = player;
      este.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) {
          try { este.remove(); } catch { /* já liberado */ }
          if (player === este) player = null;
          try { arquivo.delete(); } catch { /* o sistema limpa o cache */ }
        }
      });
      este.play();
      return;
    } catch {
      // Cai na voz do aparelho logo abaixo.
    }
  }
  Speech.speak(t, { language: 'pt-BR' });
}
