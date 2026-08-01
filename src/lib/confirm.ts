/**
 * Guarda de confirmação para ações destrutivas (desligar o PC, matar processo,
 * fechar app).
 *
 * O celular fica desbloqueado no bolso e a tela de controle tem botões que derrubam
 * a máquina. A biometria aqui é trava contra toque acidental e contra quem pega o
 * aparelho já destravado — não contra quem tem o token, que fala direto com a API.
 *
 * Sem hardware biométrico cadastrado, cai num Alert de confirmação: melhor uma
 * pergunta explícita do que deixar a ação passar direto.
 */

import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export type ConfirmResult = 'confirmed' | 'cancelled';

async function biometricsAvailable(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

function askWithAlert(title: string, message: string): Promise<ConfirmResult> {
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve('cancelled') },
      { text: 'Confirmar', style: 'destructive', onPress: () => resolve('confirmed') },
    ]);
  });
}

/**
 * Devolve 'confirmed' apenas quando a identidade foi validada (ou o usuário
 * confirmou explicitamente no fallback). Quem chama só manda `confirmed: true`
 * pro RPC nesse caso.
 */
export async function confirmDestructive(
  title: string,
  message: string
): Promise<ConfirmResult> {
  if (!(await biometricsAvailable())) {
    return askWithAlert(title, message);
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: title,
      cancelLabel: 'Cancelar',
      // Deixa o usuário cair no PIN/padrão do aparelho quando a digital falha,
      // em vez de travar a ação por completo.
      disableDeviceFallback: false,
    });
    return result.success ? 'confirmed' : 'cancelled';
  } catch {
    return askWithAlert(title, message);
  }
}
