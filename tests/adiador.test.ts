import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarAdiador, gravacaoCurta } from '../src/lib/adiador';

describe('gravação adiada (bloco 196)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('dezenas de pedaços viram uma gravação só, com o último valor', () => {
    const gravados: number[] = [];
    const a = criarAdiador<number>((v) => gravados.push(v), 800);
    for (let i = 1; i <= 30; i++) { a.agendar(i); vi.advanceTimersByTime(50); }
    expect(gravados).toEqual([]);
    vi.advanceTimersByTime(800);
    expect(gravados).toEqual([30]);
  });

  it('descarregar grava na hora, e só uma vez', () => {
    const gravados: string[] = [];
    const a = criarAdiador<string>((v) => gravados.push(v), 800);
    a.agendar('x');
    a.descarregar();
    a.descarregar();
    vi.advanceTimersByTime(2000);
    expect(gravados).toEqual(['x']);
  });
});

describe('segurar o microfone (bloco 196)', () => {
  it('toque rápido não é fala', () => {
    expect(gravacaoCurta(1000, 1200)).toBe(true);
    expect(gravacaoCurta(1000, 1500)).toBe(false);
    expect(gravacaoCurta(0, 5000)).toBe(true);
  });
});

describe('conversas diferentes não se substituem', () => {
  it('trocar de conversa na espera grava a anterior', () => {
    vi.useFakeTimers();
    const gravados: string[] = [];
    const a = criarAdiador<{ id: string; t: string }>((v) => gravados.push(`${v.id}:${v.t}`), 800, (v) => v.id);
    a.agendar({ id: 'A', t: '1' });
    a.agendar({ id: 'A', t: '2' });
    a.agendar({ id: 'B', t: '1' });
    expect(gravados).toEqual(['A:2']);
    vi.advanceTimersByTime(800);
    expect(gravados).toEqual(['A:2', 'B:1']);
    vi.useRealTimers();
  });
});
