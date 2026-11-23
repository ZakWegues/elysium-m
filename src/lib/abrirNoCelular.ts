import { AppState, Linking, ToastAndroid } from 'react-native';

/**
 * Abrir um app, um site ou uma música neste celular a pedido da Ely (23/11): "abre o YouTube",
 * "toca Angel no meu celular". O alvo vem na resposta (o pedido saiu daqui) ou numa entrega com
 * `ref abrir:…` (o pedido saiu do PC). O Android só deixa abrir outro app com este na frente: no
 * fundo, vira notificação, e o toque abre.
 */
export type AlvoNoCelular = { rotulo: string; url?: string; reserva?: string; pacote?: string; acao?: string };

const URL_OK = /^(https:\/\/[^\s]+|spotify:(track|search|album|artist|playlist):[^\s]+)$/i;
const PACOTE_OK = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const ACOES = new Set([
  'android.media.action.STILL_IMAGE_CAMERA', 'android.settings.SETTINGS', 'android.settings.WIFI_SETTINGS',
  'android.settings.BLUETOOTH_SETTINGS', 'android.intent.action.SHOW_ALARMS', 'android.intent.action.DIAL',
]);

/** O alvo conferido: só https, Spotify, pacote com cara de pacote e telas conhecidas. Pura. */
export function lerAlvo(v: unknown): AlvoNoCelular | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  const texto = (c: string, re: RegExp) => (typeof x[c] === 'string' && re.test(x[c] as string) ? (x[c] as string) : undefined);
  const alvo: AlvoNoCelular = {
    rotulo: typeof x.rotulo === 'string' ? x.rotulo.slice(0, 80) : 'app',
    url: texto('url', URL_OK), reserva: texto('reserva', URL_OK), pacote: texto('pacote', PACOTE_OK),
    acao: typeof x.acao === 'string' && ACOES.has(x.acao) ? x.acao : undefined,
  };
  return alvo.url || alvo.pacote || alvo.acao || alvo.reserva ? alvo : null;
}

/** O alvo dentro do `ref` de uma entrega (`abrir:<base64url do JSON>`). Pura. */
export function alvoDoRef(ref: unknown): AlvoNoCelular | null {
  if (typeof ref !== 'string') return null;
  const m = /^abrir:([A-Za-z0-9_-]{4,2000})$/.exec(ref);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(m[1].length / 4) * 4, '='));
    const utf8 = decodeURIComponent(Array.from(bin, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return lerAlvo(JSON.parse(utf8));
  } catch { return null; }
}

async function tentar(a: AlvoNoCelular): Promise<boolean> {
  if (a.acao || a.pacote) {
    try {
      const IL = await import('expo-intent-launcher');
      if (a.acao) await IL.startActivityAsync(a.acao);
      else IL.openApplication(a.pacote!);
      return true;
    } catch { /* não instalado: vai pelo endereço */ }
  }
  for (const u of [a.url, a.reserva]) {
    if (!u) continue;
    try { await Linking.openURL(u); return true; } catch { /* a próxima */ }
  }
  return false;
}

export async function abrirAlvo(a: AlvoNoCelular): Promise<void> {
  if (!(await tentar(a))) ToastAndroid.show(`Não consegui abrir ${a.rotulo}.`, ToastAndroid.SHORT);
}

/** O mesmo alvo chega por até três caminhos (WS, fila, push): abre uma vez só. */
let ultimo = { ref: '', em: 0 };
export function abrirUmaVez(ref: string, a: AlvoNoCelular): void {
  if (ultimo.ref === ref && Date.now() - ultimo.em < 5 * 60_000) return;
  ultimo = { ref, em: Date.now() };
  void abrirAlvo(a);
}

/** Uma entrega de abrir: "aberta" (o app está na frente), "avisar" (no fundo) ou "velha". */
export function tratarEntregaDeAbrir(ref: string | undefined, em: number): 'aberta' | 'avisar' | 'velha' | null {
  const a = alvoDoRef(ref);
  if (!a || !ref) return null;
  if (Date.now() - em > 5 * 60_000 || (ultimo.ref === ref && Date.now() - ultimo.em < 5 * 60_000)) return 'velha';
  if (AppState.currentState !== 'active') return 'avisar';
  abrirUmaVez(ref, a);
  return 'aberta';
}

/** O alvo que veio junto de uma resposta. Quem avisa no fundo é passado por quem chama. */
export function abrirDaResposta(v: unknown, avisar: (titulo: string, ref: string) => void): void {
  const a = lerAlvo(v);
  if (!a) return;
  if (AppState.currentState === 'active') { void abrirAlvo(a); return; }
  const b64 = btoa(encodeURIComponent(JSON.stringify(a)).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  avisar(`Abrir ${a.rotulo}`, `abrir:${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`);
}
