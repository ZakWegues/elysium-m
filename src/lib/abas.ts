/**
 * Abas vivas (08/10). Pura — testada em tests/abas.test.ts.
 *
 * Antes cada troca de aba DESMONTAVA a tela de onde se saía (`{screen === 'x' && <Tela/>}`):
 * voltar ao Hoje refazia o carregamento do zero, a rolagem voltava ao topo, e a fala que a
 * tela tinha começado era cortada junto. Agora cada aba monta na primeira visita e fica
 * montada, só escondida. As três de uso diário montam logo depois do primeiro quadro, para a
 * primeira visita também ser instantânea; o PC espera a primeira visita (tem espelho e
 * trackpad — não faz sentido pagar por eles sem ninguém olhar). Fase 22: Rotinas deixou de ser
 * aba (virou gaveta dentro do Hoje).
 *
 * Conversas não fica viva: é uma lista que sai de dentro do Chat e deve sempre abrir fresca.
 */
export type Aba = 'home' | 'chat' | 'hoje' | 'control' | 'conversations';

export const ABAS_PRE_CARREGADAS: readonly Aba[] = ['home', 'hoje', 'chat'];
const SOB_DEMANDA: readonly Aba[] = ['conversations'];

/** Quais abas ficam montadas, dado o que já estava montado e a aba atual. */
export function abasMontadas(antes: ReadonlySet<Aba>, atual: Aba, preCarregar = false): Set<Aba> {
  const novas = new Set<Aba>([...antes].filter(a => !SOB_DEMANDA.includes(a) || a === atual));
  novas.add(atual);
  if (preCarregar) ABAS_PRE_CARREGADAS.forEach(a => novas.add(a));
  return novas;
}

/** Mesmo conjunto? Evita um render à toa quando nada mudou. */
export function mesmasAbas(a: ReadonlySet<Aba>, b: ReadonlySet<Aba>): boolean {
  return a.size === b.size && [...a].every(x => b.has(x));
}
