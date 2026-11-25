package expo.modules.notificacoes

/**
 * O que nunca sai do celular (25/11). Banco, carteira, senha e código de verificação são barrados
 * aqui, antes de qualquer fila — não dependem do PC nem de ajuste. Puro.
 */
internal object Filtro {
  /** Os apps de conversa e e-mail; os outros só entram se ele ligar. */
  val PADRAO = setOf(
    "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.instagram.android", "com.facebook.orca",
    "com.discord", "com.google.android.gm", "com.microsoft.office.outlook", "com.Slack", "com.microsoft.teams",
    "com.twitter.android", "com.instagram.barcelona", "com.snapchat.android", "com.linkedin.android", "com.reddit.frontpage",
  )

  private val APP_PROIBIDO = Regex(
    "bank|banco|nubank|com\\.nu\\.|itau|bradesco|santander|caixa|bancointer|\\binter\\b|picpay|mercadopago|pagbank|pagseguro|c6bank|neon|" +
      "will\\.?bank|sicoob|sicredi|btg|xpinc|binance|coinbase|wallet|authenticator|authy|otp|bitwarden|1password|lastpass|keepass|gov\\.br|" +
      "com\\.android\\.systemui|com\\.android\\.vending|com\\.google\\.android\\.gms",
    RegexOption.IGNORE_CASE,
  )

  private val SEGREDO = Regex(
    "c[oó]digo|\\bcode\\b|senha|password|passcode|\\btoken\\b|\\botp\\b|verifica|verification|autentica|two[- ]?factor|2fa|\\bpin\\b|" +
      "\\bpix\\b|transfer[êe]ncia|cart[aã]o (?:final|de cr[eé]dito)|compra aprovada|\\bsaldo\\b|\\bfatura\\b|\\bcvv\\b|\\bcpf\\b",
    RegexOption.IGNORE_CASE,
  )
  private val NUMERO = Regex("\\d[\\d\\s.-]{2,}")

  fun appProibido(pacote: String) = APP_PROIBIDO.containsMatchIn(pacote)

  /** Código, senha ou dinheiro com número junto: fora. */
  fun temSegredo(texto: String) = SEGREDO.containsMatchIn(texto) && NUMERO.containsMatchIn(texto)
}
