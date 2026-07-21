import { baseUrl, Pairing } from './pairing';

export async function checkHealth(pairing: Pairing): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(pairing)}/api/health`, {
      headers: { Authorization: `Bearer ${pairing.token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
