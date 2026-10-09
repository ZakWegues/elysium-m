import { describe, expect, it } from 'vitest';

describe('chave do widget (fase 20)', async () => {
  const { chaveDaUrl } = await import('../src/lib/chaveWidget');
  it('só aceita a chave de 32 hex', () => {
    expect(chaveDaUrl('elysium://falar?k=0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(chaveDaUrl('elysium://falar')).toBe('');
    expect(chaveDaUrl('elysium://falar?k=123')).toBe('');
  });
});
