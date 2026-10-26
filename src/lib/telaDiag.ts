import { callRpc } from './rpc';
import type { Pairing } from './pairing';

/**
 * Diagnóstico das telas inteligentes no aparelho (24/10). No celular de verdade a tela não
 * aparecia e daqui não dá para ver nada: cada passo vira uma linha curta no log do PC
 * (`diag.registrar`, origem "tela") — frame recebido, HTML do renderer lido, WebView carregou ou
 * caiu, "pronta", 1ª altura, erro. Sem conteúdo da conversa: só tipos, tamanhos, tempos e mensagens
 * de erro técnicas. Junta as linhas e manda de uma vez a cada 2 s.
 */

let origemPairing: (() => Pairing | null) | null = null;
let fila: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const t0 = Date.now();

/** O ChatScreen liga com o pareamento atual (sem ele as linhas são descartadas). */
export function ligarDiagTela(pairing: () => Pairing | null): void {
  origemPairing = pairing;
}

export function diagTela(linha: string): void {
  fila.push(`+${Math.round((Date.now() - t0) / 1000)}s ${linha}`.slice(0, 280));
  if (fila.length > 40) fila = fila.slice(-40);
  if (timer) return;
  timer = setTimeout(enviar, 2000);
}

function enviar() {
  timer = null;
  const p = origemPairing?.();
  const linhas = fila.splice(0, 20);
  if (!p || !linhas.length) return;
  // 26/10: sem o PC (as transições da conexão são justamente isso), as linhas voltam para a fila.
  callRpc(p, 'diag.registrar', { origem: 'tela', linhas }).catch(() => { fila = [...linhas, ...fila].slice(-40); });
  if (fila.length) timer = setTimeout(enviar, 2000);
}

/** Erro como texto curto, para a linha. */
export function erroCurto(e: unknown): string {
  return (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, ' ').slice(0, 160);
}
