import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 24/10: o esqueleto da tela inteligente chamava `comAlfa(cor, a.value)` dentro do
 * useAnimatedStyle. Esse corpo é um worklet: roda na thread de UI do Reanimated, e chamar dali
 * uma função JS comum DERRUBA o app no Android (na prévia web passa, lá tudo roda no JS). Este
 * teste lê todos os useAnimatedStyle do app e só aceita chamadas que existem no worklet.
 */

const PERMITIDAS = new Set([
  "interpolate", "interpolateColor", "withTiming", "withSpring", "withDelay", "withRepeat", "withSequence", "withDecay",
  "Number", "String", "Boolean", "Array", "Object", "isNaN", "isFinite",
]);

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** O trecho entre o "(" de useAnimatedStyle( e o ")" que fecha. */
function corpos(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf("useAnimatedStyle(");
  while (i >= 0) {
    let j = i + "useAnimatedStyle(".length, nivel = 1;
    while (j < src.length && nivel > 0) { if (src[j] === "(") nivel++; else if (src[j] === ")") nivel--; j++; }
    out.push(src.slice(i + "useAnimatedStyle(".length, j - 1));
    i = src.indexOf("useAnimatedStyle(", j);
  }
  return out;
}

describe("worklets (useAnimatedStyle) só chamam o que existe na thread de UI", () => {
  it("nenhuma função JS comum dentro de useAnimatedStyle", () => {
    const raiz = path.resolve(__dirname, "..", "src");
    const problemas: string[] = [];
    for (const f of arquivos(raiz)) {
      const src = fs.readFileSync(f, "utf8");
      for (const corpo of corpos(src)) {
        // Tira o "() =>" do começo, strings e templates simples.
        const limpo = corpo.replace(/^\s*\(\s*\)\s*=>/, "").replace(/'[^']*'|"[^"]*"/g, "''");
        for (const m of limpo.matchAll(/(^|[^.\w])([A-Za-z_$][\w$]*)\s*\(/g)) {
          const nome = m[2];
          if (PERMITIDAS.has(nome)) continue;
          problemas.push(`${path.relative(raiz, f)}: ${nome}(…) dentro de useAnimatedStyle`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});
