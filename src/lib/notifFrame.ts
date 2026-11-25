import type { Pairing } from './pairing';

/** O pedido do PC para responder uma notificação (25/11): o stream entrega aqui sem conhecer o nativo. */
type Tratador = (frame: Record<string, unknown>, pairing: Pairing) => void;
let tratar: Tratador | null = null;
export function ligarNotifFrame(f: Tratador): void { tratar = f; }
export function receberNotifFrame(frame: Record<string, unknown>, pairing: Pairing): void { tratar?.(frame, pairing); }
