import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A chave do widget "Falar com a Ely" (fase 20, bloco 201).
 *
 * `elysium://falar` abria o Chat JÁ GRAVANDO — e qualquer página da web pode abrir um
 * `elysium://`. Um site abrindo o microfone sozinho e mandando o áudio ao PC é exatamente o
 * que não pode acontecer. Agora o widget leva uma chave aleatória (`?k=…`) que só o app conhece;
 * sem ela, o link só abre o Chat (um toque no microfone começa a ouvir).
 */
const CHAVE = 'elysium_chave_widget_v1';
let emMemoria: string | null = null;

function nova(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

let pendente: Promise<string> | null = null;

export function chaveDoWidget(): Promise<string> {
  if (emMemoria) return Promise.resolve(emMemoria);
  // Duas chamadas juntas na primeira vez gerariam duas chaves (a última gravada venceria e o
  // widget desenhado com a outra pararia de funcionar): todas esperam a mesma promessa.
  pendente ??= gerarOuLer().finally(() => { pendente = null; });
  return pendente;
}

async function gerarOuLer(): Promise<string> {
  try {
    const guardada = await AsyncStorage.getItem(CHAVE);
    if (guardada && /^[0-9a-f]{32}$/.test(guardada)) { emMemoria = guardada; return guardada; }
    const c = nova();
    await AsyncStorage.setItem(CHAVE, c);
    emMemoria = c;
    return c;
  } catch {
    return '';
  }
}

/** A chave que veio na URL (`elysium://falar?k=…`), ou ''. Pura. */
export function chaveDaUrl(url: string): string {
  const m = /[?&]k=([0-9a-f]{32})\b/.exec(url);
  return m ? m[1] : '';
}

/** A URL veio do nosso widget? */
export async function urlDoWidget(url: string): Promise<boolean> {
  const k = chaveDaUrl(url);
  return !!k && k === (await chaveDoWidget());
}
