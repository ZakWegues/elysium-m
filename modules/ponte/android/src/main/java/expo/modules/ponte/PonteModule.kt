package expo.modules.ponte

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File

/** A ponte no celular (25/11): guarda onde ela fica e liga o `Tunel`. Ver `lib/ponte.ts`. */
class PonteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Ponte")

    Function("configurar") { url: String, sala: String, psk: String, credencial: String, porta: Int ->
      appContext.reactContext?.let { Ponte.configurar(it, JSONObject().put("url", url).put("sala", sala).put("psk", psk).put("cred", credencial).put("porta", porta)) }
    }
    Function("esquecer") { appContext.reactContext?.let { Ponte.esquecer(it) } }
    Function("estado") { Ponte.estado() }
  }
}

internal object Ponte {
  private var tunel: Tunel? = null
  private var atual = ""

  /** Fora do backup do Android: a chave não vai para a nuvem do Google. */
  private fun arquivo(c: Context) = File(c.noBackupFilesDir, "elysium-ponte.json")

  @Synchronized
  fun configurar(c: Context, j: JSONObject) {
    val texto = j.toString()
    if (texto == atual && tunel?.escutando == true) return
    if (texto != atual) runCatching { arquivo(c).writeText(texto) }
    ligar(texto)
  }

  @Synchronized
  fun esquecer(c: Context) {
    runCatching { arquivo(c).delete() }
    tunel?.desligar()
    tunel = null
    atual = ""
  }

  /** Na abertura do processo — também quando o Android o acorda só para uma notificação. */
  @Synchronized
  fun religar(c: Context) {
    if (tunel != null) return
    runCatching { arquivo(c).readText() }.getOrNull()?.let { ligar(it) }
  }

  fun estado(): Map<String, Any?> = mapOf("escutando" to (tunel?.escutando == true), "aberta" to (tunel?.aberta == true), "erro" to tunel?.erro)

  private fun ligar(texto: String) {
    val cfg = runCatching {
      val j = JSONObject(texto)
      val url = j.getString("url")
      require(url.startsWith("https://"))
      ConfigDaPonte(url, j.getString("sala"), bytes(j.getString("psk")), j.getString("cred"), j.getInt("porta"))
    }.getOrNull() ?: return
    tunel?.desligar()
    tunel = Tunel(cfg).also { it.ligar() }
    atual = texto
  }

  private fun bytes(hex: String) = ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}

/** Só para o Android nos chamar no começo do processo. */
class Arranque : ContentProvider() {
  override fun onCreate(): Boolean {
    context?.let { c -> Thread { Ponte.religar(c) }.start() }
    return true
  }
  override fun query(u: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? = null
  override fun getType(u: Uri): String? = null
  override fun insert(u: Uri, v: ContentValues?): Uri? = null
  override fun delete(u: Uri, s: String?, a: Array<String>?) = 0
  override fun update(u: Uri, v: ContentValues?, s: String?, a: Array<String>?) = 0
}
