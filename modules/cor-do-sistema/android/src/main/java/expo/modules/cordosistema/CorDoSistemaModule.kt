package expo.modules.cordosistema

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A cor de destaque do aparelho para o tema Minimal (20/10). No Android 12+ é a cor tirada do
 * papel de parede (Material You), em `system_accent1_*`. Antes do 12 não existe: devolve null e
 * o tema usa o acento neutro.
 */
class CorDoSistemaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CorDoSistema")

    Function("destaque") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function null
      val ctx = appContext.reactContext ?: return@Function null
      val cor = ctx.resources.getColor(android.R.color.system_accent1_600, ctx.theme)
      String.format("#%06x", cor and 0xFFFFFF)
    }
  }
}
