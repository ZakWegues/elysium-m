package expo.modules.vidro

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Window
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Vidro líquido de verdade (31/10, APK 2.7.0). A barra de abas desenha o conteúdo que está
 * ATRÁS dela (telas, cards, texto e o fundo — tudo que o BlurTarget do expo-blur grava) e passa
 * esse conteúdo por um shader AGSL de lente: a borda puxa o que está atrás para dentro, as cores
 * se separam de leve na aresta, e o seletor é uma gota que amplia o que está embaixo dele.
 *
 * Precisa do Android 13 (RuntimeShader). Antes disso a view não desenha nada e o JS mantém o
 * desfoque de sempre (`suporte()` diz qual caminho vale, para o diagnóstico).
 */
class VidroModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Vidro")

    Function("suporte") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "nativo API ${Build.VERSION.SDK_INT}"
      else "desfoque (API ${Build.VERSION.SDK_INT})"
    }

    Function("estado") { VidroLiquidoView.estado }

    // O ritmo do que se mexe sozinho (25/11, bateria) — ver Ritmo.kt.
    Function("mexeu") { Ritmo.mexeu() }
    Function("pausarFundo") { ms: Int -> Ritmo.pausar(ms.toLong()) }
    Function("economia") { sempre: Boolean -> Ritmo.definirEconomia(sempre) }
    // Quantos quadros a janela desenhou em `ms` — a prova, no log do PC, de que parado é parado.
    AsyncFunction("contarQuadros") { ms: Int, promessa: Promise ->
      val janela = appContext.currentActivity?.window
      if (janela == null) { promessa.resolve(-1); return@AsyncFunction }
      val fio = Handler(Looper.getMainLooper())
      fio.post {
        var n = 0
        val ouvinte = Window.OnFrameMetricsAvailableListener { _, _, _ -> n++ }
        runCatching { janela.addOnFrameMetricsAvailableListener(ouvinte, fio) }
        fio.postDelayed({
          runCatching { janela.removeOnFrameMetricsAvailableListener(ouvinte) }
          promessa.resolve(n)
        }, ms.toLong())
      }
    }
    Function("nivelDaVoz") { v: Float -> EsferaView.nivelDeFora = v }

    View(VidroLiquidoView::class) {
      Prop("alvo") { view: VidroLiquidoView, id: Int? -> view.definirAlvo(id) }
      Prop("lente") { view: VidroLiquidoView, valor: Float -> view.definirLente(valor) }
      Prop("desfoque") { view: VidroLiquidoView, valor: Float -> view.definirDesfoque(valor) }
      Prop("raio") { view: VidroLiquidoView, valor: Float -> view.definirRaio(valor) }
      Prop("brilho") { view: VidroLiquidoView, valor: Float -> view.definirBrilho(valor) }
      Prop("perfil") { view: VidroLiquidoView, valor: Float -> view.definirPerfil(valor) }
      // [r, g, b, a] de 0 a 1.
      Prop("tinta") { view: VidroLiquidoView, cor: List<Double> -> view.definirTinta(cor) }
      // [centro x (dp), meia largura (dp), visível 0–1]: a gota anda de mola até lá.
      Prop("seletor") { view: VidroLiquidoView, s: List<Double> -> view.moverSeletor(s) }
      // −1 a 1: para que lado o brilho inclina (a velocidade do seletor da barra).
      Prop("inclina") { view: VidroLiquidoView, valor: Float -> view.definirInclina(valor) }
      // O brilho também acompanha a inclinação do aparelho (sensor de gravidade).
      Prop("segueAparelho") { view: VidroLiquidoView, valor: Boolean -> view.definirSegueAparelho(valor) }
    }
  }
}
