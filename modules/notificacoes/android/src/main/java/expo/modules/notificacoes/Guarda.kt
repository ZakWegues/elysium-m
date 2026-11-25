package expo.modules.notificacoes

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val MAXIMO = 200
private const val JUNTAR_S = 8L
private const val VALIDADE_MS = 48L * 3_600_000L

/**
 * A fila e o envio ao PC. A chave é só desta função (o PC a cria; não é o token do pareamento): com
 * ela dá para entregar notificações e mais nada. O corpo vai cifrado com AES-256-GCM, então o
 * conteúdo não passa legível pela rede da casa.
 */
internal object Guarda {
  private val fio = Executors.newSingleThreadScheduledExecutor()
  private var marcado: ScheduledFuture<*>? = null
  private var falhas = 0
  private var vistosEmMemoria: Map<String, String>? = null

  private fun prefs(c: Context) = c.getSharedPreferences("elysium.notificacoes", Context.MODE_PRIVATE)

  /** Mensagens e chave ficam fora do backup do Android (a nuvem do Google não as recebe). */
  private fun arquivo(c: Context, nome: String) = File(c.noBackupFilesDir, "elysium-$nome.json")
  private fun ler(c: Context, nome: String) = runCatching { arquivo(c, nome).readText() }.getOrNull()
  private fun escrever(c: Context, nome: String, t: String?) {
    runCatching { if (t == null) arquivo(c, nome).delete() else arquivo(c, nome).writeText(t) }
  }

  fun ligado(c: Context) = prefs(c).getBoolean("ligado", false)
  fun apps(c: Context): Set<String> = prefs(c).getStringSet("apps", null) ?: Filtro.PADRAO
  fun vistos(c: Context): Map<String, String> = vistosEmMemoria ?: lerVistos(c).also { vistosEmMemoria = it }
  private fun lerVistos(c: Context): Map<String, String> = runCatching {
    val j = JSONObject(prefs(c).getString("vistos", "{}") ?: "{}")
    j.keys().asSequence().associateWith { j.getString(it) }
  }.getOrDefault(emptyMap())

  fun viu(c: Context, pacote: String, nome: String) {
    val v = vistos(c)
    if (v[pacote] == nome || v.size > 120) return
    vistosEmMemoria = v + (pacote to nome)
    prefs(c).edit().putString("vistos", JSONObject(vistosEmMemoria!!).toString()).apply()
  }

  fun configurar(c: Context, ligado: Boolean, apps: List<String>?, idDaChave: String?, chave: String?, enderecos: List<String>?) {
    prefs(c).edit().apply {
      putBoolean("ligado", ligado)
      if (apps != null) putStringSet("apps", apps.toSet())
      if (idDaChave != null) putString("idDaChave", idDaChave)
      if (enderecos != null) putString("enderecos", JSONArray(enderecos).toString())
    }.apply()
    if (chave != null) escrever(c, "chave", chave)
    if (!ligado) synchronized(this) { escrever(c, "fila", null) }
    if (ligado) enviar(c)
  }

  @Synchronized
  private fun fila(c: Context): MutableList<JSONObject> {
    val corte = System.currentTimeMillis() - VALIDADE_MS
    val a = runCatching { JSONArray(ler(c, "fila") ?: "[]") }.getOrDefault(JSONArray())
    return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.filter { it.optLong("em") > corte }.toMutableList()
  }

  @Synchronized
  private fun gravar(c: Context, itens: List<JSONObject>) {
    escrever(c, "fila", JSONArray(itens.takeLast(MAXIMO)).toString())
  }

  fun tamanho(c: Context) = fila(c).size

  fun guardar(c: Context, item: JSONObject) {
    synchronized(this) {
      val f = fila(c)
      // A mesma conversa atualizada (mais uma mensagem) troca a anterior que ainda não foi.
      f.removeAll { it.optString("id") == item.optString("id") }
      f.add(item)
      gravar(c, f)
    }
    // 25/11 (bateria): junta o que chega em seguida — um grupo animado acordava o rádio a cada mensagem.
    agendar(c, if (falhas == 0) JUNTAR_S else espera())
  }

  fun enviar(c: Context) = agendar(c, 0)

  /** Sem o PC ao alcance: 30 s, 1, 2, 4… até 15 min. */
  private fun espera(): Long = minOf(900L, 30L shl minOf(falhas, 5))

  @Synchronized
  private fun agendar(c: Context, segundos: Long) {
    val app = c.applicationContext
    val antes = marcado
    if (antes != null && !antes.isDone) {
      if (antes.getDelay(TimeUnit.SECONDS) <= segundos) return
      antes.cancel(false)
    }
    marcado = fio.schedule({ falhas = if (runCatching { tentar(app) }.getOrDefault(false)) 0 else minOf(falhas + 1, 10) }, segundos, TimeUnit.SECONDS)
  }

  /** Endereço da casa só com Wi-Fi ou cabo; fora, só a ponte (127.0.0.1) e o túnel. */
  private fun alcancavel(c: Context, url: String): Boolean {
    if (url.contains("//127.") || url.contains("//100.")) return true
    val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
    val rede = cm.getNetworkCapabilities(cm.activeNetwork ?: return false) ?: return false
    return rede.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || rede.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) || rede.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
  }

  private fun tentar(c: Context): Boolean {
    val p = prefs(c)
    val chave = ler(c, "chave") ?: return false
    val idDaChave = p.getString("idDaChave", null) ?: return false
    val enderecos = JSONArray(p.getString("enderecos", "[]") ?: "[]")
    val itens = fila(c)
    if (itens.isEmpty()) return true
    val claro = JSONObject().put("em", System.currentTimeMillis()).put("itens", JSONArray(itens)).toString().toByteArray(Charsets.UTF_8)
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cifra = Cipher.getInstance("AES/GCM/NoPadding")
    cifra.init(Cipher.ENCRYPT_MODE, SecretKeySpec(Base64.decode(chave, Base64.NO_WRAP), "AES"), GCMParameterSpec(128, iv))
    val corpo = JSONObject()
      .put("k", idDaChave)
      .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
      .put("d", Base64.encodeToString(cifra.doFinal(claro), Base64.NO_WRAP))
      .toString().toByteArray(Charsets.UTF_8)
    for (i in 0 until enderecos.length()) {
      if (!alcancavel(c, enderecos.optString(i))) continue
      if (postar(enderecos.optString(i) + "/api/notificacoes", corpo)) {
        val foram = itens.map { it.optString("id") + it.optLong("em") }.toSet()
        synchronized(this) { gravar(c, fila(c).filter { it.optString("id") + it.optLong("em") !in foram }) }
        return true
      }
    }
    return false
  }

  private fun postar(url: String, corpo: ByteArray): Boolean {
    if (!url.startsWith("http://")) return false
    val con = URL(url).openConnection() as HttpURLConnection
    return try {
      con.connectTimeout = 3500
      // Pela ponte, o primeiro pedido abre o túnel.
      con.readTimeout = if (url.contains("//127.")) 15_000 else 6000
      con.requestMethod = "POST"
      con.doOutput = true
      con.setRequestProperty("Content-Type", "application/json")
      con.setFixedLengthStreamingMode(corpo.size)
      con.outputStream.use { it.write(corpo) }
      con.responseCode == 200
    } catch (_: Exception) {
      false
    } finally {
      con.disconnect()
    }
  }
}
