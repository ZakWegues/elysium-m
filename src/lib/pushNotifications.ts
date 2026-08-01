import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
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
 * Em emulador não funciona: push exige aparelho físico.
 */

// Com o app aberto, mostra a notificação em vez de engolir em silêncio — o padrão do
// expo-notifications é não exibir nada quando o app está em primeiro plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string };

function projectId(): string | undefined {
  // Em build standalone (EAS) o id vem daqui; em Expo Go pode não existir, e aí a
  // chamada de token falha com uma mensagem pouco óbvia.
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function registerForPush(pairing: Pairing): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'push só funciona em aparelho físico' };
  }

  // O Android exige um canal declarado, senão a notificação chega sem som nem
  // prioridade e o usuário acha que não chegou.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'NEUROAXIS',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return { status: 'denied' };

  const id = projectId();
  if (!id) {
    return { status: 'unsupported', reason: 'projeto EAS não configurado (necessário para build standalone)' };
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
