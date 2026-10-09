import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import contrato from '../contracts/rpc-methods.json';
import { DESTRUCTIVE_METHODS } from '../src/lib/rpc';

/**
 * O contrato RPC com o PC (fase 20). `contracts/rpc-methods.json` vem do desktop
 * (`elysium/contracts/`); este teste cobra que cada método tipado aqui exista lá, que nada de
 * lá falte nos tipos, e que a trava de confirmação seja a mesma.
 */
const RAIZ = path.join(__dirname, '..');

function metodosTipados(): string[] {
  // Sem CRLF: no Windows o checkout do git troca as quebras de linha (core.autocrlf).
  const src = fs.readFileSync(path.join(RAIZ, 'src/lib/rpc.ts'), 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf('export type RpcMethod =');
  const j = src.indexOf("';\n", i);
  return [...src.slice(i, j + 2).matchAll(/^\s*\| '([^']+)'/gm)].map(m => m[1]);
}

describe('contrato RPC', () => {
  const doPc = contrato.metodos.map(m => m.method);

  it('cada método tipado no celular existe no PC', () => {
    expect(metodosTipados().filter(m => !doPc.includes(m))).toEqual([]);
  });

  it('nenhum método do PC fica sem tipo aqui', () => {
    const tipados = metodosTipados();
    expect(doPc.filter(m => !tipados.includes(m))).toEqual([]);
  });

  it('a trava de confirmação é a do PC', () => {
    const doContrato = contrato.metodos.filter(m => m.destructive).map(m => m.method).sort();
    expect([...DESTRUCTIVE_METHODS].sort()).toEqual(doContrato);
    for (const m of ['episodios.delete', 'listas.delete', 'comandos.delete', 'system.killProcess']) {
      expect(DESTRUCTIVE_METHODS.has(m as never), m).toBe(true);
    }
  });

  it('a cópia é igual à do desktop, quando os dois repos estão lado a lado', () => {
    const doDesktop = path.join(RAIZ, '..', 'elysium', 'contracts', 'rpc-methods.json');
    if (!fs.existsSync(doDesktop)) return;
    const ler = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    expect(ler(path.join(RAIZ, 'contracts/rpc-methods.json'))).toBe(ler(doDesktop));
  });
});
