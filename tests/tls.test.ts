import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import { assinaturaEsperada, fixarSeValido, tlsUtil } from '../src/lib/tls';

// 31/10: a impressão do certificado do PC só é fixada com a assinatura certa (HMAC com o token).

describe('TLS com o PC', () => {
  it('a assinatura esperada é a mesma conta do PC (assinarImpressao)', () => {
    const sha = 'ab'.repeat(32);
    expect(assinaturaEsperada('token-x', sha, 4201)).toBe(crypto.createHmac('sha256', 'token-x').update(`tls:4201:${sha}`).digest('hex'));
  });

  it('sem o módulo nativo (prévia, APK antigo): não fixa e segue em http', () => {
    const sha = 'cd'.repeat(32);
    expect(fixarSeValido('t', { porta: 4201, sha256: sha, assinatura: assinaturaEsperada('t', sha, 4201) })).toBeNull();
    expect(tlsUtil({ porta: 4201, sha256: sha })).toBe(false);
  });
});
