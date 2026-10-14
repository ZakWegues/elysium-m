/**
 * Seções recolhíveis do Hoje (fase 22). Pura — testada em tests/secoesHoje.test.ts.
 *
 * Doze seções abertas de uma vez faziam o Hoje parecer um relatório. Agora só as quatro de
 * uso diário abrem por padrão; as outras ficam recolhidas com um contador no título, e o que
 * a pessoa abrir ou fechar fica salvo.
 */

export const CHAVE_SECOES_HOJE = 'hoje.secoes';

/** Abertas por padrão: Amanhã, Lembretes/Tarefas, Agenda e Hábitos. */
export const ABERTAS_PADRAO: readonly string[] = ['amanha', 'lembretes-e-tarefas', 'agenda', 'habitos-de-hoje'];

export type EstadoSecoes = Record<string, boolean>;

export function estaAberta(chave: string, salvo: EstadoSecoes): boolean {
  return salvo[chave] ?? ABERTAS_PADRAO.includes(chave);
}

/** Alterna uma seção, devolvendo um estado novo (o anterior não muda). */
export function alternarSecao(salvo: EstadoSecoes, chave: string): EstadoSecoes {
  return { ...salvo, [chave]: !estaAberta(chave, salvo) };
}

/** Lê o que foi salvo; qualquer coisa estranha vira "nada salvo" (valem os padrões). */
export function lerSecoes(json: string | null): EstadoSecoes {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const limpo: EstadoSecoes = {};
    for (const [k, b] of Object.entries(v)) if (typeof b === 'boolean') limpo[k] = b;
    return limpo;
  } catch {
    return {};
  }
}

/** O título com o contador ("METAS · 3"); sem contador ou zero, só o título. */
export function tituloComContador(titulo: string, contador?: number | string | null): string {
  if (contador === undefined || contador === null || contador === 0 || contador === '') return titulo;
  return `${titulo} · ${contador}`;
}
