package expo.modules.ponte

import java.math.BigInteger
import java.nio.ByteBuffer
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * A cifra da ponte (25/11) — a mesma conta do PC (`elysium/src/services/ponteCripto.ts`; mudar uma é
 * mudar a outra). Troca de chaves nova a cada conexão, provada com a chave do token; depois,
 * AES-256-GCM com contador em cada sentido.
 */
internal const val TAM_OLA = 114

private fun hmac(chave: ByteArray, vararg partes: ByteArray): ByteArray {
  val m = Mac.getInstance("HmacSHA256")
  m.init(SecretKeySpec(chave, "HmacSHA256"))
  for (p in partes) m.update(p)
  return m.doFinal()
}

private fun fixo(n: BigInteger): ByteArray {
  val b = n.toByteArray()
  val r = ByteArray(32)
  if (b.size <= 32) b.copyInto(r, 32 - b.size) else b.copyInto(r, 0, b.size - 32)
  return r
}

internal class Sentido(private val chave: ByteArray) {
  private var n = 0L

  private fun cifra(modo: Int): Cipher {
    val iv = ByteBuffer.allocate(12).putInt(0).putLong(n++).array()
    return Cipher.getInstance("AES/GCM/NoPadding").apply { init(modo, SecretKeySpec(chave, "AES"), GCMParameterSpec(128, iv)) }
  }

  @Synchronized
  fun fechar(claro: ByteArray): ByteArray {
    val c = cifra(Cipher.ENCRYPT_MODE).doFinal(claro)
    return ByteArray(c.size + 1).also { it[0] = 3; c.copyInto(it, 1) }
  }

  /** Lança se o pacote foi mexido. */
  fun abrir(pacote: ByteArray): ByteArray {
    require(pacote.size >= 17 && pacote[0] == 3.toByte()) { "pacote inválido" }
    return cifra(Cipher.DECRYPT_MODE).doFinal(pacote, 1, pacote.size - 1)
  }
}

internal class Chaves(val envia: Sentido, val recebe: Sentido)

/** O olá do celular e a conferência da resposta do PC. */
internal class Ola(private val psk: ByteArray) {
  private val par = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1"), SecureRandom()) }.generateKeyPair()
  private val nonceC = ByteArray(16).also { SecureRandom().nextBytes(it) }
  private val pubC: ByteArray = (par.public as ECPublicKey).w.let { byteArrayOf(4) + fixo(it.affineX) + fixo(it.affineY) }

  fun pacote(): ByteArray = byteArrayOf(1) + pubC + nonceC + hmac(psk, "ponte1-c".toByteArray(), pubC, nonceC)

  /** null = quem respondeu não é o PC. */
  fun terminar(r: ByteArray): Chaves? {
    if (r.size != TAM_OLA || r[0] != 2.toByte()) return null
    val pubS = r.copyOfRange(1, 66)
    val nonceS = r.copyOfRange(66, 82)
    val esperado = hmac(psk, "ponte1-s".toByteArray(), pubC, nonceC, pubS, nonceS)
    if (!MessageDigest.isEqual(esperado, r.copyOfRange(82, TAM_OLA)) || pubS[0] != 4.toByte()) return null
    val curva = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }.getParameterSpec(ECParameterSpec::class.java)
    val ponto = ECPoint(BigInteger(1, pubS.copyOfRange(1, 33)), BigInteger(1, pubS.copyOfRange(33, 65)))
    val chave = KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ponto, curva))
    val segredo = KeyAgreement.getInstance("ECDH").run { init(par.private); doPhase(chave, true); generateSecret() }
    val prk = hmac(nonceC + nonceS, segredo, psk)
    val um = byteArrayOf(1)
    return Chaves(Sentido(hmac(prk, "c2s".toByteArray(), um)), Sentido(hmac(prk, "s2c".toByteArray(), um)))
  }
}
