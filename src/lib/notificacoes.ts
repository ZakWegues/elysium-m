import { chavePorPc } from './pcAtivo';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { loadPairing, Pairing } from './pairing';
import { callRpc, Entrega, Reminder } from './rpc';

/**
 * Notificações LOCAIS do celular — o que chega mesmo sem push pela nuvem (bloco 72).
 *
 * O push pela Expo (`pushNotifications.ts`) exige credenciais FCM no projeto EAS e nunca
 * foi validado. O caminho que funciona sem nada na nuvem é este, em três partes:
 *
 * 1. **A fila do PC.** Rotinas executadas e lembretes disparados ficam em
 *    `notify.pending` até este aparelho confirmar (`notify.ack`). `buscarEntregas()` puxa,
 *    mostra como notificação local e confirma. Roda quando o app volta ao primeiro plano,
 *    a cada 60 s enquanto está aberto, e em segundo plano pelo WorkManager (ver
 *    `tarefaSegundoPlano.ts`) — inexato, no mínimo a cada 15 min.
 *
 * 2. **O WebSocket.** Com o Chat aberto há um WS vivo; o PC manda `{type:"notify"}` na
 *    hora e `stream.ts` chama `receberEntrega()` direto. Sem esperar o próximo ciclo.
 *
 * 3. **Os lembretes espelhados.** `espelharLembretes()` agenda cada lembrete pendente do
 *    PC como notificação local COM HORA. É o que toca com o celular longe do PC, sem
 *    rede nenhuma — o lembrete já está no aparelho. Para não tocar duas vezes quando o
 *    PC também está ao alcance, uma entrega de tipo `lembrete` cujo `ref` está espelhado
 *    é confirmada sem ser mostrada.
 *
 * Nada aqui importa `expo-notifications` no topo do arquivo — ver `pushNotifications.ts`:
 * o módulo derruba o Expo Go na importação. Entra por import dinâmico.
 */

const CHAVE_VISTAS = () => chavePorPc('elysium_entregas_vistas_v1');
const CHAVE_ESPELHADOS = () => chavePorPc('elysium_lembretes_espelhados_v1');
const CHAVE_ATIVAS = 'elysium_notificacoes_ativas_v1';
const MAX_VISTAS = 120;
const CANAL = 'elysium-entregas';

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

type Notifications = typeof import('expo-notifications');
let moduloPromise: Promise<Notifications | null> | null = null;

async function modulo(): Promise<Notifications | null> {
  if (isExpoGo()) return null;
  if (!moduloPromise) {
    moduloPromise = (async () => {
      const N = await import('expo-notifications');
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
        }),
      });
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync(CANAL, {
          name: 'Rotinas e lembretes',
          description: 'O que o ELYSIUM entrega do PC: rotinas executadas e lembretes.',
          importance: N.AndroidImportance.HIGH,
          vibrationPattern: [0, 200, 120, 200],
        });
      }
      return N;
    })();
  }
  return moduloPromise;
}

/** Pede a permissão uma vez. Devolve false no Expo Go ou se o usuário negou. */
export async function pedirPermissao(): Promise<boolean> {
  const N = await modulo();
  if (!N) return false;
  const atual = await N.getPermissionsAsync();
  if (atual.granted) return true;
  return (await N.requestPermissionsAsync()).granted;
}

export async function notificacoesAtivas(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(CHAVE_ATIVAS)) !== '0'; } catch { return true; }
}

export async function definirNotificacoesAtivas(v: boolean): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE_ATIVAS, v ? '1' : '0'); } catch { /* segue */ }
}

async function lerLista(chave: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(chave);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista.map(String) : [];
  } catch { return []; }
}

async function gravarLista(chave: string, lista: string[]): Promise<void> {
  try { await AsyncStorage.setItem(chave, JSON.stringify(lista)); } catch { /* segue */ }
}

/** Mostra uma entrega agora. Não lança: falha de notificação nunca derruba quem chamou. */
export async function mostrarEntrega(e: Entrega): Promise<void> {
  const N = await modulo();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: e.tipo === 'lembrete' ? `Lembrete: ${e.titulo}` : e.titulo,
        body: e.corpo,
        data: { tipo: e.tipo, ref: e.ref ?? null, entregaId: e.id },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[notificacoes] falha ao mostrar', err);
  }
}

/**
 * Uma entrega que chegou (pelo WS ou pela fila). Mostra se ainda não foi vista, e devolve
 * se deve ser confirmada ao PC. Lembrete já espelhado no aparelho: confirma sem mostrar.
 */
export async function receberEntrega(e: Entrega, pairing?: Pairing | null): Promise<void> {
  if (!(await notificacoesAtivas())) return;
  const vistas = await lerLista(CHAVE_VISTAS());
  if (!vistas.includes(e.id)) {
    const espelhados = e.tipo === 'lembrete' && e.ref ? await lerLista(CHAVE_ESPELHADOS()) : [];
    if (!(e.ref && espelhados.includes(e.ref))) await mostrarEntrega(e);
    vistas.push(e.id);
    await gravarLista(CHAVE_VISTAS(), vistas.slice(-MAX_VISTAS));
  }
  if (pairing) {
    try { await callRpc(pairing, 'notify.ack', { ids: [e.id] }, { timeoutMs: 6000 }); } catch { /* o próximo ciclo confirma */ }
  }
}

/** Puxa a fila do PC. Devolve quantas entregas novas mostrou. */
export async function buscarEntregas(pairing: Pairing): Promise<number> {
  if (!(await notificacoesAtivas())) return 0;
  const { entregas } = await callRpc(pairing, 'notify.pending', {}, { timeoutMs: 8000 });
  if (!entregas.length) return 0;
  const vistas = await lerLista(CHAVE_VISTAS());
  const espelhados = await lerLista(CHAVE_ESPELHADOS());
  let novas = 0;
  for (const e of entregas) {
    if (vistas.includes(e.id)) continue;
    const jaNoAparelho = e.tipo === 'lembrete' && e.ref && espelhados.includes(e.ref);
    if (!jaNoAparelho) { await mostrarEntrega(e); novas++; }
    vistas.push(e.id);
  }
  await gravarLista(CHAVE_VISTAS(), vistas.slice(-MAX_VISTAS));
  try { await callRpc(pairing, 'notify.ack', { ids: entregas.map(e => e.id) }, { timeoutMs: 6000 }); } catch { /* fica na fila, as vistas seguram a duplicata */ }
  return novas;
}

/**
 * Espelha os lembretes pendentes do PC como notificações locais com hora. Cancela os que
 * sumiram (cancelados ou já disparados). Só os `once` com hora futura: um `weekly` é
 * reagendado pelo PC a cada disparo e cairia aqui na próxima sincronização.
 */
export async function espelharLembretes(pairing: Pairing): Promise<void> {
  if (!(await notificacoesAtivas())) return;
  const N = await modulo();
  if (!N) return;
  const { reminders } = await callRpc(pairing, 'reminders.list', {}, { timeoutMs: 8000 });
  const agora = Date.now();
  const alvo = (reminders as Reminder[]).filter(r => !r.firedAt && r.dueAt > agora + 15_000);
  const antes = await lerLista(CHAVE_ESPELHADOS());
  const querendo = new Set(alvo.map(r => r.id));

  for (const id of antes) {
    if (!querendo.has(id)) { try { await N.cancelScheduledNotificationAsync(`lembrete-${id}`); } catch { /* já foi */ } }
  }
  for (const r of alvo) {
    if (antes.includes(r.id)) continue;
    try {
      await N.scheduleNotificationAsync({
        identifier: `lembrete-${r.id}`,
        content: {
          title: 'Lembrete',
          body: r.text,
          data: { tipo: 'lembrete', ref: r.id },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(r.dueAt) },
      });
    } catch (err) {
      console.warn('[notificacoes] falha ao espelhar lembrete', err);
    }
  }
  await gravarLista(CHAVE_ESPELHADOS(), alvo.map(r => r.id));
}

/** O ciclo completo, tolerante a falha. Usado pelo primeiro plano e pelo segundo plano. */
export async function sincronizarNotificacoes(pairing?: Pairing | null): Promise<{ novas: number }> {
  const p = pairing ?? (await loadPairing());
  if (!p) return { novas: 0 };
  let novas = 0;
  try { novas = await buscarEntregas(p); } catch (err) { console.log('[notificacoes] fila indisponível', (err as Error).message); }
  try { await espelharLembretes(p); } catch (err) { console.log('[notificacoes] lembretes indisponíveis', (err as Error).message); }
  return { novas };
}

/**
 * Primeiro plano: sincroniza ao voltar para o app e a cada 60 s enquanto ele está visível.
 * Devolve a função de desligar.
 */
export function ligarSincronizacaoEmPrimeiroPlano(pairing: Pairing): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const rodar = () => { sincronizarNotificacoes(pairing).catch(() => {}); };
  const ligar = () => { if (!timer) { rodar(); timer = setInterval(rodar, 60_000); } };
  const desligar = () => { if (timer) { clearInterval(timer); timer = null; } };
  const sub = AppState.addEventListener('change', s => { if (s === 'active') ligar(); else desligar(); });
  if (AppState.currentState === 'active') ligar();
  return () => { desligar(); sub.remove(); };
}
