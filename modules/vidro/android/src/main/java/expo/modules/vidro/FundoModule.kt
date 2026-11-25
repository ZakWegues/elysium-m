package expo.modules.vidro

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** A view do fundo animado (25/11) — um módulo por view, como pede o `requireNativeView`. */
class FundoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FundoVivo")
    View(FundoVivoView::class) {
      Prop("cores") { view: FundoVivoView, c: List<Int> -> view.definirCores(c.toIntArray()) }
      Prop("tema") { view: FundoVivoView, t: String -> view.definirTema(t) }
      Prop("vivo") { view: FundoVivoView, v: Boolean -> view.definirVivo(v) }
      Prop("reduzir") { view: FundoVivoView, v: Boolean -> view.definirReduzir(v) }
    }
  }
}

class EsferaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EsferaViva")
    View(EsferaView::class) {
      Prop("modo") { view: EsferaView, m: Int -> view.definirModo(m) }
      Prop("ativa") { view: EsferaView, v: Boolean -> view.definirAtiva(v) }
      Prop("lento") { view: EsferaView, v: Boolean -> view.definirLento(v) }
      Prop("noite") { view: EsferaView, v: List<Double> -> view.definirNoite(v) }
      Prop("cor") { view: EsferaView, c: Int -> view.definirCor(c) }
      Prop("opacidade") { view: EsferaView, v: Float -> view.definirOpacidade(v) }
    }
  }
}
