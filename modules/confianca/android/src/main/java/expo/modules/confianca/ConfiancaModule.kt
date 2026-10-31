package expo.modules.confianca

import android.content.Context
import com.facebook.react.modules.network.CustomClientBuilder
import com.facebook.react.modules.network.NetworkingModule
import com.facebook.react.modules.websocket.WebSocketModule
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.internal.tls.OkHostnameVerifier
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.concurrent.CopyOnWriteArraySet
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * TLS com o PC por fixação de certificado (31/10, APK 2.6.0). Substitui o `cor-do-sistema`.
 *
 * O PC tem um certificado próprio, que nenhuma autoridade assinou. O JS (lib/tls.ts) recebe a
 * impressão SHA-256 dele num pedido assinado, confere com o token e chama `fixar`. Daí em diante,
 * o fetch e o WebSocket do React Native (os dois aceitam um `CustomClientBuilder`, aplicado a cada
 * pedido) aceitam esse certificado — e SÓ ele fora da cadeia normal. Qualquer outro https (Expo,
 * atualizações) continua pela confiança padrão do Android.
 */
class ConfiancaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Confianca")

    OnCreate {
      appContext.reactContext?.let { Fixacao.carregar(it) }
      Fixacao.instalar()
    }

    Function("fixar") { sha256: String ->
      val ctx = appContext.reactContext ?: return@Function false
      Fixacao.fixar(ctx, sha256.lowercase())
    }

    Function("fixados") {
      Fixacao.lista()
    }
  }
}

internal object Fixacao {
  private const val PREFS = "elysium_confianca"
  private const val CHAVE = "fixados"
  /** Um por PC pareado (o app guarda até 5) — e um certificado renovado não apaga o anterior na hora. */
  private const val MAXIMO = 8
  private val SHA = Regex("^[0-9a-f]{64}$")

  private val fixados = CopyOnWriteArraySet<String>()
  @Volatile private var instalado = false

  fun carregar(ctx: Context) {
    val salvos = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CHAVE, "") ?: ""
    salvos.split(',').filter { SHA.matches(it) }.forEach { fixados.add(it) }
  }

  fun fixar(ctx: Context, sha256: String): Boolean {
    if (!SHA.matches(sha256)) return false
    fixados.remove(sha256)
    fixados.add(sha256)
    while (fixados.size > MAXIMO) fixados.remove(fixados.first())
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CHAVE, fixados.joinToString(",")).apply()
    return true
  }

  fun lista(): List<String> = fixados.toList()

  private fun impressao(cert: java.security.cert.Certificate): String =
    MessageDigest.getInstance("SHA-256").digest(cert.encoded).joinToString("") { "%02x".format(it) }

  @Synchronized
  fun instalar() {
    if (instalado) return
    instalado = true
    val fabrica = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    fabrica.init(null as KeyStore?)
    val padrao = fabrica.trustManagers.filterIsInstance<X509TrustManager>().first()

    val confianca = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) =
        padrao.checkClientTrusted(chain, authType)

      override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        // O certificado do PC, fixado: aceito. Qualquer outro: a cadeia normal do Android decide.
        if (chain.isNotEmpty() && fixados.contains(impressao(chain[0]))) return
        padrao.checkServerTrusted(chain, authType)
      }

      override fun getAcceptedIssuers(): Array<X509Certificate> = padrao.acceptedIssuers
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(confianca), null) }
    // O certificado do PC não leva o IP no nome; fixado, o nome não importa (a impressão já é a prova).
    val nomes = HostnameVerifier { host, sessao ->
      val primeiro = runCatching { sessao.peerCertificates.firstOrNull() }.getOrNull()
      if (primeiro != null && fixados.contains(impressao(primeiro))) true
      else OkHostnameVerifier.verify(host, sessao)
    }
    val builder = CustomClientBuilder { b -> b.sslSocketFactory(ssl.socketFactory, confianca).hostnameVerifier(nomes) }
    NetworkingModule.setCustomClientBuilder(builder)
    WebSocketModule.setCustomClientBuilder(builder)
  }
}
