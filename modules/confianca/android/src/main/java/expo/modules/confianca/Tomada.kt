package expo.modules.confianca

import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

/**
 * Enviar e baixar arquivo em TLS (25/11). O `expo-file-system` cria o cliente dele sem passar por
 * fábrica nenhuma e recusa o certificado do PC; então ele fala com uma porta só deste celular, e daqui
 * os mesmos bytes seguem para o PC em TLS — só se o certificado for um dos fixados.
 */
internal object Tomada {
  private val abertas = ConcurrentHashMap<String, ServerSocket>()

  @Synchronized
  fun porta(host: String, porta: Int, fixados: () -> List<String>): Int {
    val chave = "$host:$porta"
    abertas[chave]?.takeIf { !it.isClosed }?.let { return it.localPort }
    val s = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
    abertas[chave] = s
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(SoFixados(fixados)), null) }
    fio {
      while (!s.isClosed) {
        val daqui = runCatching { s.accept() }.getOrNull() ?: break
        fio { ligar(daqui, ssl, host, porta) }
      }
    }
    return s.localPort
  }

  private fun fio(f: () -> Unit) = Thread({ runCatching(f) }, "tomada").apply { isDaemon = true; start() }

  private fun ligar(daqui: Socket, ssl: SSLContext, host: String, porta: Int) {
    val cru = Socket()
    try {
      cru.connect(InetSocketAddress(host, porta), 8000)
      val la = ssl.socketFactory.createSocket(cru, host, porta, true) as SSLSocket
      la.startHandshake()
      fio { passar(la, daqui) }
      passar(daqui, la)
    } catch (_: Exception) {
      runCatching { daqui.close() }
      runCatching { cru.close() }
    }
  }

  /** Um lado acabou: fecha os dois (cada pedido de arquivo é uma conexão). */
  private fun passar(de: Socket, para: Socket) {
    try {
      val b = ByteArray(32 * 1024)
      val ent = de.getInputStream()
      val sai = para.getOutputStream()
      while (true) {
        val n = ent.read(b)
        if (n < 0) break
        sai.write(b, 0, n)
        sai.flush()
      }
    } catch (_: Exception) {
    } finally {
      runCatching { de.close() }
      runCatching { para.close() }
    }
  }

  private class SoFixados(private val fixados: () -> List<String>) : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) = throw CertificateException("não é servidor")
    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
      val sha = MessageDigest.getInstance("SHA-256").digest(chain[0].encoded).joinToString("") { "%02x".format(it) }
      if (sha !in fixados()) throw CertificateException("certificado que não é o do PC")
    }
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }
}
