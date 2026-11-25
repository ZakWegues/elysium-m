import { describe, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
vi.mock('react', () => ({ useSyncExternalStore: (_: unknown, f: () => unknown) => f() }));
import { aoAbrir } from '../src/lib/barraVidro';

describe('trava da barra com liquid glass', () => {
  it('abre ligada e anota a tentativa', () => {
    expect(aoAbrir(null, null)).toEqual({ ligada: true, tentativas: 1 });
    expect(aoAbrir('1', '1')).toEqual({ ligada: true, tentativas: 2 });
  });
  it('duas quedas seguidas desligam', () => expect(aoAbrir(null, '2')).toEqual({ ligada: false, tentativas: 0 }));
  it('desligada à mão não conta', () => expect(aoAbrir('0', '1')).toEqual({ ligada: false, tentativas: 0 }));
});
