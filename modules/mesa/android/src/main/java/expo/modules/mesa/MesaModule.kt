package expo.modules.mesa

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inspector.WindowInspector
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * O que o Modo Mesa precisa do Android (25/11): esconder as barras do sistema e a bateria do celular.
 */
class MesaModule : Module() {
  private val contexto: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var receptor: BroadcastReceiver? = null
  private var ultima: Pair<Int, Boolean>? = null

  private fun ler(i: Intent?): Pair<Int, Boolean>? {
    if (i == null) return null
    val nivel = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val escala = i.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    if (nivel < 0 || escala <= 0) return null
    val status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    val carregando = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
    return Pair(Math.round(nivel * 100f / escala), carregando)
  }

  private fun comoMapa(b: Pair<Int, Boolean>) = mapOf("nivel" to b.first, "carregando" to b.second)

  /** Todas as janelas do app: a da Activity e a do Modal (que é um Dialog, com barras próprias). */
  private fun janelas(): List<View> {
    val raizes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WindowInspector.getGlobalWindowViews() else emptyList()
    val act = appContext.currentActivity?.window?.decorView
    return (raizes + listOfNotNull(act)).distinct()
  }

  override fun definition() = ModuleDefinition {
    Name("Mesa")
    Events("bateria")

    /**
     * Some com a barra de cima e a de baixo (deslizar da borda mostra por um instante) ou devolve.
     * Vale para todas as janelas abertas, inclusive a do Modal do Modo Mesa.
     */
    Function("barras") { mostrar: Boolean ->
      val act = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function false
      act.runOnUiThread {
        for (v in janelas()) {
          val c = v.windowInsetsController ?: continue
          if (mostrar) {
            c.show(WindowInsets.Type.systemBars())
          } else {
            c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.hide(WindowInsets.Type.systemBars())
          }
        }
      }
      true
    }

    /** { nivel: 0–100, carregando } ou null se o Android não disser. */
    Function("bateria") {
      ler(contexto.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)))?.let { comoMapa(it) }
    }

    // O aviso do Android vem a cada mudança (até de temperatura): só passa adiante o que mudou.
    OnStartObserving("bateria") {
      if (receptor != null) return@OnStartObserving
      val r = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
          val b = ler(i) ?: return
          if (b == ultima) return
          ultima = b
          sendEvent("bateria", comoMapa(b))
        }
      }
      receptor = r
      val filtro = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) contexto.registerReceiver(r, filtro, Context.RECEIVER_NOT_EXPORTED)
      else contexto.registerReceiver(r, filtro)
    }

    OnStopObserving("bateria") {
      receptor?.let { runCatching { contexto.unregisterReceiver(it) } }
      receptor = null
      ultima = null
    }
  }
}
