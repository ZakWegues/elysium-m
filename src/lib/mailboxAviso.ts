/**
 * Recado/arquivo novo do PC (21/10): o frame `mailbox_new` chega pelo WebSocket do chat e a
 * Caixa recarrega na hora, em vez de esperar o polling de 15 s. Um ouvinte por tela aberta.
 */
type Ouvinte = (id: string) => void;
const ouvintes = new Set<Ouvinte>();

export function receberMailboxNovo(id: string): void {
  for (const o of ouvintes) { try { o(id); } catch { /* tela fechando */ } }
}

export function aoChegarRecado(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}
