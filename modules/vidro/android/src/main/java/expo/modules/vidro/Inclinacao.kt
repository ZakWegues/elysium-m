package expo.modules.vidro

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import java.util.Collections
import java.util.WeakHashMap

/**
 * 09/11: a inclinação do aparelho para o brilho do vidro, de −1 (deitado para a esquerda) a 1.
 * Um sensor só para o app inteiro (gravidade, ou o acelerômetro onde não houver), ligado enquanto
 * houver alguma view de vidro visível que segue o aparelho; filtrado para não tremer.
 */
object Inclinacao : SensorEventListener {
  @Volatile var valor = 0f
    private set
  private val views: MutableSet<VidroLiquidoView> = Collections.newSetFromMap(WeakHashMap())
  private var gerente: SensorManager? = null

  fun entrar(v: VidroLiquidoView) {
    synchronized(views) {
      if (!views.add(v) || views.size > 1) return
    }
    val sm = v.context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
    val sensor = sm.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    gerente = sm
    sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
  }

  fun sair(v: VidroLiquidoView) {
    synchronized(views) {
      if (!views.remove(v) || views.isNotEmpty()) return
    }
    gerente?.unregisterListener(this)
    gerente = null
    valor = 0f
  }

  override fun onSensorChanged(e: SensorEvent) {
    // x da gravidade: + com o lado esquerdo para baixo. 30° de inclinação já dão o máximo.
    val alvo = (-e.values[0] / SensorManager.GRAVITY_EARTH / 0.5f).coerceIn(-1f, 1f)
    // Zona morta: a mão sempre treme um pouco, e cada mudança redesenha todos os vidros visíveis.
    if (kotlin.math.abs(alvo - valor) < 0.03f) return
    val novo = valor + (alvo - valor) * 0.15f
    valor = novo
    val copia = synchronized(views) { views.toList() }
    for (v in copia) v.postInvalidateOnAnimation()
  }

  override fun onAccuracyChanged(s: Sensor?, a: Int) {}
}
