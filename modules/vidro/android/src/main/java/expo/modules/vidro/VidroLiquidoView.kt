package expo.modules.vidro

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.OvershootInterpolator
import eightbitlab.com.blurview.AcessoAoAlvo
import eightbitlab.com.blurview.BlurTarget
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * A lente. Cada quadro em que o alvo (as telas) muda, o conteúdo dele é desenhado num RenderNode
 * deslocado para a posição desta view, e esse nó recebe `RenderEffect`: desfoque leve por dentro e
 * o shader AGSL por fora (a lente amostra o conteúdo já desfocado, deslocado pela borda).
 */
class VidroLiquidoView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val densidade = resources.displayMetrics.density
  private var alvoId: Int? = null
  private var alvo: BlurTarget? = null
  private var observador: ViewTreeObserver? = null
  private val aCadaQuadro = ViewTreeObserver.OnPreDrawListener { invalidate(); true }
  private val tentarDeNovo = Runnable { resolverAlvo() }

  private var lente = 0f
  private var desfoque = 6f
  private var tinta = floatArrayOf(0.09f, 0.09f, 0.1f, 0.28f)
  private var selCentro = 0f
  private var selMeia = 1f
  private var selVisivel = 0f
  private var raio = 0f
  private var brilho = 1f
  private var animacao: ValueAnimator? = null

  private val meu = IntArray(2)
  private val dele = IntArray(2)
  private val no: RenderNode? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RenderNode("vidro-liquido") else null
  private val shader: RuntimeShader? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RuntimeShader(LENTE_AGSL) else null

  init {
    setWillNotDraw(false)
  }

  fun definirAlvo(id: Int?) {
    alvoId = id
    estado = "alvo id=$id"
    post { resolverAlvo() }
  }

  fun definirLente(valor: Float) { lente = valor; invalidate() }
  fun definirDesfoque(valor: Float) { desfoque = valor.coerceIn(0f, 40f); invalidate() }
  /** Raio do canto em dp; 0 = pílula (metade da altura). Os botões são quadrados de canto suave. */
  fun definirRaio(valor: Float) { raio = valor.coerceAtLeast(0f); invalidate() }
  /** Quanto do fio de luz e do brilho do topo aparece (0–1). Os botões usam pouco. */
  fun definirBrilho(valor: Float) { brilho = valor.coerceIn(0f, 1f); invalidate() }

  fun definirTinta(cor: List<Double>) {
    if (cor.size == 4) tinta = floatArrayOf(cor[0].toFloat(), cor[1].toFloat(), cor[2].toFloat(), cor[3].toFloat())
    invalidate()
  }

  /** A gota vai de mola (com um passadinho, como o seletor da barra) até o centro novo. */
  fun moverSeletor(s: List<Double>) {
    if (s.size < 3) return
    val alvoX = s[0].toFloat()
    val alvoMeia = s[1].toFloat()
    val alvoVis = s[2].toFloat()
    animacao?.cancel()
    if (selVisivel == 0f && selCentro == 0f) {
      selCentro = alvoX; selMeia = alvoMeia; selVisivel = alvoVis; invalidate(); return
    }
    val (x0, m0, v0) = Triple(selCentro, selMeia, selVisivel)
    animacao = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 420
      interpolator = OvershootInterpolator(1.1f)
      addUpdateListener {
        val f = it.animatedValue as Float
        selCentro = x0 + (alvoX - x0) * f
        // No meio do caminho a gota estica (fica mais larga) e volta.
        selMeia = m0 + (alvoMeia - m0) * f + 10f * kotlin.math.sin(Math.PI * f.coerceIn(0f, 1f)).toFloat()
        selVisivel = v0 + (alvoVis - v0) * f.coerceIn(0f, 1f)
        invalidate()
      }
      start()
    }
  }

  private fun resolverAlvo() {
    val v = alvoId?.let { runCatching { appContext.findView<View>(it) }.getOrNull() }
    // O ExpoBlurTargetView põe o BlurTarget como primeiro filho; procurar por tipo é mais seguro.
    alvo = (v as? ViewGroup)?.let { achar(it) }
    // Pelo id não deu (ou o id ainda não chegou): o BlurTarget mais de fora da janela que não
    // contém esta barra — é o das telas (o do fundo fica dentro dele).
    if (alvo == null) alvo = (rootView as? ViewGroup)?.let { maisDeFora(it) }
    estado = when {
      alvo != null -> "alvo ok (${if (v != null) "pelo id" else "pela janela"})"
      v == null -> "findView nulo (id=$alvoId)"
      else -> "sem BlurTarget em ${v.javaClass.simpleName} (${(v as? ViewGroup)?.childCount} filhos)"
    }
    observador?.takeIf { it.isAlive }?.removeOnPreDrawListener(aCadaQuadro)
    observador = alvo?.viewTreeObserver
    observador?.addOnPreDrawListener(aCadaQuadro)
    invalidate()
  }

  // 01/11: o ExpoBlurTargetView responde getChildAt com os filhos do BlurTarget, nunca com o
  // próprio BlurTarget — procurar entre os filhos não o acha nunca. O pai real de um filho é ele.
  private fun achar(g: ViewGroup): BlurTarget? =
    g as? BlurTarget ?: (if (g.childCount > 0) g.getChildAt(0)?.parent as? BlurTarget else null)

  private fun maisDeFora(g: ViewGroup): BlurTarget? {
    val fila = ArrayDeque<ViewGroup>().apply { add(g) }
    while (fila.isNotEmpty()) {
      val atual = fila.removeFirst()
      val t = achar(atual)
      if (t != null && !contem(t, this)) return t
      for (i in 0 until atual.childCount) (atual.getChildAt(i) as? ViewGroup)?.let { fila.add(it) }
    }
    return null
  }

  private fun contem(pai: ViewGroup, v: View): Boolean {
    var p = v.parent
    while (p != null) { if (p === pai) return true; p = p.parent }
    return false
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    resolverAlvo()
  }

  override fun onDetachedFromWindow() {
    observador?.takeIf { it.isAlive }?.removeOnPreDrawListener(aCadaQuadro)
    observador = null
    animacao?.cancel()
    super.onDetachedFromWindow()
  }

  // 01/11: dispatchDraw, não onDraw — o Android sempre chama este num ViewGroup; o onDraw pode ser
  // pulado (na 2.7.0 a barra ficou transparente no aparelho do Zak).
  override fun dispatchDraw(canvas: Canvas) {
    desenharLente(canvas)
    super.dispatchDraw(canvas)
  }

  private fun desenharLente(canvas: Canvas) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    // Sem alvo: tenta de novo daqui a meio segundo (resolver aqui dentro invalidaria todo quadro).
    val t = alvo ?: run { estado = "onDraw sem alvo"; removeCallbacks(tentarDeNovo); postDelayed(tentarDeNovo, 500); return }
    val n = no ?: return
    val s = shader ?: return
    if (!canvas.isHardwareAccelerated) { estado = "canvas sem aceleração"; return }
    if (width <= 0 || height <= 0) { estado = "tamanho zero"; return }
    val conteudo = AcessoAoAlvo.no(t) ?: run { estado = "alvo sem RenderNode"; return }
    if (!conteudo.hasDisplayList()) { estado = "alvo sem desenho ainda"; return }

    getLocationOnScreen(meu)
    t.getLocationOnScreen(dele)
    n.setPosition(0, 0, width, height)
    val gravacao = n.beginRecording(width, height)
    gravacao.translate((dele[0] - meu[0]).toFloat(), (dele[1] - meu[1]).toFloat())
    gravacao.drawRenderNode(conteudo)
    n.endRecording()

    s.setFloatUniform("tam", width.toFloat(), height.toFloat())
    s.setFloatUniform("dens", densidade)
    s.setFloatUniform("lente", lente * densidade)
    s.setFloatUniform("sel", selCentro * densidade, selMeia * densidade, selVisivel)
    s.setFloatUniform("tinta", tinta[0], tinta[1], tinta[2], tinta[3])
    s.setFloatUniform("raio", raio * densidade)
    s.setFloatUniform("brilho", brilho)
    val raio = desfoque * densidade
    val efeito = if (raio > 0.5f) {
      RenderEffect.createChainEffect(
        RenderEffect.createRuntimeShaderEffect(s, "conteudo"),
        RenderEffect.createBlurEffect(raio, raio, Shader.TileMode.CLAMP),
      )
    } else RenderEffect.createRuntimeShaderEffect(s, "conteudo")
    n.setRenderEffect(efeito)
    canvas.drawRenderNode(n)
    if (!estado.startsWith("desenhando")) estado = "desenhando ${width}x${height}"
  }

  companion object {
    /** Em que pé está o vidro (para o diagnóstico e para o JS saber se pode tirar a reserva). */
    @Volatile var estado: String = "criada"

    /**
     * A lente (mesma geometria da LENTE_SKSL de lib/fundoSkia.ts, agora sobre o conteúdo real).
     * `q` em px da view; a pílula é um retângulo com as pontas redondas (raio = metade da altura).
     */
    const val LENTE_AGSL = """
uniform shader conteudo;
uniform float2 tam;
uniform float dens;
uniform float lente;
uniform float3 sel;
uniform half4 tinta;
uniform float raio;
uniform float brilho;

half4 main(float2 q) {
  float r = raio > 0.0 ? min(raio, min(tam.x, tam.y) * 0.5) : tam.y * 0.5;
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

  // Botão pequeno: a faixa que dobra é proporcional, senão a lente toma o botão inteiro.
  float borda = min(18.0 * dens, min(tam.x, tam.y) * 0.35);
  float tt = clamp(1.0 - dentro / borda, 0.0, 1.0);
  float2 desl = -n * tt * tt * lente;

  float2 sc = float2(sel.x, c.y);
  float2 e = (q - sc) / float2(max(sel.y, 1.0), max(r - 6.0 * dens, 1.0));
  float gota = clamp(1.0 - dot(e, e), 0.0, 1.0) * sel.z;
  desl += -(q - sc) * 0.18 * gota;

  // Aberração cromática leve só na aresta: o vermelho dobra um pouco mais que o azul.
  float sep = 1.0 + 0.05 * tt;
  half4 cr = conteudo.eval(q + desl * sep);
  half4 cg = conteudo.eval(q + desl);
  half4 cb = conteudo.eval(q + desl / sep);
  half3 cor = half3(cr.r, cg.g, cb.b);

  cor = mix(cor, tinta.rgb, tinta.a * (1.0 - 0.35 * tt));
  // Fio de luz na aresta de cima e um brilho difuso no topo (a luz vem de cima).
  float fio = smoothstep(2.0 * dens, 0.0, abs(dentro - 1.0 * dens)) * (0.28 + 0.32 * (-n.y));
  float topo = smoothstep(r, 0.0, q.y) * 0.06;
  cor += half3((fio + topo) * brilho);
  return half4(cor, 1.0);
}
"""
  }
}
