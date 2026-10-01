/**
 * De qual PC são os dados guardados no celular (fase 13, bloco 121 — vários PCs).
 *
 * Conversas, recados, fila offline e notificações vistas são de UM PC. Sem separar, trocar
 * de PC faria a sincronização empurrar as conversas do PC A para o PC B. O PC principal
 * (o que já estava pareado antes desta versão) continua nas chaves de sempre — nada é
 * migrado nem renomeado, que é a regra do AsyncStorage (§18). Os outros usam as mesmas
 * chaves com o sufixo do PC.
 *
 * Quem define o PC ativo é o `loadPairing()` — chamado pelo app, pela tarefa de segundo
 * plano e pelo widget —, então os três contextos enxergam a mesma chave.
 */

let sufixo = '';

export function definirPcAtivo(id: string, principal: boolean): void {
  sufixo = principal ? '' : `__${id.replace(/[^a-z0-9.-]/gi, '_')}`;
}

/** A chave do AsyncStorage para o PC ativo. */
export function chavePorPc(base: string): string {
  return base + sufixo;
}
