package expo.modules.vidro

import android.os.Build
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

    View(VidroLiquidoView::class) {
      Prop("alvo") { view: VidroLiquidoView, id: Int? -> view.definirAlvo(id) }
      Prop("lente") { view: VidroLiquidoView, valor: Float -> view.definirLente(valor) }
      Prop("desfoque") { view: VidroLiquidoView, valor: Float -> view.definirDesfoque(valor) }
      Prop("raio") { view: VidroLiquidoView, valor: Float -> view.definirRaio(valor) }
      Prop("brilho") { view: VidroLiquidoView, valor: Float -> view.definirBrilho(valor) }
      // [r, g, b, a] de 0 a 1.
      Prop("tinta") { view: VidroLiquidoView, cor: List<Double> -> view.definirTinta(cor) }
      // [centro x (dp), meia largura (dp), visível 0–1]: a gota anda de mola até lá.
      Prop("seletor") { view: VidroLiquidoView, s: List<Double> -> view.moverSeletor(s) }
    }
  }
}
