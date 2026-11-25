import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { idDoPc, type Pairing } from './pairing';
import { ligarNotifFrame } from './notifFrame';
import { callRpc } from './rpc';

/**
 * A Ely lê as notificações (25/11, APK 2.14.0). Quem escuta e entrega é o nativo
 * (modules/notificacoes), mesmo com o app fechado; aqui ficam a ligação com o PC e os ajustes.
 */
export type EstadoDaEscuta = { ligado: boolean; ativo: boolean; naFila: number; apps: string[]; vistos: { pacote: string; nome: string }[] };
type Nativo = {
  temAcesso(): boolean;
  abrirAcesso(): boolean;
  abrirDetalhes(): boolean;
  configurar(ligado: boolean, apps: string[] | null, idDaChave: string | null, chave: string | null, enderecos: string[] | null): void;
  estado(): EstadoDaEscuta;
  enviarAgora(): void;
  responder(chave: string, texto: string): boolean;
};
const nativo = requireOptionalNativeModule<Nativo>('Notificacoes');
export const LE_NOTIFICACOES = !!nativo;

const CHAVE_PC = 'elysium.notificacoesPc';
const VAZIO: EstadoDaEscuta = { ligado: false, ativo: false, naFila: 0, apps: [], vistos: [] };
let atual: EstadoDaEscuta & { acesso: boolean } = { ...VAZIO, acesso: false };
const ouvintes = new Set<() => void>();
export function atualizarEscuta(): void {
  try { atual = nativo ? { ...nativo.estado(), acesso: nativo.temAcesso() } : { ...VAZIO, acesso: false }; } catch { /* fica o de antes */ }
  ouvintes.forEach((f) => f());
}
export function useEscuta() {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => atual);
}

/** Os endereços em que o nativo tenta entregar, o que respondeu por último na frente. Pura. */
export function enderecosDe(p: Pick<Pairing, 'activeIp' | 'endpoints' | 'port'>): string[] {
  return [...new Set([p.activeIp, ...p.endpoints])].filter(Boolean).slice(0, 6).map((ip) => `http://${ip}:${p.port}`);
}

export async function ligarEscuta(pairing: Pairing): Promise<void> {
  const { id, chave } = await callRpc(pairing, 'notif.chave');
  nativo?.configurar(true, null, id, chave, enderecosDe(pairing));
  await AsyncStorage.setItem(CHAVE_PC, idDoPc(pairing));
  atualizarEscuta();
}
export function desligarEscuta(): void {
  nativo?.configurar(false, null, null, null, null);
  atualizarEscuta();
}
export function escolherApps(apps: string[]): void {
  nativo?.configurar(atual.ligado, apps, null, null, null);
  atualizarEscuta();
}
/** O PC mudou de endereço (ou o app abriu): o nativo fica com a lista nova e tenta entregar a fila. */
export function enderecoMudou(pairing: Pairing): void {
  if (!nativo) return;
  atualizarEscuta();
  if (!atual.ligado) return;
  // A chave é de um PC só: com outro pareado, as notificações continuam indo ao que as recebe.
  AsyncStorage.getItem(CHAVE_PC).then((id) => { if (id === idDoPc(pairing)) nativo?.configurar(true, null, null, null, enderecosDe(pairing)); }).catch(() => {});
}
export function abrirAcessoDeNotificacoes(): void { nativo?.abrirAcesso(); }
export function abrirDetalhesDoApp(): void { nativo?.abrirDetalhes(); }

/** O PC mandou responder uma notificação (já confirmado por ele). */
function responderNotificacao(frame: { id?: unknown; chave?: unknown; texto?: unknown }, pairing: Pairing): void {
  if (typeof frame.id !== 'string' || typeof frame.chave !== 'string' || typeof frame.texto !== 'string') return;
  let ok = false;
  try { ok = nativo?.responder(frame.chave, frame.texto) ?? false; } catch { ok = false; }
  callRpc(pairing, 'notif.respondida', { id: frame.id, ok }).catch(() => {});
}
ligarNotifFrame(responderNotificacao);
