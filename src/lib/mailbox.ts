import { baseUrl, Pairing } from './pairing';
import { AuthError, fetchWithTimeout, DEFAULT_TIMEOUT_MS } from './http';

export type MailboxAttachmentMeta = { name: string; mimeType: string; sizeBytes: number };
export type MailboxKind = 'link' | 'note' | 'file';
export type MailboxFrom = 'pc' | 'mobile';

export type MailboxMessage = {
  id: string;
  from: MailboxFrom;
  kind: MailboxKind;
  text: string | null;
  attachment: MailboxAttachmentMeta | null;
  createdAt: number;
  readAt: number | null;
  /** A qual conversa o recado pertence. Ausente so em cache gravado antes das sessoes. */
  sessionId?: string;
};

async function request<T>(
  pairing: Pairing,
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const res = await fetchWithTimeout(`${baseUrl(pairing)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pairing.token}`,
      ...(init?.headers ?? {}),
    },
  }, timeoutMs);

  if (res.status === 401 || res.status === 403) {
    throw new AuthError('token inválido ou expirado');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.error === 'string' ? body.error : JSON.stringify(body);
    } catch {
      // corpo de erro vazio ou não-JSON, segue sem detalhe
    }
    console.error(`[mailbox] ${init?.method ?? 'GET'} ${path} -> ${res.status}`, detail || '(sem corpo)');

    if (res.status === 413) {
      throw new Error(detail || 'anexo grande demais (máximo 5MB)');
    }
    throw new Error(detail ? `servidor respondeu ${res.status}: ${detail}` : `servidor respondeu ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Sem `sessionId` o PC devolve a thread inteira, como sempre devolveu — e por isso um
 * aparelho ainda nao atualizado continua funcionando contra um PC que ja tem sessoes.
 */
export async function listMessages(pairing: Pairing, sessionId?: string | null): Promise<MailboxMessage[]> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  const data = await request<{ items: MailboxMessage[] }>(pairing, `/api/mailbox/messages${qs}`);
  return data.items;
}

export async function sendMessage(
  pairing: Pairing,
  message: {
    kind: MailboxKind;
    text?: string;
    sessionId?: string | null;
    attachment?: { name: string; mimeType: string; base64: string };
  }
): Promise<{ id: string; createdAt: number; sessionId?: string }> {
  // Anexo de 5 MB vira ~6,7 MB em base64; num Wi-Fi ruim isso não cabe no timeout padrão.
  const timeoutMs = message.attachment ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  return request(pairing, '/api/mailbox/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  }, timeoutMs);
}

export async function ackMessage(pairing: Pairing, id: string): Promise<void> {
  await request(pairing, `/api/mailbox/messages/${id}/ack`, { method: 'POST', body: '{}' });
}

export async function fetchMessageContent(
  pairing: Pairing,
  id: string
): Promise<{ id: string; kind: MailboxKind; text: string | null; attachment: (MailboxAttachmentMeta & { base64: string }) | null }> {
  return request(pairing, `/api/mailbox/messages/${id}/content`, undefined, UPLOAD_TIMEOUT_MS);
}

export const MAILBOX_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Transferência de anexo, nas duas direções. */
const UPLOAD_TIMEOUT_MS = 60000;
