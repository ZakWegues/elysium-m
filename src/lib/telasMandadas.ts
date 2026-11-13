/**
 * Telas mandadas do PC (12/11, pedido do dono): "Mandar pro celular" no PC avisava "está no Hoje →
 * Telas salvas", mas o cartão do Hoje só lia a lista ao montar — a tela nova não aparecia até
 * reiniciar o app, e tocar no aviso não abria nada. Agora:
 *
 * - tocar no aviso (ref `tela:<id>`) abre a tela direto, de qualquer aba;
 * - chegando com o app aberto, ela já abre na frente;
 * - o cartão das Telas salvas relê a lista quando uma tela chega ou é salva.
 *
 * Um avisador simples, sem React, para a notificação, o stream e as telas conversarem.
 */

type Ouvinte<T> = (v: T) => void;

const aoAbrir = new Set<Ouvinte<string>>();
const aoMudar = new Set<Ouvinte<void>>();

/** O id da tela salva no `ref` de uma entrega (`tela:<id>`), ou null. Pura. */
export function idDaTelaMandada(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const m = /^tela:([A-Za-z0-9_-]{1,80})$/.exec(ref);
  return m ? m[1] : null;
}

/** Pede para abrir a tela salva (quem mostra é o App). */
export function abrirTelaMandada(id: string): void {
  for (const f of aoAbrir) f(id);
}
export function aoAbrirTelaMandada(fn: Ouvinte<string>): () => void {
  aoAbrir.add(fn);
  return () => { aoAbrir.delete(fn); };
}

/** A lista das Telas salvas mudou (chegou uma do PC, salvou uma aqui). */
export function telasSalvasMudaram(): void {
  for (const f of aoMudar) f();
}
export function aoMudarTelasSalvas(fn: Ouvinte<void>): () => void {
  aoMudar.add(fn);
  return () => { aoMudar.delete(fn); };
}
