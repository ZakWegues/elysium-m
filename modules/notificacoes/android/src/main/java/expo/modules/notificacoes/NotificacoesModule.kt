package expo.modules.notificacoes

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificacoesModule : Module() {
  private val contexto: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Notificacoes")

    Function("temAcesso") {
      val lista = Settings.Secure.getString(contexto.contentResolver, "enabled_notification_listeners") ?: ""
      lista.split(":").any { ComponentName.unflattenFromString(it)?.packageName == contexto.packageName }
    }

    /** A tela do acesso a notificações deste app. */
    Function("abrirAcesso") {
      val alvo = ComponentName(contexto, Escuta::class.java)
      val i = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, alvo.flattenToString())
      } else Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { contexto.startActivity(i) }
        .recoverCatching { contexto.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        .isSuccess
    }

    /** Os detalhes do app: é lá que fica "Permitir configurações restritas" (app instalado por APK). */
    Function("abrirDetalhes") {
      runCatching {
        contexto.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", contexto.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }.isSuccess
    }

    Function("configurar") { ligado: Boolean, apps: List<String>?, idDaChave: String?, chave: String?, enderecos: List<String>? ->
      Guarda.configurar(contexto, ligado, apps, idDaChave, chave, enderecos)
    }

    Function("estado") {
      mapOf(
        "ligado" to Guarda.ligado(contexto),
        "ativo" to (Escuta.atual != null),
        "naFila" to Guarda.tamanho(contexto),
        "apps" to Guarda.apps(contexto).toList(),
        "vistos" to Guarda.vistos(contexto).map { mapOf("pacote" to it.key, "nome" to it.value) },
      )
    }

    Function("enviarAgora") { Guarda.enviar(contexto) }

    Function("responder") { chave: String, texto: String -> Escuta.atual?.responder(chave, texto.take(1000)) ?: false }
  }
}
