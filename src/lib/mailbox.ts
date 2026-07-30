import { AuthError } from './api';
import { baseUrl, Pairing } from './pairing';

export type MailboxAttachmentMeta = { name: string; mimeType: string; sizeBytes: number };
export type MailboxKind = 'link' | 'note' | 'file';

export type MailboxItem = {
  id: string;
  kind: MailboxKind;
  text: string | null;
  attachment: MailboxAttachmentMeta | null;
  createdAt: number;
  deliveredAt?: number | null;
  readAt?: number | null;
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
  if (res.status === 413) {
    throw new Error('anexo grande demais (máximo 5MB)');
  }
  if (!res.ok) {
    throw new Error(`servidor respondeu ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listOutbox(pairing: Pairing): Promise<MailboxItem[]> {
  const data = await request<{ items: MailboxItem[] }>(pairing, '/api/mailbox/outbox');
  return data.items;
}

export async function listInbox(pairing: Pairing): Promise<MailboxItem[]> {
  const data = await request<{ items: MailboxItem[] }>(pairing, '/api/mailbox/inbox');
  return data.items;
}

export async function sendToDesktop(
  pairing: Pairing,
  item: {
    kind: MailboxKind;
    text?: string;
    attachment?: { name: string; mimeType: string; base64: string };
  }
): Promise<{ id: string; createdAt: number }> {
  return request(pairing, '/api/mailbox/outbox', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function ackInboxItem(pairing: Pairing, id: string): Promise<void> {
  await request(pairing, `/api/mailbox/inbox/${id}/ack`, { method: 'POST', body: '{}' });
}

export async function fetchInboxContent(
  pairing: Pairing,
  id: string
): Promise<{ id: string; kind: MailboxKind; text: string | null; attachment: (MailboxAttachmentMeta & { base64: string }) | null }> {
  return request(pairing, `/api/mailbox/inbox/${id}/content`);
}

export const MAILBOX_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
