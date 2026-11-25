package expo.modules.vidro

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * A esfera do Chat, nativa (25/11, bateria): as mesmas contas do `Esfera3D.tsx`, sem SVG (que
 * redesenhava um bitmap inteiro no processador, 120 vezes por segundo). 30 quadros parada, 60
 * ouvindo ou falando, zero depois de 20 s sem toque.
 */
class EsferaView(context: Context, appContext: AppContext) : ExpoView(context, appContext), Ritmo.Vivo {
  private val dens = resources.displayMetrics.density
  private val tinta = Paint(Paint.ANTI_ALIAS_FLAG)
  private val passo = Runnable { invalidate() }
  private val camadas = Array(3) { FloatArray(N * 3) }
  private val quantos = IntArray(3)

  private var modo = 0
  private var ativa = true
  private var lento = false
  private var noite = floatArrayOf(1f, 1f, 1f)
  private var corAlvo = Color.WHITE
  private var cor = Color.WHITE
  private var temCor = false
  private var opacAlvo = 0.95f
  private var opac = -1f
  private var t = 0f
  private var rot = 0f
  private var nivel = 0f
  private var ultimo = 0L
  private var halo: RadialGradient? = null
  private var haloCor = 0

  init {
    setWillNotDraw(false)
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  /** 0 parada, 1 ouvindo, 2 pensando, 3 falando. */
  fun definirModo(m: Int) { if (modo != m) { modo = m; acordar() } }
  fun definirAtiva(v: Boolean) { if (ativa != v) { ativa = v; acordar() } }
  fun definirLento(v: Boolean) { if (lento != v) { lento = v; acordar() } }
  /** [giro, respiração, brilho] da calma da noite. */
  fun definirNoite(v: List<Double>) { if (v.size == 3) { noite = FloatArray(3) { v[it].toFloat() }; acordar() } }
  fun definirCor(c: Int) {
    corAlvo = c
    if (!temCor) { cor = c; temCor = true }
    acordar()
  }
  fun definirOpacidade(v: Float) {
    opacAlvo = v
    if (opac < 0f) opac = v
    acordar()
  }

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
    if (visibility == View.VISIBLE) acordar() else removeCallbacks(passo)
  }

  override fun acordar() {
    ultimo = 0L
    removeCallbacks(passo)
    invalidate()
  }

  private fun parte(a: Int, b: Int, f: Float): Int {
    val d = (b - a) * f
    return a + (if (d > 0) max(1f, d) else if (d < 0) min(-1f, d) else 0f).toInt()
  }

  private fun mistura(a: Int, b: Int, f: Float) = Color.rgb(
    parte(Color.red(a), Color.red(b), f), parte(Color.green(a), Color.green(b), f), parte(Color.blue(a), Color.blue(b), f),
  )

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val tam = min(width, height).toFloat()
    if (tam <= 1f) return
    val agora = SystemClock.uptimeMillis()
    val dt = if (ultimo == 0L) 0.016f else min(0.05f, (agora - ultimo) / 1000f)
    ultimo = agora
    val v = if (ativa) Ritmo.velocidade(context, modo != 0, pausaNoToque = false) else 0f
    t += dt * v * (if (lento) 0.35f else 1f)
    val alvo = when (modo) {
      1, 3 -> min(1f, nivelDeFora)
      2 -> 0.18f + 0.12f * sin(t * PENSANDO)
      else -> 0f
    }
    // Por quadro, a 60 por segundo: 0,35 subindo e 0,08 descendo.
    nivel += (alvo - nivel) * min(1f, (if (alvo > nivel) 0.35f else 0.08f) * dt * 60f)
    rot += dt * v * (if (lento) 0.12f else 0.28f + nivel * 1.6f) * noite[0]
    val suave = min(1f, dt * 8f)
    opac = if (abs(opacAlvo - opac) < 0.005f) opacAlvo else opac + (opacAlvo - opac) * suave
    if (cor != corAlvo) cor = mistura(cor, corAlvo, suave)

    desenhar(canvas, tam)

    val mudando = opac != opacAlvo || cor != corAlvo || nivel > 0.01f
    removeCallbacks(passo)
    if (ativa && (v > 0f || mudando)) postDelayed(passo, if (modo != 0 || mudando) 13L else 29L) else ultimo = 0L
  }

  private fun desenhar(canvas: Canvas, tam: Float) {
    val meio = tam / 2f
    val forca = opac * noite[2]
    if (halo == null || haloCor != cor) {
      haloCor = cor
      halo = RadialGradient(0f, 0f, 1f, intArrayOf(alfa(cor, 0.35f), alfa(cor, 0.1f), alfa(cor, 0f)), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
    }
    val rh = tam * 0.42f * (1f + nivel * 0.12f)
    tinta.style = Paint.Style.FILL
    tinta.color = Color.BLACK
    tinta.shader = halo
    tinta.alpha = (255f * min(1f, forca * (0.55f + nivel * 0.45f))).toInt()
    val salvo = canvas.save()
    canvas.translate(meio, meio)
    canvas.scale(rh, rh)
    canvas.drawCircle(0f, 0f, 1f, tinta)
    canvas.restoreToCount(salvo)
    tinta.shader = null

    val r = tam * 0.3f * (1f + 0.03f * sin(t * 1.4f * noite[1]) + nivel * 0.14f)
    val sy = sin(rot)
    val cy = cos(rot)
    val rx = 0.42f + sin(t * 0.23f) * 0.12f
    val sx = sin(rx)
    val cx = cos(rx)
    quantos.fill(0)
    for (i in 0 until N) {
      val px = PONTOS[i * 3]
      val py = PONTOS[i * 3 + 1]
      val pz = PONTOS[i * 3 + 2]
      val e = 1f + 0.012f * sin(4f * py + t * 1.8f * noite[1]) +
        nivel * (0.16f * sin(3.1f * px + t * 5.3f) * sin(2.7f * py - t * 4.1f) + 0.1f * sin(5.3f * pz + t * 7.2f))
      val x = px * e
      val y = py * e
      val z = pz * e
      val x1 = x * cy + z * sy
      val z1 = -x * sy + z * cy
      val y2 = y * cx - z1 * sx
      val z2 = y * sx + z1 * cx
      val c = if (z2 < -0.33f) 0 else if (z2 < 0.33f) 1 else 2
      val f = 2.8f / (2.8f - min(2.2f, z2))
      val k = quantos[c] * 3
      quantos[c]++
      camadas[c][k] = meio + x1 * r * f
      camadas[c][k + 1] = meio + y2 * r * f
      camadas[c][k + 2] = max(0.3f, (0.7f + (z2 + 1f) * 0.8f) * f * (1f + nivel * 0.35f)) * dens
    }
    for (c in 0..2) {
      tinta.color = cor
      tinta.alpha = (255f * min(1f, forca * ALFAS[c])).toInt()
      for (i in 0 until quantos[c]) canvas.drawCircle(camadas[c][i * 3], camadas[c][i * 3 + 1], camadas[c][i * 3 + 2], tinta)
    }
    tinta.style = Paint.Style.STROKE
    tinta.strokeWidth = 1.2f * dens
    tinta.color = cor
    tinta.alpha = (255f * min(1f, forca * (0.18f + nivel * 0.35f))).toInt()
    canvas.drawCircle(meio, meio, tam * 0.3f * (1.32f + nivel * 0.08f), tinta)
  }

  private fun alfa(c: Int, a: Float) = Color.argb((a * 255f).toInt(), Color.red(c), Color.green(c), Color.blue(c))

  companion object {
    private const val N = 240
    private const val PENSANDO = 4f
    private val ALFAS = floatArrayOf(0.25f, 0.55f, 0.95f)
    /** O nível da voz (0–1): a dele, pelo gravador, ou a da Ely, pelo texto. Vem do JS. */
    @Volatile var nivelDeFora = 0f
    private val PONTOS = FloatArray(N * 3).also { p ->
      val ouro = PI * (3 - sqrt(5.0))
      for (i in 0 until N) {
        val y = 1 - (i / (N - 1.0)) * 2
        val r = sqrt(1 - y * y)
        p[i * 3] = (cos(ouro * i) * r).toFloat()
        p[i * 3 + 1] = y.toFloat()
        p[i * 3 + 2] = (sin(ouro * i) * r).toFloat()
      }
    }
  }
}
