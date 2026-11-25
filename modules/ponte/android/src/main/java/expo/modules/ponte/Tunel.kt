package expo.modules.ponte

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

internal class ConfigDaPonte(val url: String, val sala: String, val psk: ByteArray, val credencial: String, val porta: Int)

private const val ABRIR = 1
private const val DADOS = 2
private const val FIM = 3
private const val CORTE = 4
private const val CREDITO = 5
private const val JANELA = 512 * 1024
private const val PEDACO = 60 * 1024
/** Sem conexão nenhuma por este tempo, o túnel fecha (bateria). */
private const val OCIOSO_S = 20L
private const val ESPERA_S = 12L

private fun quadro(tipo: Int, id: Int, dados: ByteArray = ByteArray(0), de: Int = 0, n: Int = dados.size): ByteArray =
  ByteArray(5 + n).also { ByteBuffer.wrap(it).put(tipo.toByte()).putInt(id).put(dados, de, n) }

private fun u32(n: Int) = ByteBuffer.allocate(4).putInt(n).array()

/**
 * O celular fora de casa (25/11). O app fala com `127.0.0.1` na mesma porta do PC; aqui cada conexão
 * vira um fluxo cifrado num WebSocket só, até a ponte do dono. Só abre quando alguém usa e fecha
 * 20 s depois do último uso: parado, não gasta nada.
 */
internal class Tunel(private val cfg: ConfigDaPonte) {
  private val fios = Executors.newCachedThreadPool { r -> Thread(r, "ponte").apply { isDaemon = true } }
  private val relogio = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "ponte-relogio").apply { isDaemon = true } }
  private val cliente = OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS).pingInterval(25, TimeUnit.SECONDS).build()
  private val proximo = AtomicInteger(1)
  private var porta: ServerSocket? = null
  private var conversa: Conversa? = null
  @Volatile var erro: String? = null
    private set
  @Volatile private var parado = false

  val escutando get() = porta?.isClosed == false
  val aberta get() = conversa?.pronta == true

  fun ligar() {
    try {
      porta = ServerSocket(cfg.porta, 32, InetAddress.getByName("127.0.0.1"))
    } catch (e: Exception) {
      erro = "a porta ${cfg.porta} do celular está ocupada"
      return
    }
    fios.execute {
      while (!parado) {
        val s = try { porta!!.accept() } catch (_: Exception) { break }
        fios.execute { runCatching { atender(s) }.onFailure { runCatching { s.close() } } }
      }
    }
  }

  fun desligar() {
    parado = true
    runCatching { porta?.close() }
    conversa?.acabar("desligada")
    fios.shutdownNow()
    relogio.shutdownNow()
  }

  private fun atender(s: Socket) {
    s.tcpNoDelay = true
    val c = conversaPronta() ?: run { s.close(); return }
    c.novoFluxo(s)
  }

  private fun conversaPronta(): Conversa? {
    val c = synchronized(this) {
      conversa?.takeIf { !it.acabou } ?: Conversa().also { conversa = it }
    }
    c.esperar.await(ESPERA_S, TimeUnit.SECONDS)
    if (!c.pronta) { c.acabar("não abriu a tempo"); return null }
    return c
  }

  /** Um WebSocket com a ponte, do olá até fechar. */
  private inner class Conversa : WebSocketListener() {
    val esperar = CountDownLatch(1)
    @Volatile var pronta = false
    @Volatile var acabou = false
    private val ola = Ola(cfg.psk)
    @Volatile private var chaves: Chaves? = null
    private val fluxos = ConcurrentHashMap<Int, Fluxo>()
    private val ws: WebSocket = cliente.newWebSocket(
      Request.Builder().url("${cfg.url.replaceFirst("http", "ws")}/cel/${cfg.sala}").header("Authorization", "Bearer ${cfg.credencial}").build(),
      this,
    )

    override fun onOpen(webSocket: WebSocket, response: Response) { webSocket.send(ola.pacote().toByteString()) }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      try {
        val k = chaves
        if (k == null) {
          chaves = ola.terminar(bytes.toByteArray()) ?: throw IllegalStateException("quem respondeu não é o PC")
          pronta = true
          erro = null
          esperar.countDown()
          marcarOcio()
        } else receber(k.recebe.abrir(bytes.toByteArray()))
      } catch (e: Exception) {
        acabar(e.message ?: "pacote inválido")
      }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) =
      acabar(if (response != null) "a ponte respondeu ${response.code}" else (t.message ?: "sem conexão"))

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) = acabar("fechou ($code)")

    fun acabar(motivo: String) {
      synchronized(this@Tunel) {
        if (acabou) return
        acabou = true
        pronta = false
        if (conversa === this) conversa = null
      }
      erro = motivo
      esperar.countDown()
      runCatching { ws.close(1000, null) }
      runCatching { ws.cancel() }
      for (f in fluxos.values) f.fecharTudo()
      fluxos.clear()
    }

    private fun marcarOcio() {
      if (parado) return
      runCatching { relogio.schedule({ if (pronta && fluxos.isEmpty()) acabar("ociosa") }, OCIOSO_S, TimeUnit.SECONDS) }
    }

    /** A ordem de cifrar tem de ser a ordem de mandar: um de cada vez. */
    @Synchronized
    private fun mandar(q: ByteArray) {
      val k = chaves ?: return
      if (!ws.send(k.envia.fechar(q).toByteString())) acabar("fila cheia")
    }

    fun novoFluxo(s: Socket) {
      val id = proximo.getAndIncrement()
      val f = Fluxo(id, s)
      fluxos[id] = f
      mandar(quadro(ABRIR, id))
      fios.execute { f.lerDoApp() }
      f.escreverNoApp()
    }

    private fun receber(q: ByteArray) {
      if (q.size < 5) return
      val id = ByteBuffer.wrap(q, 1, 4).int
      val f = fluxos[id]
      when (q[0].toInt()) {
        DADOS -> if (f != null) f.chegou.put(q) else mandar(quadro(CORTE, id))
        FIM -> f?.chegou?.put(NADA)
        CORTE -> f?.fecharTudo()
        CREDITO -> if (q.size == 9) f?.ganhou(ByteBuffer.wrap(q, 5, 4).int)
      }
    }

    private inner class Fluxo(val id: Int, val s: Socket) {
      val chegou = LinkedBlockingQueue<ByteArray>()
      private val trava = Object()
      private var credito = JANELA
      @Volatile private var fechado = false
      private var leuTudo = false
      private var recebeuTudo = false

      fun ganhou(n: Int) = synchronized(trava) { credito += n; trava.notifyAll() }

      fun lerDoApp() {
        val b = ByteArray(PEDACO)
        try {
          val ent = s.getInputStream()
          while (!fechado) {
            val livre = synchronized(trava) {
              while (credito <= 0 && !fechado) trava.wait()
              minOf(credito, PEDACO)
            }
            if (fechado) return
            val n = ent.read(b, 0, livre)
            if (n < 0) break
            synchronized(trava) { credito -= n }
            mandar(quadro(DADOS, id, b, 0, n))
          }
          if (!fechado) mandar(quadro(FIM, id))
          leuTudo = true
          seAcabou()
        } catch (_: Exception) {
          cortar()
        }
      }

      fun escreverNoApp() {
        var devolver = 0
        try {
          val sai = s.getOutputStream()
          while (!fechado) {
            val q = chegou.take()
            if (q === NADA) break
            sai.write(q, 5, q.size - 5)
            devolver += q.size - 5
            if (devolver >= JANELA / 4) { mandar(quadro(CREDITO, id, u32(devolver))); devolver = 0 }
          }
          runCatching { s.shutdownOutput() }
          recebeuTudo = true
          seAcabou()
        } catch (_: Exception) {
          cortar()
        }
      }

      private fun seAcabou() { if (leuTudo && recebeuTudo) fecharTudo() }

      private fun cortar() {
        if (fechado) return
        mandar(quadro(CORTE, id))
        fecharTudo()
      }

      fun fecharTudo() {
        fechado = true
        synchronized(trava) { trava.notifyAll() }
        chegou.offer(NADA)
        runCatching { s.close() }
        if (fluxos.remove(id) != null && fluxos.isEmpty()) marcarOcio()
      }
    }
  }

  companion object { private val NADA = ByteArray(0) }
}
