/**
 * Estado de conexão com o PC, num lugar só.
 *
 * Antes cada tela descobria por conta própria que o PC não respondia — e só quando
 * o usuário tentava alguma coisa. Aqui o app sonda periodicamente, troca de endereço
 * sozinho quando o IP muda, e expõe um estado que o banner e as telas leem.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Pairing, resolveActiveEndpoint, scanSubnet } from './pairing';
import { callRpc } from './rpc';
import { backoffDelay } from './http';

export type ConnectionStatus = 'checking' | 'online' | 'offline';

const HEALTHY_POLL_MS = 30000;

export function useConnection(
  pairing: Pairing | null,
  onPairingUpdate: (p: Pairing) => void
) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  /** null enquanto nunca conseguimos perguntar ao PC. */
  const [hasTunnel, setHasTunnel] = useState<boolean | null>(null);

  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  // Evita que o efeito reinicie a cada novo objeto de pairing devolvido pela sonda.
  const pairingRef = useRef<Pairing | null>(pairing);
  pairingRef.current = pairing;

  const check = useCallback(async (): Promise<boolean> => {
    const current = pairingRef.current;
    if (!current) return false;

    setStatus(prev => (prev === 'online' ? prev : 'checking'));
    const resolved = await resolveActiveEndpoint(current);

    if (resolved) {
      const refreshed = await refreshEndpoints(resolved);
      if (refreshed !== resolved || resolved.activeIp !== current.activeIp) {
        onPairingUpdate(refreshed);
      }
      setStatus('online');
      attemptRef.current = 0;
      return true;
    }

    setStatus('offline');
    return false;
  }, [onPairingUpdate]);

  /**
   * Reaprende os endereços do PC enquanto há conexão.
   *
   * Sem isso, o app só conhecia os endereços do momento do pareamento: instalar o
   * túnel depois não adiantava nada, porque o endereço novo nunca chegava até aqui e
   * o app continuava só funcionando em casa. Como isto roda sempre que a conexão está
   * de pé, basta abrir o app uma vez em casa depois de instalar o túnel.
   */
  const refreshEndpoints = useCallback(async (p: Pairing): Promise<Pairing> => {
    try {
      const info = await callRpc(p, 'pairing.endpoints');
      setHasTunnel(info.hasTunnel);

      const known = new Set(p.endpoints);
      const novos = info.endpoints.filter(ip => !known.has(ip));
      if (novos.length === 0) return p;

      // Os novos entram no fim: o que já está funcionando continua sendo tentado
      // primeiro, e o candidato novo é só mais uma alternativa.
      return { ...p, endpoints: [...p.endpoints, ...novos] };
    } catch {
      // Desktop antigo, sem este método. Não é motivo pra considerar offline.
      return p;
    }
  }, []);

  useEffect(() => {
    if (!pairing) return;
    stoppedRef.current = false;

    async function loop() {
      if (stoppedRef.current) return;
      const ok = await check();
      if (stoppedRef.current) return;

      // PC no ar: sonda espaçada. Fora do ar: backoff, sem martelar a rede.
      attemptRef.current = ok ? 0 : attemptRef.current + 1;
      const delay = ok ? HEALTHY_POLL_MS : backoffDelay(attemptRef.current, 30000);
      timerRef.current = setTimeout(loop, delay);
    }

    loop();

    // Voltar pro app é o momento mais provável de a rede ter mudado.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') check();
    });

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
    };
  }, [pairing?.token, pairing?.port, check]);

  /** Varredura da sub-rede: só sob pedido explícito do usuário (254 requisições). */
  const runScan = useCallback(async (): Promise<boolean> => {
    const current = pairingRef.current;
    if (!current || scanning) return false;

    setScanning(true);
    setScanProgress(0);
    try {
      const found = await scanSubnet(current, (done, total) => {
        setScanProgress(Math.round((done / total) * 100));
      });
      if (!found) return false;

      const updated: Pairing = {
        ...current,
        activeIp: found,
        endpoints: current.endpoints.includes(found)
          ? current.endpoints
          : [found, ...current.endpoints],
      };
      onPairingUpdate(updated);
      setStatus('online');
      return true;
    } finally {
      setScanning(false);
    }
  }, [scanning, onPairingUpdate]);

  return { status, recheck: check, scanning, scanProgress, runScan, hasTunnel };
}
