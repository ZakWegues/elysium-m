import { baseUrl, Pairing } from './pairing';
import { cabecalhoAssinado } from './assinatura';
import {
  AuthError, fetchWithTimeout, COMMAND_TIMEOUT_MS,
} from './http';

// Reexportado porque várias telas já importam AuthError daqui; a definição vive
// em http.ts para não criar ciclo com pairing.ts.
export { AuthError } from './http';


export async function sendCommand(pairing: Pairing, text: string, canal: 'voz' | 'texto' = 'voz'): Promise<string> {
  const url = `${baseUrl(pairing)}/api/command`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...cabecalhoAssinado(pairing.token, 'POST', url),
      },
      body: JSON.stringify({ text, canal }),
    },
    COMMAND_TIMEOUT_MS
  );
  if (res.status === 401 || res.status === 403) {
    throw new AuthError('token inválido ou expirado');
  }
  if (!res.ok) {
    throw new Error(`servidor respondeu ${res.status}`);
  }
  const data = await res.json();
  return data.reply as string;
}

/**
 * Fotos e rotas pedidas por uma tela inteligente (22/10): a tela não sai para a internet; o PC
 * busca (hosts fixos, cache). Devolve o que a tela espera — `{dados}` ou `{erro}` — e nunca joga.
 */
export async function pedidoDaTela(pairing: Pairing, rota: 'fotos' | 'rota', params: Record<string, string>): Promise<{ dados?: unknown; erro?: string }> {
  const caminho = rota === 'fotos'
    ? `/api/ui/foto?q=${encodeURIComponent(params.q ?? '')}`
    : `/api/ui/rota?coords=${encodeURIComponent(params.coords ?? '')}`;
  try {
    const url = `${baseUrl(pairing)}${caminho}`;
    const res = await fetchWithTimeout(url, { headers: cabecalhoAssinado(pairing.token, 'GET', url) }, 9000);
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok || !data) return { erro: String(data?.error ?? `PC respondeu ${res.status}`).slice(0, 200) };
    return { dados: data };
  } catch (err) {
    return { erro: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }
}
