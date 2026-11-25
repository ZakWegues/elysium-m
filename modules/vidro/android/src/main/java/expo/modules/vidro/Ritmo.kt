package expo.modules.vidro

import android.content.Context
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import java.util.Collections
import java.util.WeakHashMap

/**
 * Quando o que se mexe sozinho (fundo e esfera) pode se mexer (25/11, bateria). Um relógio só, sem
 * quadro à toa: para enquanto ele toca na tela, na troca de aba, depois de 20 s sem toque e com
 * economia de bateria. Parado é parado mesmo: nada é agendado até o próximo toque.
 */
object Ritmo {
  const val PAUSA_DO_TOQUE = 1500L
  const val OCIOSO = 20_000L

  interface Vivo { fun acordar() }

  private val vivos: MutableSet<Vivo> = Collections.newSetFromMap(WeakHashMap())
  private val fio = Handler(Looper.getMainLooper())
  private val acordarTodos = Runnable { vivos.toList().forEach { it.acordar() } }
  @Volatile private var ultimoToque = SystemClock.uptimeMillis()
  @Volatile private var pausadoAte = 0L
  /** Ajustes → Aparência → Economia de bateria: ligada vale sempre; desligada, só com pouca bateria. */
  @Volatile private var sempre = false
  private var economiaLida = false
  private var leituraEm = 0L

  fun entrar(v: Vivo) { vivos.add(v) }
  fun sair(v: Vivo) { vivos.remove(v) }

  fun mexeu() {
    ultimoToque = SystemClock.uptimeMillis()
    agendar(PAUSA_DO_TOQUE)
  }

  fun pausar(ms: Long) {
    pausadoAte = SystemClock.uptimeMillis() + ms
    agendar(max(ms, ultimoToque + PAUSA_DO_TOQUE - SystemClock.uptimeMillis()))
  }

  fun definirEconomia(v: Boolean) {
    sempre = v
    leituraEm = 0L
    agendar(0)
  }

  private fun max(a: Long, b: Long) = if (a > b) a else b

  private fun agendar(ms: Long) {
    fio.removeCallbacks(acordarTodos)
    fio.postDelayed(acordarTodos, ms + 20)
  }

  /** 0 (parado) a 1: a velocidade de agora, com entrada e saída suaves. `vivo` = a Ely em ação. */
  fun velocidade(c: Context, vivo: Boolean, pausaNoToque: Boolean = true): Float {
    val agora = SystemClock.uptimeMillis()
    if (agora < pausadoAte) return 0f
    if (vivo) return 1f
    val parado = agora - ultimoToque
    if ((pausaNoToque && parado < PAUSA_DO_TOQUE) || parado >= OCIOSO || economia(c)) return 0f
    val entrada = if (pausaNoToque) (parado - PAUSA_DO_TOQUE) / 600f + 0.05f else 1f
    return minOf(1f, entrada, (OCIOSO - parado) / 1500f)
  }

  fun ocioso() = SystemClock.uptimeMillis() - ultimoToque >= OCIOSO

  fun economia(c: Context): Boolean {
    if (sempre) return true
    val agora = SystemClock.uptimeMillis()
    if (leituraEm != 0L && agora - leituraEm < 10_000) return economiaLida
    leituraEm = agora
    val poupando = (c.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true
    val b = c.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
    val carga = b?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 100
    economiaLida = poupando || (carga in 1..20 && b?.isCharging != true)
    return economiaLida
  }
}
