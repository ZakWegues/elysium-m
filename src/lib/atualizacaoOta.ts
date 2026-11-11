import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Atualização pelo ar que chega de verdade (07/10).
 *
 * O `expo-updates` sozinho baixa o OTA em segundo plano na abertura e só o usa na PRÓXIMA
 * abertura a frio. No Android "fechar o app" quase nunca é abertura a frio, então o dono
 * ficava dias no bundle velho — viu o botão de fone da mão livre depois de ela ter saído.
 * O app nunca chamava a API: só lia o `updateId` para mostrar em Ajustes.
 *
 * Agora:
 *  - procura ao abrir e ao voltar ao app (no máximo a cada 15 min) e baixa na hora;
 *  - com uma pronta, o App mostra "Reiniciar agora" (`useUpdates().isUpdatePending`);
 *  - voltou de mais de 30 MIN fora com uma pronta pendente e nada em andamento: aplica sozinho.
 *
 * 21/10: eram 30 s, e o dono reclamou que "minimizar cancela ou reinicia tudo" — era isto,
 * reiniciando o app no meio de uma conversa. Agora só depois de meia hora fora, e nunca com
 * resposta chegando, gravação ou modo live (`marcarOcupado`). O resto fica para o
 * "Reiniciar agora" ou a próxima abertura.
 */

const INTERVALO_MS = 15 * 60_000;
const FORA_PARA_APLICAR_MS = 30 * 60_000;

/** O que está em andamento e não pode ser interrompido por um reinício (chat, live, gravação). */
const ocupados = new Set<string>();
export function marcarOcupado(chave: string, ocupado: boolean): void {
  if (ocupado) ocupados.add(chave); else ocupados.delete(chave);
}

let ultimaProcura = 0;

/**
 * Fluxos que tiram o app da frente DE PROPÓSITO (revisão de 07/10): seletor de arquivo,
 * instalador do APK, tela de permissão, menu de compartilhar. Voltar deles não é "voltei ao
 * app depois de um tempo" — reiniciar ali perderia o anexo ou o alerta em andamento.
 */
let fluxosAbertos = 0;
let fluxoTerminouEm = 0;
export async function emFluxoExterno<T>(acao: () => Promise<T>): Promise<T> {
  fluxosAbertos++;
  try { return await acao(); } finally { fluxosAbertos--; fluxoTerminouEm = Date.now(); }
}
export function podeAplicarSozinho(): boolean {
  return fluxosAbertos === 0 && ocupados.size === 0 && Date.now() - fluxoTerminouEm > 60_000;
}
let procurando: Promise<ResultadoOta> | null = null;

export type ResultadoOta = 'desligado' | 'nada' | 'baixada' | 'erro';

/** Em dev (Metro) e em build sem `expo-updates` ligado não há OTA. */
export function otaLigado(): boolean {
  return Updates.isEnabled && !__DEV__;
}

/** Procura e baixa. Devolve o que aconteceu, para Ajustes → Sobre poder dizer. */
export function procurarOta(forcar = false): Promise<ResultadoOta> {
  if (!otaLigado()) return Promise.resolve('desligado');
  if (procurando) return procurando;
  if (!forcar && Date.now() - ultimaProcura < INTERVALO_MS) return Promise.resolve('nada');
  ultimaProcura = Date.now();
  procurando = (async (): Promise<ResultadoOta> => {
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) return 'nada';
      const f = await Updates.fetchUpdateAsync();
      return f.isNew ? 'baixada' : 'nada';
    } catch {
      return 'erro';
    } finally {
      procurando = null;
    }
  })();
  return procurando;
}

export async function aplicarOta(): Promise<void> {
  try { await Updates.reloadAsync(); } catch { /* sem OTA pendente: nada a fazer */ }
}

/**
 * Liga o ciclo no App: procura ao montar e ao voltar; aplica sozinho na volta depois de
 * um tempo fora. Devolve o estado do `useUpdates` para o aviso.
 */
export function useAtualizacaoOta(): { pendente: boolean; baixando: boolean } {
  const { isUpdatePending, isDownloading } = Updates.useUpdates();
  const pendenteRef = useRef(isUpdatePending);
  pendenteRef.current = isUpdatePending;
  useEffect(() => {
    procurarOta(true);
    let saiuEm = 0;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') { saiuEm = Date.now(); return; }
      if (s !== 'active') return;
      // Um respiro antes de decidir: o fim do seletor/instalador chega junto com o "active".
      if (pendenteRef.current && saiuEm && Date.now() - saiuEm > FORA_PARA_APLICAR_MS) {
        setTimeout(() => { if (pendenteRef.current && podeAplicarSozinho()) aplicarOta(); }, 1500);
        return;
      }
      procurarOta();
    });
    return () => sub.remove();
  }, []);
  return { pendente: isUpdatePending, baixando: isDownloading };
}
