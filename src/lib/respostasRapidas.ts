/**
 * Respostas rápidas (22/10) — os botões embaixo da última resposta da Ely. O PC decide o que
 * oferecer (Sim/Não, as opções que ela deu, as respostas prontas dos Ajustes) e manda no
 * `reply`; aqui só a validação do que chegou e a ordem dos botões. Puro.
 */

export type Rapidas = { pergunta: boolean; sim: boolean; nao: boolean; opcoes: string[]; prontas: string[] };

export type BotaoRapido = { rotulo: string; valor: string; tipo: 'forte' | 'pronta' | 'sugestao' | 'outra' };

function textos(x: unknown, max: number): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.trim().slice(0, 80)).slice(0, max) : [];
}

/** O campo `rapidas` do reply, validado. PC antigo não manda: undefined. */
export function lerRapidas(x: unknown): Rapidas | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const r = x as Record<string, unknown>;
  return { pergunta: r.pergunta === true, sim: r.sim === true, nao: r.nao === true, opcoes: textos(r.opcoes, 4), prontas: textos(r.prontas, 6) };
}

/**
 * Uma linha só: se ela perguntou, Sim/Não/opções + prontas + "Outra resposta…"; senão as
 * sugestões de continuação + prontas.
 */
export function botoesDasRapidas(r: Rapidas | undefined, sugestoes: string[] = []): BotaoRapido[] {
  const out: BotaoRapido[] = [];
  if (r?.pergunta) {
    if (r.sim) out.push({ rotulo: 'Sim', valor: 'sim', tipo: 'forte' });
    if (r.nao) out.push({ rotulo: 'Não', valor: 'não', tipo: 'forte' });
    for (const o of r.opcoes) out.push({ rotulo: o, valor: o, tipo: 'forte' });
  } else {
    for (const s of sugestoes) out.push({ rotulo: s, valor: s, tipo: 'sugestao' });
  }
  for (const p of r?.prontas ?? []) out.push({ rotulo: p, valor: p, tipo: 'pronta' });
  if (r?.pergunta) out.push({ rotulo: 'Outra resposta…', valor: '', tipo: 'outra' });
  return out;
}
