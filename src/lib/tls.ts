import { hmacSha256, utf8 } from './assinatura';
import { diagTela } from './telaDiag';

/**
 * TLS com o PC (31/10, APK 2.6.0).
 *
 * O PC tem um certificado próprio (não é de autoridade nenhuma). O app confia nele por FIXAÇÃO:
 * pede `tls.info` num pedido assinado, confere a assinatura da impressão com o token (quem está no
 * meio do Wi-Fi não tem o token, então não consegue trocar a impressão), e entrega a impressão ao
 * módulo nativo `confianca`, que passa a aceitar SÓ esse certificado. Daí em diante `baseUrl`
 * aponta para https na porta TLS — e o WebSocket vira wss junto.
 *
 * Sem o módulo (APK antigo, prévia web) ou com o PC antigo: tudo segue em http, assinado.
 * Se o https falhar nesta sessão (porta bloqueada, certificado trocado), volta para http e
 * pede a impressão de novo na próxima sonda.
 */

type ModuloConfianca = { fixar(sha256: string): void; fixados(): string[]; tomada?(host: string, porta: number): number };

let modulo: ModuloConfianca | null | undefined;

function nativo(): ModuloConfianca | null {
  if (modulo !== undefined) return modulo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    modulo = requireOptionalNativeModule<ModuloConfianca>('Confianca');
  } catch {
    modulo = null;
  }
  return modulo;
}

export type InfoTls = { porta: number; sha256: string };

/** O https caiu nesta sessão: fica em http até a próxima sonda refazer a fixação. */
let semTlsNestaSessao = false;
let avisouTls = false;

export function tlsUtil(tls: InfoTls | undefined): boolean {
  return !!tls && !semTlsNestaSessao && nativo() !== null;
}

export function desligarTlsNestaSessao(): void {
  if (!semTlsNestaSessao) diagTela('tls: o https não passou; em http assinado até a próxima sonda');
  semTlsNestaSessao = true;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * 25/11: por onde os arquivos vão ao PC. O `expo-file-system` não conhece o certificado fixado; em TLS
 * ele usa a porta local do módulo, que repassa tudo cifrado (a assinatura é do caminho, não do endereço).
 */
export function baseDeArquivo(base: string): string {
  const m = /^https:\/\/([\w.-]+):(\d+)$/.exec(base);
  if (!m) return base;
  const porta = nativo()?.tomada?.(m[1], Number(m[2]));
  if (!porta) throw new Error('Não consegui abrir o envio seguro. Tente de novo.');
  return `http://127.0.0.1:${porta}`;
}

/** A assinatura que o PC manda com a impressão (o mesmo cálculo do `assinarImpressao`). Puro. */
export function assinaturaEsperada(token: string, sha256: string, porta: number): string {
  return hex(hmacSha256(utf8(token), utf8(`tls:${porta}:${sha256}`)));
}

/** Comparação sem atalho (tempo igual para qualquer diferença). */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Confere e fixa. Devolve a info para guardar no pareamento, ou null (sem módulo, PC sem TLS,
 * assinatura que não bate — esta última nunca deveria acontecer e significa alguém no meio).
 */
export function fixarSeValido(token: string, tls: { porta?: unknown; sha256?: unknown; assinatura?: unknown } | null | undefined): InfoTls | null {
  const m = nativo();
  if (!m || !tls) return null;
  const { porta, sha256, assinatura } = tls;
  if (typeof porta !== 'number' || typeof sha256 !== 'string' || typeof assinatura !== 'string') return null;
  if (!/^[0-9a-f]{64}$/.test(sha256) || porta < 1 || porta > 65535) return null;
  if (!iguais(assinaturaEsperada(token, sha256, porta), assinatura)) {
    console.warn('[tls] impressão com assinatura errada — ignorada');
    return null;
  }
  try { m.fixar(sha256); } catch { return null; }
  if (semTlsNestaSessao || !avisouTls) { avisouTls = true; diagTela(`tls: ligado (porta ${porta})`); }
  semTlsNestaSessao = false;
  return { porta, sha256 };
}

/** Na abertura: o módulo já carrega as fixadas do disco, mas garante a do PC ativo. */
export function garantirFixada(tls: InfoTls | undefined): void {
  const m = nativo();
  if (!m || !tls) return;
  try { if (!m.fixados().includes(tls.sha256)) m.fixar(tls.sha256); } catch { /* segue em http */ }
}
