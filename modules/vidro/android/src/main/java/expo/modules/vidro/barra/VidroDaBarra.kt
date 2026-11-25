package expo.modules.vidro.barra

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import eightbitlab.com.blurview.AcessoAoAlvo
import eightbitlab.com.blurview.BlurTarget
import expo.modules.kotlin.AppContext
import kotlin.math.ceil
import kotlin.math.min
import kotlin.math.roundToInt

// As medidas do Nuvio Enhanced, em dp: a barra e a lente do seletor.
private const val BARRA_DESFOQUE = 10f
private const val BARRA_ALTURA = 20f
private const val BARRA_FORCA = 20f
private const val BARRA_TINTA = 0.4f
private const val LENTE_ALTURA = 12f
private const val LENTE_FORCA = 20f
private const val MARGEM = 28f

/**
 * O vidro da barra (25/11). Três nós, todos na GPU:
 *  - `fosco`: o que está atrás (as telas, já gravadas num RenderNode pelo BlurTarget), com cor
 *    viva e desfoque;
 *  - `painel`: o fosco passando pela lente da borda da barra;
 *  - `gota`: as telas + o fosco, passando pela lente do seletor.
 * Nada passa pelo JS: a posição sai da matriz da própria view no quadro em que ela é desenhada.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class MotorDoVidro(private val barra: BarraVidroView, private val appContext: AppContext) {
  private val dens = barra.resources.displayMetrics.density
  private val margem = ceil(MARGEM * dens).toInt()
  private val fosco = RenderNode("barra-fosco")
  private val painel = RenderNode("barra-painel")
  private val gota = RenderNode("barra-gota")
  private val lentePainel = RuntimeShader(REFRACAO)
  private val lenteGota = RuntimeShader(REFRACAO)
  private val lenteIcones = RuntimeShader(REFRACAO)
  private val daBarra = Matrix()
  private val daView = Matrix()
  private val doAlvo = Matrix()
  private val conta = Matrix()
  private val recorteBarra = Path()
  private val rect = RectF()

  private var alvoId: Int? = null
  private var alvo: BlurTarget? = null
  private var observador: ViewTreeObserver? = null
  private val aCadaQuadro = ViewTreeObserver.OnPreDrawListener { barra.vidroMudou(); true }
  private val deNovo = Runnable { resolver() }
  var pronto = false
    private set

  init {
    fosco.setRenderEffect(
      RenderEffect.createBlurEffect(
        BARRA_DESFOQUE * dens, BARRA_DESFOQUE * dens,
        RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(1.5f) })),
        Shader.TileMode.CLAMP,
      ),
    )
  }

  fun definirAlvo(id: Int?) {
    alvoId = id
    barra.post { resolver() }
  }

  fun ligar() = resolver()

  fun soltar() {
    observador?.takeIf { it.isAlive }?.removeOnPreDrawListener(aCadaQuadro)
    observador = null
    barra.removeCallbacks(deNovo)
  }

  private fun resolver() {
    if (!barra.isAttachedToWindow) return
    val v = alvoId?.let { runCatching { appContext.findView<View>(it) }.getOrNull() }
    alvo = (v as? ViewGroup)?.let { achar(it) } ?: (barra.rootView as? ViewGroup)?.let { maisDeFora(it) }
    observador?.takeIf { it.isAlive }?.removeOnPreDrawListener(aCadaQuadro)
    observador = alvo?.viewTreeObserver
    observador?.addOnPreDrawListener(aCadaQuadro)
    if (alvo == null) { barra.removeCallbacks(deNovo); barra.postDelayed(deNovo, 400) }
    barra.vidroMudou()
  }

  // O ExpoBlurTargetView responde getChildAt com os filhos do BlurTarget: o alvo é o pai deles.
  private fun achar(g: ViewGroup): BlurTarget? =
    g as? BlurTarget ?: (if (g.childCount > 0) g.getChildAt(0)?.parent as? BlurTarget else null)

  private fun maisDeFora(g: ViewGroup): BlurTarget? {
    val fila = ArrayDeque<ViewGroup>().apply { add(g) }
    while (fila.isNotEmpty()) {
      val atual = fila.removeFirst()
      val t = achar(atual)
      if (t != null && !contem(t, barra)) return t
      for (i in 0 until atual.childCount) (atual.getChildAt(i) as? ViewGroup)?.let { fila.add(it) }
    }
    return null
  }

  private fun contem(pai: ViewGroup, v: View): Boolean {
    var p = v.parent
    while (p != null) { if (p === pai) return true; p = p.parent }
    return false
  }

  /** Desenha as telas nas coordenadas locais de `view`, desfazendo escala e posição dela. */
  private fun desenharTelas(canvas: Canvas, deView: Matrix): Boolean {
    val t = alvo ?: return false
    val conteudo = AcessoAoAlvo.no(t) ?: return false
    if (!conteudo.hasDisplayList()) return false
    doAlvo.reset()
    t.transformMatrixToGlobal(doAlvo)
    if (!deView.invert(conta)) return false
    conta.preConcat(doAlvo)
    val n = canvas.save()
    canvas.concat(conta)
    canvas.drawRenderNode(conteudo)
    canvas.restoreToCount(n)
    return true
  }

  private fun gravarFosco(): Boolean {
    val w = barra.width
    val h = barra.height
    daBarra.reset()
    barra.transformMatrixToGlobal(daBarra)
    fosco.setPosition(0, 0, w + margem * 2, h + margem * 2)
    val c = fosco.beginRecording(w + margem * 2, h + margem * 2)
    c.translate(margem.toFloat(), margem.toFloat())
    val ok = desenharTelas(c, daBarra)
    fosco.endRecording()
    return ok
  }

  private fun lente(s: RuntimeShader, w: Float, h: Float, x: Float, y: Float, altura: Float, forca: Float, profundidade: Float): RenderEffect {
    val r = min(w, h) / 2f
    s.setFloatUniform("size", w, h)
    s.setFloatUniform("offset", -x, -y)
    s.setFloatUniform("cornerRadii", r, r, r, r)
    s.setFloatUniform("refractionHeight", altura * dens)
    s.setFloatUniform("refractionAmount", -forca * dens)
    s.setFloatUniform("depthEffect", profundidade)
    return RenderEffect.createRuntimeShaderEffect(s, "content")
  }

  /** A barra. false = ainda sem as telas (quem chama pinta a cor cheia). */
  fun desenharPainel(canvas: Canvas): Boolean {
    val w = barra.width
    val h = barra.height
    if (w <= 0 || h <= 0 || !canvas.isHardwareAccelerated) return false
    pronto = gravarFosco()
    if (!pronto) return false
    painel.setPosition(0, 0, w, h)
    val c = painel.beginRecording(w, h)
    c.translate(-margem.toFloat(), -margem.toFloat())
    c.drawRenderNode(fosco)
    painel.endRecording()
    painel.setRenderEffect(lente(lentePainel, w.toFloat(), h.toFloat(), 0f, 0f, BARRA_ALTURA, BARRA_FORCA, 0f))
    canvas.drawRenderNode(painel)
    return true
  }

  /** O seletor: telas, barra fosca por cima e a lente. */
  fun desenharGota(canvas: Canvas, view: View, tinta: Int): Boolean {
    val w = view.width
    val h = view.height
    if (w <= 0 || h <= 0 || !pronto || !canvas.isHardwareAccelerated) return false
    daView.reset()
    view.transformMatrixToGlobal(daView)
    daBarra.reset()
    barra.transformMatrixToGlobal(daBarra)
    gota.setPosition(0, 0, w, h)
    val c = gota.beginRecording(w, h)
    desenharTelas(c, daView)
    if (daView.invert(conta)) {
      conta.preConcat(daBarra)
      c.concat(conta)
      rect.set(0f, 0f, barra.width.toFloat(), barra.height.toFloat())
      recorteBarra.rewind()
      recorteBarra.addRoundRect(rect, rect.height() / 2f, rect.height() / 2f, Path.Direction.CW)
      c.clipPath(recorteBarra)
      c.translate(-margem.toFloat(), -margem.toFloat())
      c.drawRenderNode(fosco)
      c.drawColor(tinta)
    }
    gota.endRecording()
    gota.setRenderEffect(lente(lenteGota, w.toFloat(), h.toFloat(), 0f, 0f, LENTE_ALTURA, LENTE_FORCA, 1f))
    canvas.drawRenderNode(gota)
    return true
  }

  /** Os ícones acesos entortando na borda do seletor, só no arrasto. `r` em coordenadas da barra. */
  fun refracaoDosIcones(r: RectF, apertado: Float): RenderEffect =
    lente(lenteIcones, r.width(), r.height(), r.left, r.top, max(0.5f, LENTE_ALTURA * apertado), LENTE_FORCA * apertado, 1f)

  private fun max(a: Float, b: Float) = if (a > b) a else b

  companion object {
    /**
     * A lente da biblioteca Backdrop (AndroidLiquidGlass).
     * Copyright 2025 Kyant — Apache License 2.0. Ver modules/vidro/LICENCAS.md.
     */
    const val REFRACAO = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;

float radiusAt(float2 centeredCoord, float4 radii) {
    if (centeredCoord.x >= 0.0) {
        if (centeredCoord.y <= 0.0) return radii.y;
        else return radii.z;
    } else {
        if (centeredCoord.y <= 0.0) return radii.x;
        else return radii.w;
    }
}

float sdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

float2 gradSdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(coord) * normalize(max(cornerCoord, 0.0));
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * float2(gradX, 1.0 - gradX);
    }
}

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(centeredCoord, cornerRadii);

    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);

    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));

    float2 refractedCoord = coord + d * grad;
    return content.eval(refractedCoord);
}
"""
  }
}

private fun comAlfa(cor: Int, alfa: Float) =
  Color.argb((alfa.coerceIn(0f, 1f) * 255f).roundToInt(), Color.red(cor), Color.green(cor), Color.blue(cor))

/** O fundo da barra: vidro, tinta de 40% e o aro claro de cima. */
internal class PainelDeVidro(context: Context, private val motor: MotorDoVidro?) : View(context) {
  var cor: Int = Color.BLACK
  private val dens = resources.displayMetrics.density
  private val aro = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 0.75f * dens }

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  override fun hasOverlappingRendering() = false

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    aro.shader = LinearGradient(0f, 0f, 0f, h.toFloat(), comAlfa(Color.WHITE, 0.27f), comAlfa(Color.WHITE, 0.02f), Shader.TileMode.CLAMP)
  }

  override fun onDraw(canvas: Canvas) {
    val ok = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && motor?.desenharPainel(canvas) == true
    canvas.drawColor(comAlfa(cor, if (ok) BARRA_TINTA else 0.82f))
    val m = aro.strokeWidth / 2f
    val r = height / 2f - m
    canvas.drawRoundRect(m, m, width - m, height - m, r, r, aro)
  }
}

/** O seletor: lente, realce na cor do tema (some pela metade no aperto), aro e sombra de dentro. */
internal class GotaDeVidro(context: Context, private val motor: MotorDoVidro?) : View(context) {
  var base: Int = Color.BLACK
  var destaque: Int = Color.WHITE
  var apertado: Float = 0f
  private val dens = resources.displayMetrics.density
  private val tinta = Paint(Paint.ANTI_ALIAS_FLAG)
  private val aro = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dens }
  private val sombra = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.BLACK }

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  override fun hasOverlappingRendering() = false

  override fun onDraw(canvas: Canvas) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) motor?.desenharGota(canvas, this, comAlfa(base, BARRA_TINTA))
    val enfase = 1f - 0.5f * apertado
    val w = width.toFloat()
    val h = height.toFloat()
    val r = h / 2f
    tinta.color = comAlfa(base, 0.52f * enfase)
    canvas.drawRoundRect(0f, 0f, w, h, r, r, tinta)
    tinta.color = comAlfa(destaque, 0.2f * enfase)
    canvas.drawRoundRect(0f, 0f, w, h, r, r, tinta)
    if (apertado > 0.02f) {
      val raio = 8f * dens * apertado
      sombra.strokeWidth = raio
      sombra.alpha = (0.15f * apertado * 255f).roundToInt()
      sombra.maskFilter = BlurMaskFilter(raio, BlurMaskFilter.Blur.NORMAL)
      canvas.drawRoundRect(-raio / 2f, -raio / 2f + raio * 0.5f, w + raio / 2f, h + raio * 1.5f, r, r, sombra)
    }
    val m = aro.strokeWidth / 2f
    aro.shader = LinearGradient(0f, 0f, 0f, h, comAlfa(destaque, 0.6f * enfase + 0.3f * apertado), comAlfa(destaque, 0.15f * enfase), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(m, m, w - m, h - m, r - m, r - m, aro)
  }
}

/** A fileira dos ícones apagados, sem o pedaço que está embaixo do seletor. */
internal class FaixaRecortada(context: Context) : JellyLayerView(context) {
  var recorte: Path? = null

  override fun dispatchDraw(canvas: Canvas) {
    val r = recorte
    if (r == null) { super.dispatchDraw(canvas); return }
    val n = canvas.save()
    canvas.clipOutPath(r)
    super.dispatchDraw(canvas)
    canvas.restoreToCount(n)
  }
}
