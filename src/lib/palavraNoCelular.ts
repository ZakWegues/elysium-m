import { useEffect, useRef } from 'react';
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
 * "bip" que o Android toca a cada início e fim de sessão). No aparelho quando o pt-BR
 * estiver baixado para uso offline; senão o reconhecimento normal do Google. O texto vai
 * para `acharPalavra`, e ao achar a palavra o reconhecedor é abortado ANTES de chamar
 * quem vai gravar — o microfone é um só (ver `microfone.ts`).
 *
 * O reconhecedor fecha a sessão sozinho de tempos em tempos (silêncio longo, erro de rede,
 * "busy"). Enquanto estiver ativo, ele é religado com recuo: 0,5 s, e dobrando até 30 s
 * quando os erros se repetem — sem isso um erro fixo viraria um laço de bipes.
 */

const CHAVE = 'elysium_palavra_no_celular_v1';

export async function palavraLigada(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(CHAVE)) !== '0'; } catch { return true; }
}

export async function ligarPalavra(ligar: boolean): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE, ligar ? '1' : '0'); } catch { /* fica o padrão */ }
}

/** Números da sessão para a calibragem (vão ao log do PC). */
export type DiagPalavra = { sessoes: number; disparos: number; erros: Record<string, number> };

export function usePalavraNoCelular({
  ativo,
  aoOuvir,
  aoDesligar,
}: {
  ativo: boolean;
  /** Chamado com o que veio depois da palavra ('' = só "Elysium"). */
  aoOuvir: (resto: string) => void;
  /** Quando o hook para de escutar, com os números desta escuta. */
  aoDesligar?: (d: DiagPalavra) => void;
}) {
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;
  const aoOuvirRef = useRef(aoOuvir);
  aoOuvirRef.current = aoOuvir;
  const rodando = useRef(false);
  const recuo = useRef(500);
  const religar = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Depois de um disparo, não religa até o `ativo` cair e voltar (a mão livre assumiu). */
  const disparou = useRef(false);
  const offline = useRef<boolean | null>(null);
  const diag = useRef<DiagPalavra>({ sessoes: 0, disparos: 0, erros: {} });

  async function comecar() {
    if (!ativoRef.current || rodando.current || disparou.current) return;
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return;
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return;
      if (offline.current === null) {
        try {
          const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
          offline.current = installedLocales.some(l => /^pt[-_]BR$/i.test(l));
        } catch { offline.current = false; }
      }
      if (!ativoRef.current || disparou.current) return;
      rodando.current = true;
      diag.current.sessoes++;
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: true,
        maxAlternatives: 3,
        contextualStrings: ['Elysium', 'ok Elysium', 'ei Elysium'],
        requiresOnDeviceRecognition: offline.current === true,
      });
    } catch {
      rodando.current = false;
      agendar();
    }
  }

  function agendar() {
    if (religar.current) clearTimeout(religar.current);
    if (!ativoRef.current || disparou.current) return;
    religar.current = setTimeout(() => { religar.current = null; comecar(); }, recuo.current);
  }

  function parar() {
    if (religar.current) { clearTimeout(religar.current); religar.current = null; }
    if (rodando.current) {
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* já parado */ }
      rodando.current = false;
    }
  }

  useSpeechRecognitionEvent('result', (ev) => {
    if (!ativoRef.current || disparou.current) return;
    // Qualquer alternativa serve: a primeira costuma ser "elísio" e a segunda "Elysium".
    for (const r of ev.results) {
      const { achou, resto } = acharPalavra(r.transcript);
      if (!achou) continue;
      // Com o "Elysium" sozinho num parcial, espera o final: o pedido pode vir colado.
      if (!ev.isFinal && !resto) return;
      if (!ev.isFinal && resto.split(' ').length < 2) return;
      disparou.current = true;
      diag.current.disparos++;
      recuo.current = 500;
      parar();
      aoOuvirRef.current(ev.isFinal ? resto : '');
      return;
    }
  });

  useSpeechRecognitionEvent('end', () => {
    rodando.current = false;
    agendar();
  });

  useSpeechRecognitionEvent('error', (ev) => {
    rodando.current = false;
    diag.current.erros[ev.error] = (diag.current.erros[ev.error] ?? 0) + 1;
    // Sem permissão ou sem serviço de fala no aparelho: não adianta insistir.
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'language-not-supported') {
      disparou.current = true;
      return;
    }
    // "Ninguém falou" e "abortado" são rotina; o resto dobra o recuo.
    if (ev.error === 'no-speech' || ev.error === 'aborted' || ev.error === 'speech-timeout') recuo.current = 500;
    else recuo.current = Math.min(30_000, recuo.current * 2);
  });

  useEffect(() => {
    if (ativo) {
      disparou.current = false;
      diag.current = { sessoes: 0, disparos: 0, erros: {} };
      comecar();
    } else {
      parar();
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
