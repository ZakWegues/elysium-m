import { AuthError } from './api';
import { baseUrl, Pairing } from './pairing';

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
};

async function request<T>(pairing: Pairing, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl(pairing)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pairing.token}`,
      ...(init?.headers ?? {}),
    },
  });

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

export async function listMessages(pairing: Pairing): Promise<MailboxMessage[]> {
  const data = await request<{ items: MailboxMessage[] }>(pairing, '/api/mailbox/messages');
  return data.items;
}

export async function sendMessage(
  pairing: Pairing,
  message: {
    kind: MailboxKind;
    text?: string;
    attachment?: { name: string; mimeType: string; base64: string };
  }
): Promise<{ id: string; createdAt: number }> {
  return request(pairing, '/api/mailbox/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  });
}

export async function ackMessage(pairing: Pairing, id: string): Promise<void> {
  await request(pairing, `/api/mailbox/messages/${id}/ack`, { method: 'POST', body: '{}' });
}

export async function fetchMessageContent(
  pairing: Pairing,
  id: string
): Promise<{ id: string; kind: MailboxKind; text: string | null; attachment: (MailboxAttachmentMeta & { base64: string }) | null }> {
  return request(pairing, `/api/mailbox/messages/${id}/content`);
}

export const MAILBOX_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
