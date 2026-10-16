import { baseUrl, Pairing } from './pairing';
import {
  AuthError, fetchWithTimeout, COMMAND_TIMEOUT_MS,
} from './http';

// Reexportado porque várias telas já importam AuthError daqui; a definição vive
// em http.ts para não criar ciclo com pairing.ts.
export { AuthError } from './http';


export async function sendCommand(pairing: Pairing, text: string, canal: 'voz' | 'texto' = 'voz'): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl(pairing)}/api/command`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pairing.token}`,
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
