import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Pairing } from './pairing';
import { callRpc } from './rpc';

/**
 * Notificações push.
 *
 * O PC envia pelo serviço da Expo, não pela rede local — é isso que faz um lembrete
 * chegar com o celular no 4G, longe de casa. O resto do app precisa da mesma rede ou
 * do túnel; a notificação não.
 *
 * ## Por que nada de `expo-notifications` no topo do arquivo
 *
 * A partir do SDK 53 a Expo removeu push do Expo Go, e o módulo **quebra ao ser
 * importado** lá — não ao ser usado. Como este arquivo é importado pela tela de
 * Ajustes, um import estático derrubava o app inteiro na abertura, antes de desenhar
 * qualquer coisa. Por isso o módulo entra por import dinâmico, e só depois de
 * confirmar que não estamos no Expo Go.
 *
 * Consequência prática: push só funciona em build de desenvolvimento ou no APK. Isso
 * não é contornável — é uma decisão da Expo, não uma configuração.
 */

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string };

/**
 * Detecta o Expo Go — e só ele.
 *
 * Usa `appOwnership`, que a Expo marca como deprecado em favor de
 * `executionEnvironment`. O substituto não serve aqui: ele devolve `storeClient` tanto
 * para o Expo Go quanto para um build de desenvolvimento, e o build de
 * desenvolvimento é justamente onde push FUNCIONA. Trocar pelo campo novo bloquearia
 * a feature no ambiente certo. `appOwnership` devolve `"expo"` apenas no Expo Go.
 */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

function projectId(): string | undefined {
  // Em build standalone (EAS) o id vem daqui; sem ele o pedido de token falha com uma
  // mensagem pouco óbvia.
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Só chamado depois de descartar o Expo Go — ver o comentário no topo. */
async function loadNotifications() {
  const Notifications = await import('expo-notifications');

  // Com o app aberto, mostra a notificação em vez de engolir em silêncio: o padrão do
  // expo-notifications é não exibir nada em primeiro plano.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return Notifications;
}

export async function registerForPush(pairing: Pairing): Promise<PushRegistration> {
  if (isExpoGo()) {
    return {
      status: 'unsupported',
      reason: 'O Expo Go não suporta mais notificações push. Funciona no APK ou num build de desenvolvimento.',
    };
  }

  const Device = await import('expo-device');
  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'Push só funciona em aparelho físico.' };
  }

  const Notifications = await loadNotifications();

  // O Android exige um canal declarado, senão a notificação chega sem som nem
  // prioridade e o usuário acha que não chegou.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'ELYSIUM-M',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return { status: 'denied' };

  const id = projectId();
  if (!id) {
    return { status: 'unsupported', reason: 'Projeto EAS não configurado — necessário para o build.' };
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch (err) {
    return { status: 'unsupported', reason: String(err) };
  }

  await callRpc(pairing, 'push.register', { token });
  return { status: 'registered', token };
}

export async function unregisterFromPush(pairing: Pairing, token: string): Promise<void> {
  await callRpc(pairing, 'push.unregister', { token });
}

/** Para a tela de Ajustes explicar a situação antes de o usuário tentar. */
export function pushAvailability(): { available: boolean; reason?: string } {
  if (isExpoGo()) {
    return {
      available: false,
      reason: 'Rodando no Expo Go — push só funciona no APK ou em build de desenvolvimento.',
    };
  }
  return { available: true };
}
