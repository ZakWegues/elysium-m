package expo.modules.vidro

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.os.SystemClock
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min

/**
 * O fundo animado do app, nativo (25/11, bateria): as mesmas camadas do `AppBackground` — aurora,
 * manchas, feixes, traços, poeira e a varredura do Stark. O que é macio sai de um shader só,
 * desenhado em 1/4 do tamanho; o resto são poucas linhas e pontos. Antes eram até 20 views animadas
 * por quadro e uma superfície do Skia, a 120 por segundo. Aqui: 15 (30 no Stark), só quando o
 * `Ritmo` deixa.
 */
class FundoVivoView(context: Context, appContext: AppContext) : ExpoView(context, appContext), Ritmo.Vivo {
  private val dens = resources.displayMetrics.density
  private val no: RenderNode? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RenderNode("fundo-vivo").apply { setUseCompositingLayer(true, null) } else null
  private val shader: RuntimeShader? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) runCatching { RuntimeShader(FUNDO) }.getOrNull() else null
  private val tinta = Paint()
  private val linha = Paint(Paint.ANTI_ALIAS_FLAG)
  private val passo = Runnable { invalidate() }

  private var cores = intArrayOf(Color.BLACK, Color.BLACK, Color.BLACK)
  private var primaria = Color.WHITE
  private var acento = Color.WHITE
  private var tema = "dark"
  private var vivo = false
  private var reduzir = false
  private var luz = 0.1f
  private var tempo = INICIO
  private var ultimo = 0L

  init {
    setWillNotDraw(false)
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  /** [mancha 1, 2, 3, primária, destaque], em ARGB. */
  fun definirCores(c: IntArray) {
    if (c.size < 5) return
    cores = intArrayOf(c[0], c[1], c[2])
    primaria = c[3]
    acento = c[4]
    acordar()
  }

  /** dark | glass | stark | poeira (papel de parede e imagem: só os grãos). */
  fun definirTema(t: String) { if (tema != t) { tema = t; luz = base(); acordar() } }
  fun definirVivo(v: Boolean) { if (vivo != v) { vivo = v; acordar() } }
  fun definirReduzir(v: Boolean) { if (reduzir != v) { reduzir = v; acordar() } }

  private fun base() = when (tema) { "glass" -> 0.18f; "stark" -> 0.16f; "poeira" -> 0f; else -> 0.1f }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    Ritmo.entrar(this)
  }

  override fun onDetachedFromWindow() {
    Ritmo.sair(this)
    removeCallbacks(passo)
    super.onDetachedFromWindow()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    // Voltou ao app: conta como toque, e o fundo anda por mais 20 s.
    if (visibility == View.VISIBLE) { Ritmo.mexeu(); acordar() } else removeCallbacks(passo)
  }

  override fun acordar() {
    ultimo = 0L
    removeCallbacks(passo)
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (width <= 0 || height <= 0) return
    val agora = SystemClock.uptimeMillis()
    val v = if (reduzir) 0f else Ritmo.velocidade(context, vivo)
    if (ultimo != 0L) tempo += min(0.2f, (agora - ultimo) / 1000f) * v
    ultimo = agora
    val alvo = base() * (if (vivo) 1.9f else 1f)
    val mudandoLuz = abs(alvo - luz) > 0.002f
    luz = if (mudandoLuz) luz + (alvo - luz) * 0.12f else alvo

    if (tema != "poeira") desenharMacio(canvas)
    desenharFinos(canvas)

    val espera = when {
      tema == "poeira" -> 200L
      tema == "stark" || vivo || mudandoLuz -> 33L
      else -> 66L
    }
    removeCallbacks(passo)
    if (v > 0f || mudandoLuz) postDelayed(passo, espera - 4) else ultimo = 0L
  }

  private fun desenharMacio(canvas: Canvas) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || !canvas.isHardwareAccelerated) return
    val s = shader ?: return
    val n = no ?: return
    val w = ceil(width / ESCALA).toInt()
    val h = ceil(height / ESCALA).toInt()
    val k = max(0.42f, min(1f, width / dens / 1024f)) * 1.25f
    s.setFloatUniform("res", width / dens, height / dens)
    s.setFloatUniform("dp", ESCALA / dens)
    s.setFloatUniform("t", tempo)
    s.setFloatUniform("k", k)
    s.setFloatUniform("forca", if (tema == "stark") 0f else if (tema == "glass") 1.5f else 1f)
    s.setFloatUniform("luz", luz)
    s.setFloatUniform("feixes", if (tema == "dark") 1f else 0f)
    s.setColorUniform("c0", cores[0])
    s.setColorUniform("c1", cores[1])
    s.setColorUniform("c2", cores[2])
    s.setColorUniform("cp", primaria)
    n.setPosition(0, 0, w, h)
    val c = n.beginRecording(w, h)
    tinta.shader = s
    c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), tinta)
    n.endRecording()
    val salvo = canvas.save()
    canvas.scale(ESCALA, ESCALA)
    canvas.drawRenderNode(n)
    canvas.restoreToCount(salvo)
  }

  /** 0 → 1 → 0, o `ease-in-out` alternado de sempre. */
  private fun vaiVem(ms: Float): Float = 0.5f - 0.5f * cos(PI.toFloat() * tempo * 1000f / ms)

  private fun comAlfa(cor: Int, a: Float) =
    Color.argb((a * 255f).toInt().coerceIn(0, 255), Color.red(cor), Color.green(cor), Color.blue(cor))

  private fun faixa(cor: Int, a: Float, alt: Float) =
    LinearGradient(0f, 0f, 0f, alt, intArrayOf(0, comAlfa(cor, a), 0), null, Shader.TileMode.CLAMP)

  private fun desenharFinos(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    linha.color = Color.BLACK
    if (tema == "stark") {
      val ms = if (vivo) 4000f else 11_000f
      val y = (-160f + ((tempo * 1000f % ms) / ms) * (h / dens * 1.2f + 160f)) * dens
      val alt = 140f * dens
      linha.shader = faixa(primaria, 0.07f, alt)
      val n = canvas.save()
      canvas.translate(0f, y)
      canvas.drawRect(0f, 0f, w, alt, linha)
      canvas.restoreToCount(n)
    }
    if (tema != "poeira") for (t in TRACOS) {
      val x = t[0] * w + (t[2] + (t[3] - t[2]) * vaiVem(t[4])) * dens
      val alt = h * 1.4f
      val n = canvas.save()
      canvas.translate(x, -h * 0.2f)
      canvas.rotate(t[1], dens / 2f, alt / 2f)
      linha.shader = faixa(if (t[5] > 0f) acento else primaria, 0.09f, alt)
      canvas.drawRect(0f, 0f, dens, alt, linha)
      canvas.restoreToCount(n)
    }
    linha.shader = null
    val cor = if (tema == "poeira") Color.WHITE else primaria
    for (g in POEIRA) {
      val t = vaiVem(g[2])
      linha.color = comAlfa(cor, g[3])
      canvas.drawCircle(g[0] * w + (t * 26f + 1f) * dens, g[1] * h + (t * -34f + 1f) * dens, dens, linha)
    }
  }

  companion object {
    private const val ESCALA = 4f
    private const val INICIO = 0f
    /** esquerda (fração), giro, de, até (dp), período (ms), cor (0 = primária, 1 = destaque). */
    private val TRACOS = arrayOf(
      floatArrayOf(0.22f, 9f, -40f, 60f, 68_000f, 0f),
      floatArrayOf(0.54f, -7f, 50f, -70f, 84_000f, 1f),
      floatArrayOf(0.81f, 5f, 30f, -50f, 76_000f, 0f),
    )
    private val POEIRA = arrayOf(
      floatArrayOf(0.12f, 0.18f, 46_000f, 0.22f), floatArrayOf(0.34f, 0.72f, 58_000f, 0.18f),
      floatArrayOf(0.58f, 0.24f, 52_000f, 0.26f), floatArrayOf(0.82f, 0.58f, 64_000f, 0.2f),
      floatArrayOf(0.24f, 0.44f, 40_000f, 0.16f), floatArrayOf(0.70f, 0.84f, 56_000f, 0.22f),
      floatArrayOf(0.46f, 0.09f, 48_000f, 0.18f), floatArrayOf(0.90f, 0.30f, 60_000f, 0.24f),
    )

    /** As contas do `fundoSkia.ts` (manchas) mais a aurora e os feixes, numa passada só. Em dp. */
    const val FUNDO = """
uniform float2 res;
uniform float dp;
uniform float t;
uniform float k;
uniform float forca;
uniform float luz;
uniform float feixes;
layout(color) uniform half4 c0;
layout(color) uniform half4 c1;
layout(color) uniform half4 c2;
layout(color) uniform half4 cp;

float vv(float ms) { return 0.5 - 0.5 * cos(3.14159265 * t * 1000.0 / ms); }

float perfil(float x) {
  if (x >= 1.0) return 0.0;
  if (x < 0.45) return mix(1.0, 0.85, x / 0.45);
  if (x < 0.75) return mix(0.85, 0.32, (x - 0.45) / 0.30);
  return mix(0.32, 0.0, (x - 0.75) / 0.25);
}

half4 sobre(half4 col, half3 cor, float a) {
  return half4(cor * a + col.rgb * (1.0 - a), a + col.a * (1.0 - a));
}

half4 mancha(half4 col, float2 p, float2 c, float r, half4 cor, float o0, float o1, float resp,
             float dx, float dy, float esc, float ms) {
  float d = vv(ms);
  float2 cc = c + d * float2(dx, dy) * k;
  float rr = r * (1.0 + (esc - 1.0) * d);
  float a = perfil(length(p - cc) / rr) * min(1.0, (o0 + (o1 - o0) * vv(resp)) * forca);
  return sobre(col, cor.rgb, a);
}

float pico(float x, float a, float m, float b) {
  if (x <= a || x >= b) return 0.0;
  if (x < m) return (x - a) / (m - a);
  return (b - x) / (b - m);
}

half4 aurora(half4 col, float2 p, float graus, float op) {
  float lado = max(res.x, res.y) * 1.4;
  float2 q = p - res * 0.5;
  if (length(q) > lado * 0.5) return col;
  float r = radians(graus);
  q = float2(q.x * cos(r) + q.y * sin(r), -q.x * sin(r) + q.y * cos(r)) / lado + 0.5;
  float x = clamp(dot(q - float2(0.0, 0.3), float2(1.0, 0.4)) / 1.16, 0.0, 1.0);
  float a0 = pico(x, 0.0, 0.17, 0.33);
  float a1 = pico(x, 0.33, 0.55, 0.72);
  float a2 = pico(x, 0.72, 0.89, 1.0);
  half3 cor = c0.rgb * a0 + c1.rgb * a1 + c2.rgb * a2;
  float a = (a0 + a1 + a2) * op;
  return half4(cor * op + col.rgb * (1.0 - a), a + col.a * (1.0 - a));
}

half4 feixe(half4 col, float2 p, float esq, float larg, float de, float ate, float ms, float pulso, float o0, float o1) {
  float2 c = float2(esq * res.x + larg * res.x * 0.5 + de + (ate - de) * vv(ms), res.y * 0.5);
  float r = radians(14.0);
  float2 q = p - c;
  q = float2(q.x * cos(r) + q.y * sin(r), -q.x * sin(r) + q.y * cos(r));
  float d = length(q / float2(larg * res.x * 0.5, res.y * 0.8));
  if (d >= 1.0) return col;
  float a = d < 0.6 ? mix(1.0, 0.45, d / 0.6) : mix(0.45, 0.0, (d - 0.6) / 0.4);
  return sobre(col, cp.rgb, a * (o0 + (o1 - o0) * vv(pulso)));
}

half4 main(float2 px) {
  float2 p = px * dp;
  float W = res.x;
  float H = res.y;
  half4 col = half4(0.0);
  col = aurora(col, p, t * 4.0, luz);
  col = aurora(col, p, -t * 360.0 / 130.0, luz * 0.62);
  if (forca > 0.0) {
    col = mancha(col, p, float2(W - 140.0 * k, 80.0 * k), 310.0 * k, c0, 0.50, 0.66, 11000.0, 120.0, 80.0, 1.14, 16000.0);
    col = mancha(col, p, float2(130.0 * k, H - 40.0 * k), 320.0 * k, c1, 0.55, 0.38, 13000.0, -110.0, -130.0, 1.10, 20000.0);
    col = mancha(col, p, float2(0.48 * W + 200.0 * k, 0.46 * H + 200.0 * k), 200.0 * k, c2, 0.40, 0.58, 9000.0, -90.0, 110.0, 0.88, 14000.0);
    col = mancha(col, p, float2(0.14 * W + 150.0 * k, 0.08 * H + 150.0 * k), 150.0 * k, c1, 0.26, 0.42, 15000.0, 150.0, -70.0, 1.20, 24000.0);
    col = mancha(col, p, float2(0.82 * W - 170.0 * k, 0.94 * H - 170.0 * k), 170.0 * k, c0, 0.22, 0.36, 17000.0, -130.0, -90.0, 1.12, 22000.0);
  }
  if (feixes > 0.5) {
    col = feixe(col, p, 0.06, 0.42, -40.0 * k, 150.0 * k, 24000.0, 9000.0, 0.06, 0.12);
    col = feixe(col, p, 0.56, 0.42, 40.0 * k, -170.0 * k, 30000.0, 12000.0, 0.06, 0.12);
    col = feixe(col, p, 0.44, 0.26, 90.0 * k, -90.0 * k, 36000.0, 15000.0, 0.04, 0.08);
  }
  return col;
}
"""
  }
}
