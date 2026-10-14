/**
 * Contas puras do trackpad (fase 22) — testadas em tests/trackpad.test.ts.
 *
 * O trackpad antigo multiplicava o dedo por 1,8 fixo: devagar não acertava um botão, rápido
 * não atravessava a tela. Aqui o ganho cresce com a velocidade do dedo (como o mouse do
 * Windows), os eventos de um quadro viram um frame só, e o teclado ao vivo manda só a
 * diferença do que mudou no campo.
 */

/** Evento que vai ao PC — o mesmo formato do frame `type:"input"` do desktop (inputCanal.ts). */
export type EventoInput =
  | ['m', number, number]
  | ['w', number, number]
  | ['d' | 'u' | 'c', 'left' | 'right' | 'middle']
  | ['dc']
  | ['k', string[]]
  | ['t', string]
  | ['bs', number]
  | ['ping', number];

export const SENSIBILIDADE_MIN = 0.6;
export const SENSIBILIDADE_MAX = 3.0;
export const SENSIBILIDADE_PADRAO = 1.4;

/**
 * Ganho do cursor pela velocidade do dedo (px/ms). `base` é a sensibilidade escolhida.
 * ganho(v) = base · (1 + k · min(v, vmax)^0,8)
 */
export function ganho(v: number, base: number, k = 1.1, vmax = 4): number {
  'worklet';
  const b = Math.max(0.6, Math.min(3, base));
  const vel = Math.max(0, Math.min(Math.abs(v), vmax));
  return b * (1 + k * Math.pow(vel, 0.8));
}

/** O deslocamento do dedo (px) em `dtMs` virando deslocamento do cursor, já acelerado. */
export function acelerar(dx: number, dy: number, dtMs: number, base: number): [number, number] {
  'worklet';
  const v = Math.hypot(dx, dy) / Math.max(1, dtMs);
  const g = ganho(v, base);
  return [dx * g, dy * g];
}

/**
 * Junta os eventos de um quadro: movimentos e rolagens seguidos viram um só; qualquer outro
 * evento fecha o bloco (a ordem entre "mover" e "clicar" nunca muda).
 */
export class Coalescedor {
  private fila: EventoInput[] = [];

  add(e: EventoInput): void {
    const ult = this.fila[this.fila.length - 1];
    if (ult && ult[0] === 'm' && e[0] === 'm') { ult[1] += e[1]; ult[2] += e[2]; return; }
    if (ult && ult[0] === 'w' && e[0] === 'w') { ult[1] += e[1]; ult[2] += e[2]; return; }
    this.fila.push(e[0] === 'm' || e[0] === 'w' ? [e[0], e[1], e[2]] as EventoInput : e);
  }

  get vazio(): boolean { return this.fila.length === 0; }

  /** Tira até `max` eventos (o PC aceita 64 por frame). */
  tirar(max = 64): EventoInput[] {
    return this.fila.splice(0, max);
  }
}

export type Toque = 'tap' | 'drag';

/** Tap ou arrasto, pela distância andada (px) e pelo tempo (ms). */
export function classificarToque(distancia: number, duracaoMs: number, slop = 10, maxMs = 250): Toque {
  return distancia <= slop && duracaoMs <= maxMs ? 'tap' : 'drag';
}

/** Dois taps viram duplo se o segundo começou até `janelaMs` depois do fim do primeiro. */
export function ehDuplo(fimDoAnterior: number | null, inicioDoAtual: number, janelaMs = 300): boolean {
  return fimDoAnterior !== null && inicioDoAtual - fimDoAnterior <= janelaMs;
}

/**
 * Teclado ao vivo: o que mudou entre o texto de antes e o de agora, como "apague N e digite
 * isto". Conta por caractere de verdade (um emoji é um backspace, não dois).
 */
export function diffTexto(antes: string, depois: string): { bs: number; texto: string } {
  const a = Array.from(antes), d = Array.from(depois);
  let p = 0;
  while (p < a.length && p < d.length && a[p] === d[p]) p++;
  return { bs: a.length - p, texto: d.slice(p).join('') };
}

/** Um passo da inércia da rolagem: a velocidade cai 8% por quadro; abaixo do mínimo, para. */
export function passoInercia(v: number, decaimento = 0.92, minimo = 0.02): number {
  'worklet';
  const n = v * decaimento;
  return Math.abs(n) < minimo ? 0 : n;
}

/** Gesto de 3 dedos: deslizar para cima = Win+Tab, para baixo = Win+D. `null` se não decidiu. */
export function gestoTresDedos(dy: number, limite = 60): string[] | null {
  if (dy <= -limite) return ['win', 'tab'];
  if (dy >= limite) return ['win', 'd'];
  return null;
}
