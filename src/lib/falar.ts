import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Pairing } from './pairing';
import { fetchWithTimeout } from './http';
import { liberarMicrofone, ocuparMicrofone } from './microfone';
import { escolherVozFeminina } from './vozFeminina';
import { frasesDe, partesDaFala, trechoParaMostrar } from './divisaoFala';

/**
 * Falar uma resposta no celular (bloco 85) — e, desde 08/10, um pequeno player da Ely.
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
 * A promessa só resolve quando a fala TERMINA (bloco 89): o pedido por voz e o botão Interromper precisam
 * saber a hora de voltar a ouvir — antes disso o microfone gravaria a própria resposta.
 *
 * 08/10 — o Zak pediu três coisas que mudaram este arquivo:
 * 1. **Trocar de aba não para a fala.** Ninguém mais chama `pararDeFalar()` ao sair de uma
 *    tela; quem para é o botão (a pílula `FalaFlutuante`) ou uma fala nova.
 * 2. **Pausar e retomar.** Texto longo vai em partes (`divisaoFala.ts`); a voz do PC pausa o
 *    player, a do aparelho cala e recomeça a frase em que estava.
 * 3. **Continuar com o app minimizado.** O player vira o "ativo da tela de bloqueio": o
 *    Android mostra a notificação de mídia com play/pausa, e o serviço de reprodução do
 *    `expo-audio` (já no APK 2.0 — o plugin liga `enableBackgroundPlayback` por padrão)
 *    mantém o som com o app em segundo plano. Pausar pela notificação chega aqui pelo
 *    `playbackStatusUpdate` e a pílula acompanha.
 */

const CHAVE = 'elysium_voz_do_pc_v1';
const PRAZO_MS = 8000;

let player: AudioPlayer | null = null;
/** Voz feminina do aparelho, procurada uma vez (02/10). `null` = não achou; usa a padrão. */
let vozDoAparelho: Promise<string | null> | null = null;
function vozFemininaDoAparelho(): Promise<string | null> {
  if (!vozDoAparelho) {
    // No Android a lista volta VAZIA enquanto o motor de voz ainda sobe; guardar esse `null`
    // deixava a voz padrão (muitas vezes masculina) pela sessão inteira. Lista vazia = tentar
    // de novo na próxima fala.
    vozDoAparelho = Speech.getAvailableVoicesAsync()
      .then(v => {
        if (!v.length) vozDoAparelho = null;
        return escolherVozFeminina(v);
      })
      .catch(() => { vozDoAparelho = null; return null; });
  }
  return vozDoAparelho;
}
let preferencia: boolean | null = null;
/** Resolve a fala em curso quando alguém interrompe — ninguém fica esperando para sempre. */
let terminarAtual: (() => void) | null = null;

export async function vozDoPcLigada(): Promise<boolean> {
  if (preferencia === null) {
    try { preferencia = (await AsyncStorage.getItem(CHAVE)) !== '0'; } catch { preferencia = true; }
  }
  return preferencia;
}

/**
 * Ler em voz alta as respostas DIGITADAS (02/10). A voz é o padrão desde o bloco 85, mas
 * quem digita costuma estar onde não dá para ouvir — agora dá para desligar. Pedidos por
 * voz (o "Ely", segurar o microfone) sempre respondem falando.
 */
const CHAVE_LER = 'elysium_ler_respostas_escritas_v1';
let lerEscritas: boolean | null = null;
export async function lerRespostasEscritas(): Promise<boolean> {
  if (lerEscritas === null) {
    try { lerEscritas = (await AsyncStorage.getItem(CHAVE_LER)) !== '0'; } catch { lerEscritas = true; }
  }
  return lerEscritas;
}
export async function ligarLerRespostasEscritas(ligar: boolean): Promise<void> {
  lerEscritas = ligar;
  try { await AsyncStorage.setItem(CHAVE_LER, ligar ? '1' : '0'); } catch { /* fica só na memória */ }
}

export async function ligarVozDoPc(ligar: boolean): Promise<void> {
  preferencia = ligar;
  try { await AsyncStorage.setItem(CHAVE, ligar ? '1' : '0'); } catch { /* fica só na memória */ }
}

// ── Estado da fala, para a pílula e para quem mais quiser olhar ─────────────────
export type EstadoFala = {
  falando: boolean;
  pausada: boolean;
  /** O pedaço que está saindo agora (sem markdown, curto). */
  trecho: string;
  /** Parte atual (1…total). Texto curto = 1 de 1. */
  parte: number;
  total: number;
};
const PARADA: EstadoFala = { falando: false, pausada: false, trecho: '', parte: 0, total: 0 };
let estado: EstadoFala = PARADA;
const ouvintes = new Set<(e: EstadoFala) => void>();
function publicar(mudanca: Partial<EstadoFala>) {
  const novo = { ...estado, ...mudanca };
  if (novo.falando === estado.falando && novo.pausada === estado.pausada && novo.trecho === estado.trecho
    && novo.parte === estado.parte && novo.total === estado.total) return;
  estado = novo;
  ouvintes.forEach(fn => fn(estado));
}
export function estadoDaFala(): EstadoFala { return estado; }
export function useFala(): EstadoFala {
  const [e, setE] = useState(estado);
  useEffect(() => {
    ouvintes.add(setE);
    setE(estado);
    return () => { ouvintes.delete(setE); };
  }, []);
  return e;
}
/** Compatível com quem só queria saber se está falando (02/10). Pausada conta como falando. */
export function useFalando(): boolean {
  return useFala().falando;
}

/**
 * Pausa/retomada. Cada modo de fala registra aqui como pausar e retomar o que está tocando;
 * a pílula e a notificação chamam estas duas funções sem saber se é MP3 ou voz do aparelho.
 */
let controle: { pausar: () => void; retomar: () => void } | null = null;
export function pausarFala(): void {
  if (!estado.falando || estado.pausada || !controle) return;
  controle.pausar();
  publicar({ pausada: true });
}
export function retomarFala(): void {
  if (!estado.falando || !estado.pausada || !controle) return;
  controle.retomar();
  publicar({ pausada: false });
}

export function pararDeFalar(): void {
  // Avança a geração: uma fala que ainda está BAIXANDO o MP3 do PC (até 8 s) vê o número
  // mudado quando o download termina e não toca. Antes o "Interromper" não fazia nada
  // nessa janela e o áudio saía mesmo assim.
  geracao++;
  controle = null;
  Speech.stop();
  soltarPlayer();
  void tirarAvisoDaVozDoAparelho();
  const t = terminarAtual;
  terminarAtual = null;
  t?.();
  // Quem parou solta o microfone e apaga o "falando" na hora: a fala parada não chega mais
  // a fazer isso no próprio `finally` (a geração já é outra).
  liberarMicrofone('falar');
  publicar(PARADA);
}

function soltarPlayer() {
  const p = player;
  player = null;
  if (!p) return;
  try { p.setActiveForLockScreen(false); } catch { /* versão sem controles */ }
  try { p.pause(); p.remove(); } catch { /* já liberado */ }
}

/** Teto de segurança: o evento de fim pode não vir (player liberado por fora, áudio mudo). */
function tetoDaFala(texto: string): number {
  return Math.min(120_000, 6000 + texto.length * 90);
}

/**
 * Cada fala tem um número. Uma fala nova interrompe a anterior, e o `finally` da anterior
 * roda DEPOIS de a nova começar: sem o número, ele soltava o microfone e apagava o
 * "falando" no meio da fala nova.
 */
let geracao = 0;

export async function falar(texto: string, pairing: Pairing | null): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  pararDeFalar();
  const minha = geracao;
  // Bloco 129: enquanto fala, a palavra "Ely" não escuta — ouviria a própria voz. Pausada
  // também segura o microfone: ao retomar, a voz voltaria a sair com a escuta ligada.
  ocuparMicrofone('falar');
  publicar({ falando: true, pausada: false, trecho: trechoParaMostrar(t), parte: 1, total: 1 });
  try { await falarAgora(t, pairing, minha); } finally {
    if (minha === geracao) {
      controle = null;
      liberarMicrofone('falar');
      publicar(PARADA);
    }
  }
}

/** Modo de áudio para tocar com o app minimizado e ganhar a notificação de mídia. */
let modoPronto: Promise<void> | null = null;
function prepararModo(): Promise<void> {
  if (!modoPronto) {
    // `doNotMix` é exigência dos controles da tela de bloqueio; o efeito colateral é pausar a
    // música de outro app do celular enquanto a Ely fala — o que qualquer assistente faz.
    modoPronto = setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })
      .catch(() => { modoPronto = null; });
  }
  return modoPronto;
}

async function baixarParte(texto: string, pairing: Pairing): Promise<File> {
  const url = `http://${pairing.activeIp}:${pairing.port}/api/tts?text=${encodeURIComponent(texto)}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${pairing.token}` } }, PRAZO_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const arquivo = new File(Paths.cache, `fala-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
  arquivo.write(bytes);
  return arquivo;
}

async function falarAgora(t: string, pairing: Pairing | null, minha: number): Promise<void> {
  if (pairing && (await vozDoPcLigada())) {
    const partes = partesDaFala(t);
    let tocouAlguma = false;
    try {
      await prepararModo();
      // A primeira parte baixa antes de tocar; da segunda em diante, a próxima já vem
      // baixando enquanto a atual toca.
      let proxima: Promise<File> | null = baixarParte(partes[0], pairing);
      for (let i = 0; i < partes.length; i++) {
        const arquivo = await proxima!;
        // Interrompida (ou trocada por outra fala) durante o download: não toca.
        if (minha !== geracao) { try { arquivo.delete(); } catch { /* cache */ } return; }
        proxima = i + 1 < partes.length ? baixarParte(partes[i + 1], pairing) : null;
        // Uma falha baixando a PRÓXIMA não pode virar rejeição solta enquanto esta toca.
        proxima?.catch(() => {});
        publicar({ trecho: trechoParaMostrar(partes[i]), parte: i + 1, total: partes.length });
        tocouAlguma = true;
        await tocarArquivo(arquivo, partes[i], minha);
        if (minha !== geracao) return;
      }
      return;
    } catch {
      // Falhou antes de sair som: cai na voz do aparelho com o texto inteiro. Falhou no meio:
      // o resto vai pela voz do aparelho, sem repetir o que já foi dito.
      if (minha !== geracao) return;
      if (tocouAlguma) {
        const ditas = estado.parte;
        t = partes.slice(ditas).join(' ');
        if (!t) return;
      }
    }
  }
  if (minha !== geracao) return;
  await falarComVozDoAparelho(t, minha);
}

/** Toca um MP3 até o fim (ou até alguém parar), com a notificação de mídia ligada. */
function tocarArquivo(arquivo: File, texto: string, minha: number): Promise<void> {
  const este = createAudioPlayer(arquivo.uri);
  player = este;
  return new Promise<void>((resolver) => {
    let feito = false;
    let teto: ReturnType<typeof setTimeout> | null = null;
    const armarTeto = () => { if (teto) clearTimeout(teto); teto = setTimeout(terminar, tetoDaFala(texto)); };
    const terminar = () => {
      if (feito) return;
      feito = true;
      if (teto) clearTimeout(teto);
      sub.remove();
      if (player === este) soltarPlayer();
      else { try { este.remove(); } catch { /* já liberado */ } }
      try { arquivo.delete(); } catch { /* o sistema limpa o cache */ }
      if (terminarAtual === terminar) terminarAtual = null;
      resolver();
    };
    armarTeto();
    terminarAtual = terminar;
    controle = {
      // O teto não corre pausado — senão uma pausa longa encerrava a fala sozinha.
      pausar: () => { if (teto) { clearTimeout(teto); teto = null; } try { este.pause(); } catch { /* liberado */ } },
      retomar: () => { armarTeto(); try { este.play(); } catch { /* liberado */ } },
    };
    let tocando = false;
    const sub = este.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) { terminar(); return; }
      if (minha !== geracao) return;
      // Pausa e play pela NOTIFICAÇÃO (ou pelo fone de ouvido) chegam aqui: a pílula acompanha.
      if (s.playing !== tocando) {
        const pausadoPorFora = tocando && !s.playing;
        tocando = s.playing;
        if (pausadoPorFora && !estado.pausada) { if (teto) { clearTimeout(teto); teto = null; } publicar({ pausada: true }); }
        else if (s.playing && estado.pausada) { armarTeto(); publicar({ pausada: false }); }
      }
    });
    try {
      este.setActiveForLockScreen(true, { title: 'Ely está falando', artist: 'ELYSIUM', albumTitle: trechoParaMostrar(texto, 80) }, { showSeekForward: false, showSeekBackward: false });
    } catch { /* sem controles nesta versão: toca do mesmo jeito */ }
    este.play();
  });
}

/**
 * A voz do aparelho, frase por frase. O `expo-speech` não pausa no Android: pausar cala e
 * guarda a frase; retomar recomeça a frase em que estava.
 */
async function falarComVozDoAparelho(t: string, minha: number): Promise<void> {
  const voz = await vozFemininaDoAparelho();
  if (minha !== geracao) return;
  // "Ely" lido "Éli" (02/10), como na voz do PC.
  const frases = frasesDe(t.replace(/\bEly\b/gi, 'Éli'));
  if (!frases.length) return;
  void mostrarAvisoDaVozDoAparelho();
  let indice = 0;
  let pausada = false;
  let retomar: (() => void) | null = null;
  controle = {
    pausar: () => { pausada = true; Speech.stop(); },
    retomar: () => { pausada = false; const r = retomar; retomar = null; r?.(); },
  };
  try {
    while (indice < frases.length) {
      if (minha !== geracao) return;
      if (pausada) {
        await new Promise<void>((r) => { retomar = r; terminarAtual = () => { retomar = null; r(); }; });
        continue;
      }
      publicar({ trecho: trechoParaMostrar(frases[indice]), parte: indice + 1, total: frases.length });
      const completou = await falarFrase(frases[indice], voz, minha);
      if (minha !== geracao) return;
      // Calada pela pausa: a mesma frase recomeça ao retomar. Senão, a próxima.
      if (completou || !pausada) indice++;
    }
  } finally {
    void tirarAvisoDaVozDoAparelho();
  }
}

/** Uma frase. Devolve true se chegou ao fim (false = calada por pausa ou parada). */
function falarFrase(frase: string, voz: string | null, minha: number): Promise<boolean> {
  return new Promise<boolean>((resolver) => {
    let feito = false;
    const terminar = (completou: boolean) => {
      if (feito) return;
      feito = true;
      clearTimeout(teto);
      if (terminarAtual === parar) terminarAtual = null;
      resolver(completou);
    };
    const parar = () => terminar(false);
    // O teto CALA o aparelho além de resolver: antes ele só resolvia, o microfone era solto
    // com a voz ainda saindo, e a escuta do "Ely" ouvia o "Éli" da própria resposta.
    const teto = setTimeout(() => { Speech.stop(); terminar(true); }, tetoDaFala(frase));
    terminarAtual = parar;
    // Voz feminina do aparelho quando achar uma (02/10); senão a padrão com o tom um pouco
    // acima. Se a escolhida falhar (voz só de rede, sem internet), repete com a padrão.
    const padrao = () => Speech.speak(frase, { language: 'pt-BR', pitch: 1.1, onDone: () => terminar(true), onStopped: parar, onError: () => terminar(true) });
    if (voz) Speech.speak(frase, { language: 'pt-BR', voice: voz, onDone: () => terminar(true), onStopped: parar, onError: () => { if (!feito && minha === geracao) padrao(); else terminar(true); } });
    else padrao();
  });
}

// ── Aviso fora do app para a voz do aparelho ─────────────────────────────────────
// A voz do PC tem a notificação de mídia do `expo-audio`. A do aparelho (sem PC) continua
// falando minimizada, mas sem controle nenhum: este aviso fixo, com o botão Parar, cobre isso.
const ID_AVISO = 'ely-falando';
let avisoMostrado = false;
async function mostrarAvisoDaVozDoAparelho(): Promise<void> {
  try {
    const { avisoDeFala } = await import('./notificacoes');
    avisoMostrado = await avisoDeFala(ID_AVISO, true, pararDeFalar);
  } catch { /* sem notificação: fala do mesmo jeito */ }
}
async function tirarAvisoDaVozDoAparelho(): Promise<void> {
  if (!avisoMostrado) return;
  avisoMostrado = false;
  try {
    const { avisoDeFala } = await import('./notificacoes');
    await avisoDeFala(ID_AVISO, false);
  } catch { /* some sozinho ao fechar o app */ }
}
