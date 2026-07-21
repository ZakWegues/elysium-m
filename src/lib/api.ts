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

export async function sendCommand(pairing: Pairing, text: string): Promise<string> {
  const res = await fetch(`${baseUrl(pairing)}/api/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pairing.token}`,
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`servidor respondeu ${res.status}`);
  }
  const data = await res.json();
  return data.reply as string;
}
