import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { acharPalavra } from './palavraCasa';

/**
 * "Elysium" no celular, com o app aberto (bloco 129).
 *
 * O Zak instalou a 1.7.0, disse "Elysium" e nada aconteceu: o celular nunca teve palavra
 * de ativação, só a mão livre por botão. Escolha dele: ouvir com o app na tela (Início ou
 * Chat), sem serviço em segundo plano nem notificação fixa.
 *
 * Motor: o `SpeechRecognizer` do Android pelo `expo-speech-recognition`, em modo contínuo
 * (Android 13+; o contínuo também usa uma fonte de áudio própria, que é o que tira o
 * "bip" que o Android toca a cada início e fim de sessão). O texto vai para
 * `acharPalavra`, e ao achar a palavra o reconhecedor é abortado ANTES de chamar quem vai
 * gravar — o microfone é um só (ver `microfone.ts`).
 *
 * 🔴 Fase 14, depois da 1.8.0 instalada: "não apareceu permissão nenhuma" e o log do PC
 * sem uma linha sequer — o arranque falhava CALADO. Agora:
 * - o serviço do Google é escolhido de propósito quando existe (no HyperOS o padrão do
 *   sistema pode ser o da Xiaomi, que não faz contínuo nem pt-BR);
 * - `getSupportedLocales` tem prazo (em alguns aparelhos ele nunca responde, e o arranque
 *   ficava preso nele para sempre);
 * - "idioma não suportado" no modo offline tenta de novo online, e "serviço não
 *   permitido" tenta o outro serviço, antes de desistir;
 * - o estado é visível (pílula na Início, linha em Ajustes → Voz) e cada falha vai na
 *   hora para o log do PC (`[celular] palavra-cel`).
 *
 * Sem permissão de microfone o Android pede uma vez (é a mesma do botão de voz — se ela já
 * foi dada, não aparece pedido nenhum, e isso é normal).
 */

const CHAVE = 'elysium_palavra_no_celular_v1';
const SERVICOS_GOOGLE = ['com.google.android.googlequicksearchbox', 'com.google.android.as', 'com.google.android.tts'];

export async function palavraLigada(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(CHAVE)) !== '0'; } catch { return true; }
}

export async function ligarPalavra(ligar: boolean): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE, ligar ? '1' : '0'); } catch { /* fica o padrão */ }
}

// ── estado visível (Início e Ajustes) ───────────────────────────────────────

export type EstadoPalavra =
  | { fase: 'desligada' }
  | { fase: 'iniciando' }
  | { fase: 'ouvindo'; offline: boolean; servico: string }
  | { fase: 'falhou'; motivo: string };

let estadoAtual: EstadoPalavra = { fase: 'desligada' };
const ouvintes = new Set<(e: EstadoPalavra) => void>();
function definirEstado(e: EstadoPalavra) {
  estadoAtual = e;
  ouvintes.forEach(fn => fn(e));
}
export function useEstadoPalavra(): EstadoPalavra {
  const [e, setE] = useState(estadoAtual);
  useEffect(() => { ouvintes.add(setE); setE(estadoAtual); return () => { ouvintes.delete(setE); }; }, []);
  return e;
}

function comPrazo<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('sem resposta')), ms))]);
}

/** Números da sessão para a calibragem (vão ao log do PC). */
export type DiagPalavra = { sessoes: number; disparos: number; erros: Record<string, number> };

export function usePalavraNoCelular({
  ativo,
  aoOuvir,
  aoDesligar,
  aoDiagnostico,
}: {
  ativo: boolean;
  /** Chamado com o que veio depois da palavra ('' = só "Elysium"). */
  aoOuvir: (resto: string) => void;
  /** Quando o hook para de escutar, com os números desta escuta. */
  aoDesligar?: (d: DiagPalavra) => void;
  /** Uma linha para o log do PC: falha de arranque, serviço escolhido. */
  aoDiagnostico?: (linha: string) => void;
}) {
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;
  const aoOuvirRef = useRef(aoOuvir);
  aoOuvirRef.current = aoOuvir;
  const aoDiagRef = useRef(aoDiagnostico);
  aoDiagRef.current = aoDiagnostico;
  const rodando = useRef(false);
  const recuo = useRef(500);
  const religar = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Depois de um disparo (ou falha sem volta), não religa até o `ativo` cair e voltar. */
  const parado = useRef(false);
  /** Configuração descoberta uma vez: serviço e se dá para ficar offline. */
  const config = useRef<{ servico?: string; offline: boolean } | null>(null);
  const jaContou = useRef(new Set<string>());
  const diag = useRef<DiagPalavra>({ sessoes: 0, disparos: 0, erros: {} });

  /** Uma linha ao PC por motivo diferente — não um laço de linhas iguais. */
  function avisar(linha: string) {
    if (jaContou.current.has(linha)) return;
    jaContou.current.add(linha);
    aoDiagRef.current?.(linha);
  }

  function falhar(motivo: string) {
    parado.current = true;
    rodando.current = false;
    definirEstado({ fase: 'falhou', motivo });
    avisar(`não escuta: ${motivo}`);
  }

  async function descobrir(): Promise<{ servico?: string; offline: boolean }> {
    let servicos: string[] = [];
    let padrao = '';
    try { servicos = ExpoSpeechRecognitionModule.getSpeechRecognitionServices(); } catch { /* lista vazia */ }
    try { padrao = ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName; } catch { /* sem padrão */ }
    const google = SERVICOS_GOOGLE.find(s => servicos.includes(s));
    const servico = google ?? (padrao || undefined);
    let offline = false;
    try {
      const { installedLocales } = await comPrazo(ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: servico === 'com.google.android.as' ? servico : undefined }), 2500);
      offline = installedLocales.some(l => /^pt[-_]BR$/i.test(l));
    } catch { offline = false; }
    avisar(`serviços: ${servicos.join(', ') || 'nenhum'}; padrão: ${padrao || '—'}; usando: ${servico ?? 'padrão do sistema'}; pt-BR offline: ${offline ? 'sim' : 'não'}`);
    return { servico, offline };
  }

  async function comecar() {
    if (!ativoRef.current || rodando.current || parado.current) return;
    definirEstado({ fase: 'iniciando' });
    try {
      const perm = await comPrazo(ExpoSpeechRecognitionModule.requestPermissionsAsync(), 30_000);
      if (!perm.granted) { falhar('sem permissão de microfone/fala'); return; }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) { falhar('o Android diz que não há reconhecimento de fala disponível'); return; }
      if (!config.current) config.current = await descobrir();
      if (!ativoRef.current || parado.current) { definirEstado({ fase: 'desligada' }); return; }
      rodando.current = true;
      diag.current.sessoes++;
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: true,
        maxAlternatives: 3,
        contextualStrings: ['Elysium', 'ok Elysium', 'ei Elysium'],
        requiresOnDeviceRecognition: config.current.offline,
        androidRecognitionServicePackage: config.current.servico,
      });
    } catch (e) {
      rodando.current = false;
      avisar(`erro ao iniciar: ${e instanceof Error ? e.message : String(e)}`);
      recuo.current = Math.min(30_000, recuo.current * 2);
      agendar();
    }
  }

  function agendar() {
    if (religar.current) clearTimeout(religar.current);
    if (!ativoRef.current || parado.current) return;
    religar.current = setTimeout(() => { religar.current = null; comecar(); }, recuo.current);
  }

  function parar() {
    if (religar.current) { clearTimeout(religar.current); religar.current = null; }
    if (rodando.current) {
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* já parado */ }
      rodando.current = false;
    }
  }

  useSpeechRecognitionEvent('start', () => {
    if (!config.current) return;
    definirEstado({ fase: 'ouvindo', offline: config.current.offline, servico: config.current.servico ?? 'padrão' });
    if (diag.current.sessoes === 1) avisar(`escutando (${config.current.offline ? 'no aparelho' : 'online'})`);
  });

  useSpeechRecognitionEvent('result', (ev) => {
    if (!ativoRef.current || parado.current) return;
    recuo.current = 500;
    // Qualquer alternativa serve: a primeira costuma ser "elísio" e a segunda "Elysium".
    for (const r of ev.results) {
      const { achou, resto } = acharPalavra(r.transcript);
      if (!achou) continue;
      // Com o "Elysium" sozinho num parcial, espera o final: o pedido pode vir colado.
      if (!ev.isFinal && !resto) return;
      if (!ev.isFinal && resto.split(' ').length < 2) return;
      parado.current = true;
      diag.current.disparos++;
      parar();
      definirEstado({ fase: 'desligada' });
      aoOuvirRef.current(ev.isFinal ? resto : '');
      return;
    }
  });

  useSpeechRecognitionEvent('end', () => {
    rodando.current = false;
    if (!parado.current && ativoRef.current) definirEstado({ fase: 'iniciando' });
    agendar();
  });

  useSpeechRecognitionEvent('error', (ev) => {
    rodando.current = false;
    diag.current.erros[ev.error] = (diag.current.erros[ev.error] ?? 0) + 1;
    const cfg = config.current;
    // Offline sem o pacote de idioma: tenta online antes de desistir.
    if (ev.error === 'language-not-supported' && cfg?.offline) {
      cfg.offline = false;
      avisar('pt-BR offline recusado; tentando online');
      recuo.current = 500;
      return;
    }
    // Serviço recusou: tenta o padrão do sistema (ou o Google, se estava no padrão).
    if (ev.error === 'service-not-allowed' && cfg && !jaContou.current.has('trocou serviço')) {
      jaContou.current.add('trocou serviço');
      cfg.servico = cfg.servico ? undefined : SERVICOS_GOOGLE[0];
      avisar(`serviço recusou (${ev.message}); tentando ${cfg.servico ?? 'o padrão do sistema'}`);
      recuo.current = 500;
      return;
    }
    if (ev.error === 'not-allowed') { falhar('permissão de microfone/fala negada'); return; }
    if (ev.error === 'service-not-allowed' || ev.error === 'language-not-supported') { falhar(`${ev.error}: ${ev.message}`); return; }
    // "Ninguém falou" e "abortado" são rotina; o resto dobra o recuo.
    if (ev.error === 'no-speech' || ev.error === 'aborted' || ev.error === 'speech-timeout') recuo.current = 500;
    else {
      recuo.current = Math.min(30_000, recuo.current * 2);
      avisar(`erro ${ev.error}: ${ev.message}`);
    }
  });

  useEffect(() => {
    if (ativo) {
      parado.current = false;
      diag.current = { sessoes: 0, disparos: 0, erros: {} };
      comecar();
    } else {
      parar();
      if (estadoAtual.fase !== 'falhou') definirEstado({ fase: 'desligada' });
      const d = diag.current;
      if (d.sessoes) aoDesligar?.(d);
      diag.current = { sessoes: 0, disparos: 0, erros: {} };
    }
    return () => { if (!ativoRef.current) parar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  // Desmontou (app fechado): solta o microfone.
  useEffect(() => () => parar(), []);
}
