/**
 * Números do pedido por voz (fase 13, bloco 116; a mão livre saiu em 02/10).
 *
 * Os limiares do bloco 89 (−38 dB para "falou", −46 para "ainda falando", 1,3 s de silêncio
 * para fechar) foram escolhidos sem medir nada no celular de verdade. Cada rodada vira uma linha
 * curta que vai para o log do PC (`diag.registrar`) — o único log que existe; depois de uma
 * ou duas semanas de uso, dá para ajustar com número.
 *
 * Nada de áudio nem de texto dito: só níveis, tempos, o motivo de parar e o TAMANHO da
 * transcrição (para distinguir "ouviu algo" de "pegou ruído").
 */

export type MotivoParada = 'silencio' | 'sem_fala' | 'teto' | 'desligou';

export type Rodada = {
  numero: number;
  /** Níveis em dBFS, um a cada ~120 ms. */
  niveis: number[];
  inicio: number;
  /** Quando o nível passou do limiar de fala pela primeira vez, ou null. */
  primeiraFalaEm: number | null;
  fim: number;
  motivo: MotivoParada;
  /** Tamanho da transcrição devolvida pelo PC (0 = nada entendido); null se nem enviou. */
  caracteres: number | null;
};

const DESCRICAO: Record<MotivoParada, string> = {
  silencio: 'silêncio depois da fala',
  sem_fala: 'ninguém falou em 20 s',
  teto: 'teto de 30 s',
  desligou: 'pedido cancelado',
};

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** Pura, para teste. */
export function resumoRodada(r: Rodada): string {
  const validos = r.niveis.filter((n) => n > -160).sort((a, b) => a - b);
  const pico = validos.length ? Math.round(validos[validos.length - 1]) : null;
  const mediana = validos.length ? Math.round(validos[Math.floor(validos.length / 2)]) : null;
  const partes = [
    `rodada ${r.numero}`,
    pico === null ? 'sem leitura de nível' : `pico ${pico} dB, mediana ${mediana} dB`,
    r.primeiraFalaEm === null ? 'não detectou fala' : `fala em ${segundos(r.primeiraFalaEm - r.inicio)}`,
    `parou por ${DESCRICAO[r.motivo]}`,
    `${segundos(r.fim - r.inicio)} gravados`,
  ];
  if (r.caracteres !== null) partes.push(r.caracteres ? `transcrição de ${r.caracteres} caracteres` : 'transcrição vazia');
  return partes.join(', ');
}
