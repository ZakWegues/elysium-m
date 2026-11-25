package expo.modules.vidro.barra

import android.view.View
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A barra de abas com liquid glass (25/11): toque, mola, ícones e lente no mesmo desenho nativo.
 * Movimento do jelly-tabs; vidro e lente da biblioteca Backdrop, do Kyant. Precisa do Android 13.
 */
class BarraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BarraVidro")

    View(BarraVidroView::class) {
      Events("onTabPress", "onTabLongPress")

      Prop("alvo") { view: BarraVidroView, id: Int? -> view.definirAlvo(id) }
      Prop("tabs") { view: BarraVidroView, tabs: ReadableArray -> view.setTabs(tabs.toTabs()) }
      Prop("selectedIndex") { view: BarraVidroView, index: Int -> view.setSelectedIndex(index) }
      Prop("palette") { view: BarraVidroView, palette: ReadableMap -> view.setPalette(palette.toPalette()) }
      Prop("layerOpacity") { view: BarraVidroView, opacity: ReadableMap -> view.setLayerOpacity(opacity.toLayerOpacity()) }
      Prop("metrics") { view: BarraVidroView, metrics: ReadableMap -> view.setMetrics(metrics.toMetrics()) }
      Prop("motion") { view: BarraVidroView, motion: ReadableMap -> view.setMotionConfig(motion.toMotionConfig()) }
      Prop("touchFeedback") { view: BarraVidroView, feedback: ReadableMap -> view.setTouchFeedback(feedback.toTouchFeedback()) }

      GroupView<BarraVidroView> {
        AddChildView { parent, child: View, index -> parent.addReactChild(child, index) }
        GetChildCount { parent -> parent.reactChildCount }
        GetChildViewAt { parent, index -> parent.reactChildAt(index) }
        RemoveChildView { parent, child: View -> parent.removeReactChild(child) }
        RemoveChildViewAt { parent, index -> parent.removeReactChildAt(index) }
      }

      OnViewDidUpdateProps { view: BarraVidroView -> view.commit() }

      OnViewDestroys { view: BarraVidroView -> view.release() }
    }
  }
}
