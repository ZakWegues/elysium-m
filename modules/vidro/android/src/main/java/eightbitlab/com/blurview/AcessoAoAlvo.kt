package eightbitlab.com.blurview

import android.graphics.RenderNode

/**
 * O `renderNode` do BlurTarget é de pacote (o próprio BlurView lê assim). Este arquivo mora no
 * mesmo pacote só para entregar esse nó ao vidro líquido (expo.modules.vidro) — nada mais.
 */
object AcessoAoAlvo {
  fun no(alvo: BlurTarget): RenderNode? = alvo.renderNode
}
