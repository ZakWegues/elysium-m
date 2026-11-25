package expo.modules.notificacoes

import android.app.Notification
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Escuta as notificações (25/11), só dos apps que ele ligou. Roda sem o app aberto: o Android mantém
 * o serviço. Aviso fixo, mídia, resumo de grupo e o que for segredo nem entram.
 */
class Escuta : NotificationListenerService() {
  override fun onListenerConnected() { atual = this; Guarda.enviar(this) }
  override fun onListenerDisconnected() { if (atual === this) atual = null }
  override fun onDestroy() { if (atual === this) atual = null; super.onDestroy() }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    val s = sbn ?: return
    runCatching { tratar(s) }
  }

  private fun tratar(s: StatusBarNotification) {
    if (s.packageName == packageName || s.isOngoing) return
    val n = s.notification ?: return
    if (n.flags and (Notification.FLAG_GROUP_SUMMARY or Notification.FLAG_FOREGROUND_SERVICE) != 0) return
    if (n.category in IGNORADAS || n.visibility == Notification.VISIBILITY_SECRET) return
    if (Filtro.appProibido(s.packageName)) return
    Guarda.viu(this, s.packageName, nomeDoApp(s.packageName))
    if (!Guarda.ligado(this) || s.packageName !in Guarda.apps(this)) return
    val item = ler(s, n) ?: return
    Guarda.guardar(this, item)
  }

  private fun nomeDoApp(pacote: String): String = runCatching {
    packageManager.getApplicationLabel(packageManager.getApplicationInfo(pacote, 0)).toString()
  }.getOrDefault(pacote)

  private fun ler(s: StatusBarNotification, n: Notification): JSONObject? {
    val e = n.extras
    val titulo = texto(e, Notification.EXTRA_TITLE)
    val conversa = texto(e, Notification.EXTRA_CONVERSATION_TITLE)
    val mensagens = JSONArray()
    @Suppress("DEPRECATION")
    val brutas = e.getParcelableArray(Notification.EXTRA_MESSAGES)
    brutas?.takeLast(6)?.forEach { b ->
      val m = b as? Bundle ?: return@forEach
      val t = m.getCharSequence("text")?.toString()?.trim().orEmpty()
      if (t.isEmpty()) return@forEach
      @Suppress("DEPRECATION")
      val pessoa = (m.getParcelable<android.os.Parcelable>("sender_person") as? android.app.Person)?.name?.toString() ?: m.getCharSequence("sender")?.toString()
      mensagens.put(JSONObject().put("de", pessoa.orEmpty().take(80)).put("texto", t.take(600)).put("em", m.getLong("time")))
    }
    val corpo = texto(e, Notification.EXTRA_BIG_TEXT).ifEmpty { texto(e, Notification.EXTRA_TEXT) }
    val tudo = buildString {
      append(titulo).append(' ').append(corpo)
      for (i in 0 until mensagens.length()) append(' ').append(mensagens.getJSONObject(i).optString("texto"))
    }
    if (tudo.isBlank() || Filtro.temSegredo(tudo)) return null
    return JSONObject()
      .put("id", s.key)
      .put("em", s.postTime)
      .put("app", s.packageName)
      .put("nome", nomeDoApp(s.packageName))
      .put("titulo", titulo.take(120))
      .put("conversa", conversa.take(120))
      .put("grupo", e.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false))
      .put("texto", corpo.take(800))
      .put("mensagens", mensagens)
      .put("responde", acaoDeResposta(n) != null)
  }

  private fun texto(e: Bundle, chave: String) = e.getCharSequence(chave)?.toString()?.trim().orEmpty()

  /** Responde pela própria notificação (o mesmo botão "Responder" do Android). */
  fun responder(chave: String, texto: String): Boolean {
    val s = activeNotifications?.firstOrNull { it.key == chave } ?: return false
    val acao = acaoDeResposta(s.notification) ?: return false
    val entradas = acao.remoteInputs
    val i = Intent()
    val b = Bundle()
    for (r in entradas) b.putCharSequence(r.resultKey, texto)
    RemoteInput.addResultsToIntent(entradas, i, b)
    return runCatching { acao.actionIntent.send(this, 0, i); true }.getOrDefault(false)
  }

  private fun acaoDeResposta(n: Notification): Notification.Action? =
    n.actions?.firstOrNull { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }

  companion object {
    @Volatile var atual: Escuta? = null
    private val IGNORADAS = setOf(
      Notification.CATEGORY_TRANSPORT, Notification.CATEGORY_PROGRESS, Notification.CATEGORY_SERVICE,
      Notification.CATEGORY_SYSTEM, Notification.CATEGORY_NAVIGATION, Notification.CATEGORY_STATUS, Notification.CATEGORY_ALARM,
    )
  }
}
