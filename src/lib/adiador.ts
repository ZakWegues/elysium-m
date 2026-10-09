/**
 * Gravação adiada (fase 19, bloco 196). Pura (só timers), testada em tests/adiador.test.ts.
 *
 * A tela de chat gravava a conversa inteira no AsyncStorage a CADA pedaço da resposta em
 * streaming — dezenas de leituras e escritas do histórico todo por resposta, e escritas que se
 * atropelavam (cada uma lê, muda e grava; a mais lenta podia gravar por cima da mais nova com
 * um texto velho). Agora o último valor espera `ms` sem mudança e grava uma vez; `descarregar`
 * grava na hora (sair da tela, app indo para o fundo).
 */
export interface Adiador<T> {
  agendar(valor: T): void;
  descarregar(): void;
}

/**
 * `chave`: valores de chaves diferentes (conversas diferentes) nunca se substituem — trocar de
 * conversa no meio da espera grava a anterior antes de agendar a nova.
 */
export function criarAdiador<T>(gravar: (valor: T) => void, ms = 800, chave?: (valor: T) => string): Adiador<T> {
  let pendente: { valor: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const descarregar = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const p = pendente;
    pendente = null;
    if (p) gravar(p.valor);
  };
  return {
    agendar(valor: T) {
      if (pendente && chave && chave(pendente.valor) !== chave(valor)) descarregar();
      pendente = { valor };
      if (timer) clearTimeout(timer);
      timer = setTimeout(descarregar, ms);
    },
    descarregar,
  };
}

/** Segurar o microfone por menos que isso é toque sem querer, não fala. Pura. */
export const MINIMO_SEGURAR_MS = 400;
export function gravacaoCurta(inicio: number, fim: number, minimo = MINIMO_SEGURAR_MS): boolean {
  return !inicio || fim - inicio < minimo;
}
