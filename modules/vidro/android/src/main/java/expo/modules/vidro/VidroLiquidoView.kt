package expo.modules.vidro

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
  private var perfil = 0f
  private var alvoX = 0f
  private var alvoMeia = 1f
  private var alvoVisivel = 0f
  private var velX = 0f
  private var velMeia = 0f
  private var segurada = false
  private var semMovimento = false
  /** Quanto da lente da gota aparece (0–1): acende segurando ou correndo entre as abas. */
  private var forcaGota = 0f
  private var quadro = 0L
  private var larguraVista = 0
  private var mudouLargura = 0L
  /** 09/11: a luz gira com o arrasto (−1 a 1, vem do JS) e, se ligado, com a inclinação do aparelho. */
  private var inclinaAlvo = 0f
  private var inclinaAtual = 0f
  private var segueAparelho = false

  private val meu = IntArray(2)
  private val dele = IntArray(2)
  private val no: RenderNode? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RenderNode("vidro-liquido") else null
  private val shader: RuntimeShader? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RuntimeShader(LENTE_AGSL) else null
  private val noGota: RenderNode? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RenderNode("vidro-gota") else null
  // Se o shader da gota for recusado no aparelho, a barra fica só com o vidro de antes.
  private val shaderGota: RuntimeShader? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) runCatching { RuntimeShader(GOTA_AGSL) }.getOrNull() else null

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
  /** Quanto do brilho do aro aparece (0–1). Os botões usam pouco. */
  fun definirBrilho(valor: Float) { brilho = valor.coerceIn(0f, 1f); invalidate() }
  /** 0 = painel (domo), 1 = lente (squircle + Snell) — ver LENTE_AGSL. */
  fun definirPerfil(valor: Float) { perfil = valor; invalidate() }
  fun definirInclina(valor: Float) { inclinaAlvo = valor.coerceIn(-1f, 1f); invalidate() }
  fun definirSegueAparelho(valor: Boolean) {
    if (valor == segueAparelho) return
    segueAparelho = valor
    if (valor && isAttachedToWindow && windowVisibility == View.VISIBLE) Inclinacao.entrar(this) else Inclinacao.sair(this)
    invalidate()
  }

  fun definirTinta(cor: List<Double>) {
    if (cor.size == 4) tinta = floatArrayOf(cor[0].toFloat(), cor[1].toFloat(), cor[2].toFloat(), cor[3].toFloat())
    invalidate()
  }

  /**
   * 23/11: a gota anda por uma mola integrada a cada quadro. Antes cada passo do dedo recomeçava
   * uma animação de 420 ms, e a gota chegava sempre atrasada. Segurada, a mola é dura e crítica
   * (cola no dedo); solta, é a mesma mola da barra (TabBar), e as duas andam juntas.
   */
  fun moverSeletor(s: List<Double>) {
    if (s.size < 3) return
    alvoX = s[0].toFloat()
    alvoMeia = s[1].toFloat()
    val visivel = s[2].toFloat()
    val primeira = selVisivel == 0f && selCentro == 0f
    segurada = visivel > 1f
    alvoVisivel = visivel
    if (primeira || semMovimento) {
      selCentro = alvoX; selMeia = alvoMeia; selVisivel = visivel
      velX = 0f; velMeia = 0f
    }
    invalidate()
  }
  fun definirSemMovimento(valor: Boolean) { semMovimento = valor }

  /** Um quadro da mola da gota (dp e dp/s). Devolve se ainda precisa de outro quadro. */
  private fun passoDaGota(): Boolean {
    val agora = System.nanoTime()
    var resta = if (quadro == 0L) 1f / 60f else ((agora - quadro) / 1e9f).coerceIn(0.001f, 0.05f)
    val rigidez = if (segurada) 900f else 211f
    val atrito = if (segurada) 60f else 17f
    // Passos de até 8 ms: a mola dura não dispara num quadro longo.
    while (resta > 0f) {
      val dt = minOf(resta, 0.008f)
      velX += (rigidez * (alvoX - selCentro) - atrito * velX) * dt
      selCentro += velX * dt
      velMeia += (211f * (alvoMeia - selMeia) - 22f * velMeia) * dt
      selMeia += velMeia * dt
      resta -= dt
    }
    selVisivel += (alvoVisivel - selVisivel) * 0.2f
    // A lente acende segurando ou correndo, depressa, e apaga devagar. A barra mudando de tamanho
    // (encolher, abrir) também move a gota, mas ali não é troca de aba.
    if (width != larguraVista) { larguraVista = width; mudouLargura = agora }
    val mudando = agora - mudouLargura < 350_000_000L
    val acesa = if (alvoVisivel > 0f && !mudando && (segurada || kotlin.math.abs(velX) > 60f)) 1f else 0f
    forcaGota += (acesa - forcaGota) * (if (acesa > forcaGota) 0.35f else 0.14f)
    val parada = kotlin.math.abs(alvoX - selCentro) < 0.1f && kotlin.math.abs(velX) < 1f &&
      kotlin.math.abs(alvoMeia - selMeia) < 0.1f && kotlin.math.abs(velMeia) < 1f &&
      kotlin.math.abs(alvoVisivel - selVisivel) < 0.01f && kotlin.math.abs(acesa - forcaGota) < 0.01f
    if (parada) {
      selCentro = alvoX; selMeia = alvoMeia; selVisivel = alvoVisivel; forcaGota = acesa
      velX = 0f; velMeia = 0f; quadro = 0L
      return false
    }
    quadro = agora
    return true
  }

  /** A gota acesa, por cima do vidro da barra: lente sobre o conteúdo SEM desfoque. */
  private fun desenharGota(canvas: Canvas, conteudo: RenderNode) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || forcaGota < 0.01f || lente <= 0f) return
    val n = noGota ?: return
    val s = shaderGota ?: return
    n.setPosition(0, 0, width, height)
    val gravacao = n.beginRecording(width, height)
    gravacao.translate((dele[0] - meu[0]).toFloat(), (dele[1] - meu[1]).toFloat())
    gravacao.drawRenderNode(conteudo)
    n.endRecording()
    val estica = if (semMovimento) 0f else (kotlin.math.abs(velX) / 1800f).coerceAtMost(0.35f)
    val meiaAltura = (height / 2f - 6f * densidade) * (if (segurada) 1.1f else 1f) * (1f - estica * 0.35f)
    s.setFloatUniform("tam", width.toFloat(), height.toFloat())
    s.setFloatUniform("dens", densidade)
    s.setFloatUniform("lente", lente * densidade)
    s.setFloatUniform("gota", selCentro * densidade, selMeia * densidade * (1f + estica), meiaAltura, forcaGota.coerceIn(0f, 1f))
    s.setFloatUniform("vel", if (semMovimento) 0f else (velX / 900f).coerceIn(-1f, 1f))
    n.setRenderEffect(RenderEffect.createRuntimeShaderEffect(s, "conteudo"))
    canvas.drawRenderNode(n)
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
    if (segueAparelho) Inclinacao.entrar(this)
  }

  // Fora da tela (app no fundo, aba escondida) o sensor não precisa ficar ligado por esta view.
  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (segueAparelho && visibility == View.VISIBLE && isAttachedToWindow) Inclinacao.entrar(this) else Inclinacao.sair(this)
  }

  override fun onDetachedFromWindow() {
    observador?.takeIf { it.isAlive }?.removeOnPreDrawListener(aCadaQuadro)
    observador = null
    quadro = 0L
    Inclinacao.sair(this)
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

    if (passoDaGota()) postInvalidateOnAnimation()
    s.setFloatUniform("tam", width.toFloat(), height.toFloat())
    s.setFloatUniform("dens", densidade)
    s.setFloatUniform("lente", lente * densidade)
    s.setFloatUniform("sel", selCentro * densidade, selMeia * densidade, selVisivel)
    s.setFloatUniform("tinta", tinta[0], tinta[1], tinta[2], tinta[3])
    s.setFloatUniform("raio", raio * densidade)
    s.setFloatUniform("brilho", brilho)
    s.setFloatUniform("perfil", perfil)
    // A luz: de cima à esquerda (225°), girando até 35° com o arrasto e 25° com o aparelho.
    inclinaAtual += (inclinaAlvo - inclinaAtual) * 0.22f
    if (kotlin.math.abs(inclinaAlvo - inclinaAtual) > 0.005f) postInvalidateOnAnimation() else inclinaAtual = inclinaAlvo
    val graus = 225f + inclinaAtual * 35f + (if (segueAparelho) Inclinacao.valor * 25f else 0f)
    val rad = Math.toRadians(graus.toDouble())
    s.setFloatUniform("luzDir", kotlin.math.cos(rad).toFloat(), kotlin.math.sin(rad).toFloat())
    val raio = desfoque * densidade
    val efeito = if (raio > 0.5f) {
      RenderEffect.createChainEffect(
        RenderEffect.createRuntimeShaderEffect(s, "conteudo"),
        RenderEffect.createBlurEffect(raio, raio, Shader.TileMode.CLAMP),
      )
    } else RenderEffect.createRuntimeShaderEffect(s, "conteudo")
    n.setRenderEffect(efeito)
    canvas.drawRenderNode(n)
    desenharGota(canvas, conteudo)
    if (!estado.startsWith("desenhando")) estado = "desenhando ${width}x${height}"
  }

  companion object {
    /** Em que pé está o vidro (para o diagnóstico e para o JS saber se pode tirar a reserva). */
    @Volatile var estado: String = "criada"

    /**
     * A lente, com a óptica da biblioteca Glisse (github.com/0kzh/glisse, MIT), agora sobre o
     * conteúdo real. `q` em px da view; a forma é um retângulo de pontas redondas (raio = metade
     * da altura quando `raio` é 0).
     *   perfil 0 (painel): um domo — o aro (25% do lado menor) puxa o que está atrás para dentro
     *     em arco; `lente` é o deslocamento máximo na aresta, em px.
     *   perfil 1 (lente): superfície squircle e refração de Snell com n = 1,5; o deslocamento sai
     *     em px do ângulo de entrada e da espessura, × `lente` / 16 (16 = a força do Dark).
     * Dispersão R/G/B 1,08 / 1,04 / 1 e brilho em três faixas no aro, luz de cima à esquerda.
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
uniform float perfil;
uniform float2 luzDir;

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

  float m = min(tam.x, tam.y);
  float faixa;
  float desloca;
  if (perfil > 0.5) {
    float bisel = clamp(m * 0.12, 4.0 * dens, 10.0 * dens);
    float espessura = clamp(m * 0.2, 8.0 * dens, 24.0 * dens);
    faixa = bisel;
    float t = clamp(dentro / bisel, 0.0, 1.0);
    float sup = pow(1.0 - pow(1.0 - t, 4.0), 0.25);
    float entrada = atan(pow(1.0 - t, 3.0) / max(pow(sup, 3.0), 0.0001));
    float saida = asin(sin(entrada) / 1.5);
    desloca = dentro < bisel ? tan(entrada - saida) * (espessura + sup * bisel) * (lente / (16.0 * dens)) : 0.0;
  } else {
    faixa = m * 0.25;
    float t = clamp(1.0 - dentro / faixa, 0.0, 1.0);
    desloca = (1.0 - sqrt(1.0 - t * t)) * lente;
  }
  float2 desl = -n * desloca;

  float2 sc = float2(sel.x, c.y);
  float2 e = (q - sc) / float2(max(sel.y, 1.0), max(r - 6.0 * dens, 1.0));
  float gota = clamp(1.0 - dot(e, e), 0.0, 1.0) * sel.z;
  desl += -(q - sc) * 0.18 * gota;

  half4 cr = conteudo.eval(q + desl * 1.08);
  half4 cg = conteudo.eval(q + desl * 1.04);
  half4 cb = conteudo.eval(q + desl);
  half3 cor = half3(cr.r, cg.g, cb.b);

  float naBorda = clamp(1.0 - dentro / max(faixa, 1.0), 0.0, 1.0);
  cor = mix(cor, tinta.rgb, tinta.a * (1.0 - 0.35 * naBorda));
  // Brilho: três faixas suaves no aro, mais fortes onde a borda encara a luz (`luzDir`), e
  // um fio de 1,2 px na aresta. Somado em "screen", × brilho.
  float luz = dot(n, luzDir);
  float glint = pow(max(luz, 0.0), 3.0);
  float refl = pow(max(-luz, 0.0), 3.0);
  float d = dentro / max(faixa, 1.0);
  float a = 0.0;
  if (d < 1.0) {
    float bandas = (exp(-pow((d - 0.18) / 0.22, 2.0)) + exp(-pow((d - 0.42) / 0.22, 2.0)) + exp(-pow((d - 0.66) / 0.22, 2.0))) / 3.0;
    a = bandas * (0.06 + 0.8 * glint + 0.35 * refl) * 0.85 * 0.35;
  }
  if (dentro < 1.22 * dens) a += 0.22 * (0.35 + 0.65 * glint);
  a = clamp(a * brilho, 0.0, 1.0);
  cor = half3(1.0) - (half3(1.0) - cor) * half3(1.0 - a);
  return half4(cor, 1.0);
}
"""

    /**
     * 23/11: a gota do seletor, quando segurada ou correndo. `gota` = centro x, meia largura, meia
     * altura (px) e força (0–1). O aro dobra o fundo com força, o miolo amplia, e `vel` (−1 a 1)
     * arrasta o fundo no sentido do movimento. O conteúdo chega nítido: entortar o já desfocado
     * quase não se via.
     */
    const val GOTA_AGSL = """
uniform shader conteudo;
uniform float2 tam;
uniform float dens;
uniform float lente;
uniform float4 gota;
uniform float vel;

half4 main(float2 q) {
  float2 c = float2(gota.x, tam.y * 0.5);
  float r = max(min(gota.y, gota.z), 1.0);
  float2 h = max(float2(gota.y, gota.z) - float2(r), float2(0.0));
  float2 rel = q - c;
  float2 d0 = abs(rel) - h;
  float dentro = r - length(max(d0, float2(0.0))) - min(max(d0.x, d0.y), 0.0);
  if (dentro < 0.0) return half4(0.0);

  float2 n;
  if (d0.x > 0.0 && d0.y > 0.0) n = normalize(d0);
  else if (d0.x > d0.y) n = float2(1.0, 0.0);
  else n = float2(0.0, 1.0);
  n *= float2(rel.x < 0.0 ? -1.0 : 1.0, rel.y < 0.0 ? -1.0 : 1.0);

  float t = clamp(1.0 - dentro / (r * 0.6), 0.0, 1.0);
  float arco = 1.0 - sqrt(max(1.0 - t * t, 0.0));
  float2 desl = -n * arco * min(lente, r * 0.95);
  desl -= rel * 0.16 * (1.0 - arco);
  desl.x -= vel * 14.0 * dens * (0.35 + 0.65 * t);

  half4 cr = conteudo.eval(q + desl * 1.10);
  half4 cg = conteudo.eval(q + desl * 1.05);
  half4 cb = conteudo.eval(q + desl);
  half3 cor = half3(cr.r, cg.g, cb.b);
  cor = mix(cor, half3(0.09), half(0.16));

  float glint = pow(max(dot(n, float2(-0.7071, -0.7071)), 0.0), 3.0);
  float refl = pow(max(dot(n, float2(0.7071, 0.7071)), 0.0), 3.0);
  float brilho = t * t * (0.05 + 0.22 * glint + 0.1 * refl);
  if (dentro < 1.22 * dens) brilho += 0.2 * (0.35 + 0.65 * glint);
  cor = half3(1.0) - (half3(1.0) - cor) * half3(1.0 - clamp(brilho, 0.0, 1.0));
  float a = gota.w * clamp(dentro / dens, 0.0, 1.0);
  return half4(cor * half(a), half(a));
}
"""
  }
}
