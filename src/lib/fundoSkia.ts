/**
 * O fundo animado em SkSL (31/10, APK 2.6.0) — as cinco manchas do `AppBackground` (as mesmas
 * do `fundo.css` do PC) como função pura de (ponto, tempo). Existe para o VIDRO LÍQUIDO: a barra
 * de abas não consegue "ler" o que está atrás dela, então ela RECALCULA o fundo naquele ponto,
 * com o ponto entortado pela lente. Fundo e barra usam a mesma função e o mesmo relógio — o que a
 * barra mostra na borda é exatamente o fundo, dobrado.
 *
 * As constantes são as do `Manchas` (posições, tamanhos, opacidades, ciclos de deriva e de
 * respiração, em px da tela de 1024 escalados por `k`). O vai-e-vem de cada ciclo é a mesma curva
 * do `withRepeat(withTiming(1, sin))` do Reanimated: 0,5 − 0,5·cos(π·t/ms).
 */

/** Uniforms compartilhados: `res` (tela), `t` (s), `k` (escala), `forca`, e as 3 cores. */
export const FUNDO_SKSL = `
uniform float2 res;
uniform float t;
uniform float k;
uniform float forca;
uniform half4 c0;
uniform half4 c1;
uniform half4 c2;

float vv(float ms) { return 0.5 - 0.5 * cos(3.14159265 * t * 1000.0 / ms); }

float perfil(float x) {
  if (x >= 1.0) return 0.0;
  if (x < 0.45) return mix(1.0, 0.85, x / 0.45);
  if (x < 0.75) return mix(0.85, 0.32, (x - 0.45) / 0.30);
  return mix(0.32, 0.0, (x - 0.75) / 0.25);
}

// Uma mancha por cima do que já tem ("over", pré-multiplicado).
half4 mancha(half4 col, float2 p, float2 c, float r, half4 cor, float o0, float o1, float resp,
             float dx, float dy, float esc, float ms) {
  float d = vv(ms);
  float2 cc = c + d * float2(dx, dy) * k;
  float rr = r * (1.0 + (esc - 1.0) * d);
  float a = perfil(length(p - cc) / rr) * min(1.0, (o0 + (o1 - o0) * vv(resp)) * forca);
  return half4(cor.rgb * a + col.rgb * (1.0 - a), a + col.a * (1.0 - a));
}

half4 fundo(float2 p) {
  float W = res.x;
  float H = res.y;
  half4 col = half4(0.0);
  col = mancha(col, p, float2(W - 140.0 * k, 80.0 * k), 310.0 * k, c0, 0.50, 0.66, 11000.0, 120.0, 80.0, 1.14, 16000.0);
  col = mancha(col, p, float2(130.0 * k, H - 40.0 * k), 320.0 * k, c1, 0.55, 0.38, 13000.0, -110.0, -130.0, 1.10, 20000.0);
  col = mancha(col, p, float2(0.48 * W + 200.0 * k, 0.46 * H + 200.0 * k), 200.0 * k, c2, 0.40, 0.58, 9000.0, -90.0, 110.0, 0.88, 14000.0);
  col = mancha(col, p, float2(0.14 * W + 150.0 * k, 0.08 * H + 150.0 * k), 150.0 * k, c1, 0.26, 0.42, 15000.0, 150.0, -70.0, 1.20, 24000.0);
  col = mancha(col, p, float2(0.82 * W - 170.0 * k, 0.94 * H - 170.0 * k), 170.0 * k, c0, 0.22, 0.36, 17000.0, -130.0, -90.0, 1.12, 22000.0);
  return col;
}
`;

/** O fundo inteiro (camada das manchas, transparente entre elas). */
export const MANCHAS_SKSL = `${FUNDO_SKSL}
half4 main(float2 p) { return fundo(p); }
`;

/**
 * A lente da barra de abas. `q` é o ponto dentro da pílula; `origem` é onde a pílula está na
 * tela; `tam` é o tamanho dela. Perto da aresta (faixa `borda`), o fundo é puxado para dentro
 * (t²) e fica mais opaco — o vidro grosso da borda; o miolo fica transparente e deixa ver o
 * desfoque que já existe por baixo. O seletor é uma gota: amplia o fundo embaixo dele.
 * `sel` = (centro x, meia largura, visível 0–1). Saída pré-multiplicada.
 */
export const LENTE_SKSL = `${FUNDO_SKSL}
uniform half4 bg;
uniform float2 origem;
uniform float2 tam;
uniform float lente;
uniform float3 sel;

half4 main(float2 q) {
  float r = tam.y * 0.5;
  float2 c = tam * 0.5;
  float2 h = max(c - float2(r), float2(0.0));
  float2 rel = q - c;
  float2 d0 = abs(rel) - h;
  float dist = length(max(d0, float2(0.0))) + min(max(d0.x, d0.y), 0.0) - r;
  float dentro = -dist;
  if (dentro < 0.0) return half4(0.0);

  float2 n;
  if (d0.x > 0.0 && d0.y > 0.0) n = normalize(d0);
  else if (d0.x > d0.y) n = float2(1.0, 0.0);
  else n = float2(0.0, 1.0);
  n *= float2(rel.x < 0.0 ? -1.0 : 1.0, rel.y < 0.0 ? -1.0 : 1.0);

  float borda = 16.0;
  float tt = clamp(1.0 - dentro / borda, 0.0, 1.0);
  float2 desl = -n * tt * tt * lente;

  // A gota do seletor: elipse com o tamanho dele, amplia o fundo (puxa para o centro).
  float2 sc = float2(sel.x, c.y);
  float2 e = (q - sc) / float2(max(sel.y, 1.0), max(r - 6.0, 1.0));
  float gota = clamp(1.0 - dot(e, e), 0.0, 1.0) * sel.z;
  desl += -(q - sc) * 0.22 * gota;

  half4 b = fundo(origem + q + desl);
  half3 opaco = bg.rgb * (1.0 - b.a) + b.rgb;
  // Fio de luz na aresta de cima (a luz vem de cima), mais fraco embaixo.
  float fio = smoothstep(2.0, 0.0, abs(dentro - 1.0)) * (0.30 + 0.30 * (-n.y));
  float alpha = max(tt * tt * 0.88, gota * 0.7);
  half3 cor = opaco + half3(fio);
  return half4(cor * alpha, alpha);
}
`;

/** "#rrggbb" ou "rgba(…)" → [r, g, b, a] de 0 a 1 (uniform de cor do Skia). */
export function corParaUniform(cor: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(cor.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(cor.trim());
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
    return [Number(r) / 255, Number(g) / 255, Number(b) / 255, Number(a)];
  }
  return [0, 0, 0, 1];
}

/** O relógio comum do fundo e da barra: segundos desde que o app abriu (mesmo valor nos dois). */
export const INICIO_DO_FUNDO = Date.now();

/** A escala `k` do AppBackground (o PC desenha para 1024 px). */
export function escalaDoFundo(largura: number): number {
  return Math.max(0.42, Math.min(1, largura / 1024)) * 1.25;
}
