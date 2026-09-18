import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { sincronizarNotificacoes } from './notificacoes';

/**
 * A tarefa de segundo plano (bloco 72): com o app fechado, o Android acorda o JS pelo
 * WorkManager de tempos em tempos (inexato; no mínimo 15 min, na prática 15–60) e ela
 * puxa a fila de entregas do PC e espelha os lembretes.
 *
 * 🔴 `defineTask` PRECISA rodar no escopo de módulo, no arranque — é assim que o
 * TaskManager acha o executor quando o processo é criado só para a tarefa, sem UI.
 * Por isso este arquivo é importado no `index.ts`, antes do App.
 *
 * O registro (`registrarTarefa`) é idempotente e roda a cada abertura com pareamento.
 * Sem pareamento a tarefa roda e sai em silêncio (`sincronizarNotificacoes` devolve 0).
 */
export const TAREFA_ENTREGAS = 'elysium-entregas';

TaskManager.defineTask(TAREFA_ENTREGAS, async () => {
  try {
    const { novas } = await sincronizarNotificacoes();
    console.log('[segundo-plano] sincronizado, novas:', novas);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn('[segundo-plano] falhou', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registrarTarefa(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(TAREFA_ENTREGAS))) {
      await BackgroundTask.registerTaskAsync(TAREFA_ENTREGAS, { minimumInterval: 15 });
    }
    return true;
  } catch (err) {
    console.warn('[segundo-plano] não registrou', err);
    return false;
  }
}
