import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { acharPalavra } from './palavraCasa';

/**
 * "Elysium" no celular, com o app aberto (bloco 129).
 *
 * O dono instalou a 1.7.0, disse "Elysium" e nada aconteceu: o celular nunca teve palavra
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

/**
 * Quem liga/desliga avisa na hora (07/10): o App só relia o ajuste ao voltar do segundo
 * plano, então desligar em Ajustes e fechar a gaveta deixava a escuta ligada.
 */
const ouvintesDoAjuste = new Set<(ligada: boolean) => void>();
export function aoMudarPalavra(fn: (ligada: boolean) => void): () => void {
  ouvintesDoAjuste.add(fn);
  return () => { ouvintesDoAjuste.delete(fn); };
}

export async function ligarPalavra(ligar: boolean): Promise<void> {
  ouvintesDoAjuste.forEach(fn => fn(ligar));
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
  // Sem isto, cada fim/início de sessão (pode ser a cada meio segundo) redesenhava a Início.
  if (JSON.stringify(e) === JSON.stringify(estadoAtual)) return;
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
  /**
   * Os modos a tentar, do melhor ao mais garantido (02/10): no aparelho pelo Google, online
   * pelo Google, e o padrão do sistema. Um modo que não confirma o início em 4 s é largado.
   */
  const modos = useRef<{ servico?: string; offline: boolean }[] | null>(null);
  const degrau = useRef(0);
  const vigia = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = { get current() { return modos.current?.[degrau.current] ?? null; } };
  const jaContou = useRef(new Set<string>());
  const diag = useRef<DiagPalavra>({ sessoes: 0, disparos: 0, erros: {} });
  /**
   * 02/10: depois da OTA o log mostrou UMA sessão e nenhum evento "start" — e o dono via o
   * teclado bugado. Suspeita: o reconhecedor num liga-desliga sem fim. Estes números saem
   * num resumo a cada 30 s, e sessão que morre em menos de 3 s sem ouvir nada freia o
   * religamento (2 s, 4 s… até 30 s) em vez de tentar de novo em meio segundo.
   */
  const contas = useRef({ chamadas: 0, inicios: 0, fins: 0, resultados: 0, curtas: 0 });
  const ultimoResumo = useRef('');
  const inicioSessao = useRef(0);
  const ouviuNaSessao = useRef(false);

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

  async function descobrir(): Promise<{ servico?: string; offline: boolean }[]> {
    let servicos: string[] = [];
    let padrao = '';
    try { servicos = ExpoSpeechRecognitionModule.getSpeechRecognitionServices(); } catch { /* lista vazia */ }
    try { padrao = ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName; } catch { /* sem padrão */ }
    const google = SERVICOS_GOOGLE.find(s => servicos.includes(s));
    let offline = false;
    if (servicos.includes('com.google.android.as')) {
      try {
        const { installedLocales } = await comPrazo(ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' }), 2500);
        offline = installedLocales.some(l => /^pt[-_]BR$/i.test(l));
      } catch { offline = false; }
    }
    const lista: { servico?: string; offline: boolean }[] = [];
    if (offline) lista.push({ servico: 'com.google.android.as', offline: true });
    if (google) lista.push({ servico: google, offline: false });
    lista.push({ servico: undefined, offline: false });
    avisar(`serviços: ${servicos.join(', ') || 'nenhum'}; padrão: ${padrao || '—'}; modos: ${lista.map(m => `${m.servico ?? 'sistema'}${m.offline ? ' (offline)' : ''}`).join(' → ')}`);
    return lista;
  }

  /**
   * Permissão pelo gravador (expo-audio), não pelo módulo de fala: no celular do dono o
   * `requestPermissionsAsync` do expo-speech-recognition simplesmente não responde ("erro ao
   * iniciar: sem resposta" a cada 30 s no log de 02/10). A permissão é a mesma (microfone).
   */
  async function temMicrofone(): Promise<boolean> {
    try {
      if ((await comPrazo(getRecordingPermissionsAsync(), 5000)).granted) return true;
      return (await requestRecordingPermissionsAsync()).granted;
    } catch { return false; }
  }

  function largarModo(motivo: string) {
    if (vigia.current) { clearTimeout(vigia.current); vigia.current = null; }
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* já parado */ }
    rodando.current = false;
    const m = config.current;
    degrau.current++;
    if (!config.current) { falhar(`o reconhecedor de voz do celular não respondeu em nenhum modo (${motivo})`); return; }
    avisar(`modo ${m?.servico ?? 'sistema'}${m?.offline ? ' offline' : ''} largado (${motivo}); tentando ${config.current.servico ?? 'o padrão do sistema'}${config.current.offline ? ' offline' : ''}`);
    recuo.current = 500;
    agendar();
  }

  async function comecar() {
    if (!ativoRef.current || rodando.current || parado.current) return;
    definirEstado({ fase: 'iniciando' });
    try {
      if (!(await temMicrofone())) { falhar('sem permissão de microfone'); return; }
      if (!modos.current) { modos.current = await descobrir(); degrau.current = 0; }
      const modo = config.current;
      if (!modo) { falhar('nenhum modo de reconhecimento'); return; }
      if (!ativoRef.current || parado.current) { definirEstado({ fase: 'desligada' }); return; }
      rodando.current = true;
      diag.current.sessoes++;
      contas.current.chamadas++;
      inicioSessao.current = Date.now();
      ouviuNaSessao.current = false;
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: true,
        maxAlternatives: 3,
        contextualStrings: ['Ely', 'ei Ely', 'oi Ely', 'Elysium'],
        requiresOnDeviceRecognition: modo.offline,
        androidRecognitionServicePackage: modo.servico,
      });
      // Sem confirmação (início, áudio ou resultado) em 4 s, este modo não serve aqui.
      if (vigia.current) clearTimeout(vigia.current);
      vigia.current = setTimeout(() => { vigia.current = null; if (rodando.current) largarModo('não confirmou o início em 4 s'); }, 4000);
    } catch (e) {
      rodando.current = false;
      avisar(`erro ao iniciar: ${e instanceof Error ? e.message : String(e)}`);
      recuo.current = Math.min(30_000, Math.max(2000, recuo.current * 2));
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
    if (vigia.current) { clearTimeout(vigia.current); vigia.current = null; }
    if (rodando.current) {
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* já parado */ }
      rodando.current = false;
    }
  }

  const confirmou = () => { if (vigia.current) { clearTimeout(vigia.current); vigia.current = null; } };
  useSpeechRecognitionEvent('audiostart', confirmou);
  useSpeechRecognitionEvent('speechstart', confirmou);
  useSpeechRecognitionEvent('start', () => {
    confirmou();
    contas.current.inicios++;
    if (!config.current) return;
    definirEstado({ fase: 'ouvindo', offline: config.current.offline, servico: config.current.servico ?? 'padrão' });
    avisar(`escutando (${config.current.servico ?? "sistema"}, ${config.current.offline ? "no aparelho" : "online"})`);
  });

  useSpeechRecognitionEvent('result', (ev) => {
    confirmou();
    if (estadoAtual.fase !== 'ouvindo' && config.current) definirEstado({ fase: 'ouvindo', offline: config.current.offline, servico: config.current.servico ?? 'padrão' });
    contas.current.resultados++;
    ouviuNaSessao.current = true;
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
    contas.current.fins++;
    // Sessão curta e muda: freia em vez de religar em meio segundo.
    if (Date.now() - inicioSessao.current < 3000 && !ouviuNaSessao.current) {
      contas.current.curtas++;
      recuo.current = Math.min(30_000, Math.max(2000, recuo.current * 2));
    }
    if (!parado.current && ativoRef.current) definirEstado({ fase: 'iniciando' });
    agendar();
  });

  useSpeechRecognitionEvent('error', (ev) => {
    rodando.current = false;
    diag.current.erros[ev.error] = (diag.current.erros[ev.error] ?? 0) + 1;
    // Serviço ou idioma recusado neste modo: o próximo da escada.
    if (ev.error === 'language-not-supported' || ev.error === 'service-not-allowed' || ev.error === 'client') {
      largarModo(`${ev.error}: ${ev.message}`);
      return;
    }
    if (ev.error === 'not-allowed') { falhar('permissão de microfone/fala negada'); return; }
    // "Ninguém falou" e "abortado" são rotina; o resto dobra o recuo.
    if (ev.error === 'no-speech' || ev.error === 'aborted' || ev.error === 'speech-timeout') { /* o 'end' decide o recuo */ }
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

  // Resumo a cada 30 s enquanto ativo, só quando algo mudou.
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => {
      const c = contas.current;
      const erros = Object.entries(diag.current.erros).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhum';
      const linha = `resumo: start() ${c.chamadas}, início ${c.inicios}, fim ${c.fins}, resultados ${c.resultados}, sessões curtas ${c.curtas}, erros: ${erros}, recuo ${Math.round(recuo.current / 1000)} s, estado ${estadoAtual.fase}`;
      if (linha !== ultimoResumo.current) { ultimoResumo.current = linha; aoDiagRef.current?.(linha); }
    }, 30_000);
    return () => clearInterval(id);
  }, [ativo]);

  // Desmontou (app fechado): solta o microfone.
  useEffect(() => () => parar(), []);
}
