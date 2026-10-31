/**
 * Estado de conexão com o PC, num lugar só.
 *
 * Antes cada tela descobria por conta própria que o PC não respondia — e só quando
 * o usuário tentava alguma coisa. Aqui o app sonda periodicamente, troca de endereço
 * sozinho quando o IP muda, e expõe um estado que o indicador e as telas leem.
 *
 * 26/10: as decisões saíram para `conexao/maquina.ts` (carência ao abrir/voltar do fundo,
 * offline só com 3 falhas, 401/429 sem insistir). Aqui ficam a sonda (uma de cada vez), o único
 * ouvinte de AppState da conexão e os sinais de vida dos canais (`conexao/sinais.ts`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { BloqueadoError, Pairing, resolveActiveEndpoint, scanSubnet, UnauthorizedError } from './pairing';
import { callRpc } from './rpc';
import { registrarConexao, registrarEstadoApp, useEstadoPc } from './estadoPc';
import { aplicar, memoriaInicial, proximaSonda, statusLegado, type EstadoConexao, type EventoConexao, type MemoriaConexao } from './conexao/maquina';
import { aoSinal, liberarCanais, marcarRecusa } from './conexao/sinais';
import { diagTela } from './telaDiag';
import { fixarSeValido, garantirFixada, tlsUtil } from './tls';

/**
 * 31/10: TLS com o PC. Já fixado e funcionando: nada. Senão pede a impressão (pedido assinado),
 * confere a assinatura com o token e fixa — o pareamento passa a ter `tls` e o app vai em https.
 * PC antigo (sem tls.info) ou APK sem o módulo: segue igual.
 */
async function comTls(p: Pairing): Promise<Pairing> {
  garantirFixada(p.tls);
  if (tlsUtil(p.tls)) return p;
  try {
    const r = await callRpc(p, 'tls.info', {}, { timeoutMs: 6000 });
    const info = fixarSeValido(p.token, r.tls);
    if (!info) return p;
    if (p.tls?.sha256 === info.sha256 && p.tls.porta === info.porta) return p;
    diagTela(`tls: fixado o certificado do PC (porta ${info.porta})`);
    return { ...p, tls: info };
  } catch {
    return p;
  }
}

export type ConnectionStatus = 'checking' | 'online' | 'offline' | 'unauthorized';

/** Depois de voltar do fundo, o rádio/Tailscale do Android leva um instante para acordar. */
const ESPERA_AO_VOLTAR_MS = 600;
/** A 1ª sonda depois de abrir/voltar tem mais folga; as seguintes, o prazo curto de sempre. */
const PRAZO_PRIMEIRA_MS = 4000;
const INTERVALO_MINIMO_MS = 1500;

export function useConnection(
  pairing: Pairing | null,
  onPairingUpdate: (p: Pairing) => void
) {
  const memRef = useRef<MemoriaConexao>(memoriaInicial(Date.now()));
  const [mem, setMem] = useState<MemoriaConexao>(memRef.current);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  /** null enquanto nunca conseguimos perguntar ao PC. */
  const [hasTunnel, setHasTunnel] = useState<boolean | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const emAndamento = useRef<Promise<boolean> | null>(null);
  const ultimaSonda = useRef(0);
  const primeira = useRef(true);
  const varrendo = useRef(false);
  // Evita que o efeito reinicie a cada novo objeto de pairing devolvido pela sonda.
  const pairingRef = useRef<Pairing | null>(pairing);
  pairingRef.current = pairing;

  const evento = useCallback((ev: EventoConexao) => {
    const antes = memRef.current;
    const depois = aplicar(antes, ev, Date.now());
    if (depois === antes) return;
    memRef.current = depois;
    setMem(depois);
    // A linha "PC sem resposta" da Início só com offline de verdade — na carência, nada muda.
    if (depois.estado !== antes.estado) {
      diagTela(`conexão: ${antes.estado} → ${depois.estado} (${ev.tipo}, ${depois.falhas} falha${depois.falhas === 1 ? '' : 's'})`);
      if (depois.estado === 'conectado') registrarConexao(true);
      else if (depois.estado === 'offline' || depois.estado === 'bloqueado' || depois.estado === 'token') registrarConexao(false);
    }
  }, []);

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
      // Bloco 128: com o acompanhamento do acesso de fora desligado no PC, a faixa não fala
      // de túnel nenhum (nem "sem acesso remoto", nem "confira o Tailscale") — null é o
      // mesmo estado de PC antigo: "PC fora do ar" com Procurar.
      setHasTunnel(info.acessoRemoto === false ? null : info.hasTunnel);

      const known = new Set(p.endpoints);
      const novos = info.endpoints.filter(ip => !known.has(ip));
      // Os novos entram no fim: o que já está funcionando continua sendo tentado
      // primeiro, e o candidato novo é só mais uma alternativa.
      const comNovos = novos.length === 0 ? p : { ...p, endpoints: [...p.endpoints, ...novos] };
      return await comTls(comNovos);
    } catch {
      // Desktop antigo, sem este método. Não é motivo pra considerar offline.
      return p;
    }
  }, []);

  const sondar = useCallback(async (): Promise<boolean> => {
    const current = pairingRef.current;
    if (!current) return false;
    try {
      const prazo = primeira.current ? PRAZO_PRIMEIRA_MS : undefined;
      primeira.current = false;
      const resolved = await resolveActiveEndpoint(current, prazo);
      if (!resolved) { evento({ tipo: 'falhou' }); return false; }
      const refreshed = await refreshEndpoints(resolved);
      // 31/10: trocou de PC (ou desapareou) durante a sonda — o resultado é do PC antigo.
      if (pairingRef.current !== current) return false;
      if (refreshed !== resolved || resolved.activeIp !== current.activeIp) onPairingUpdate(refreshed);
      evento({ tipo: 'ok' });
      // Em que pé está o app no PC (janela, bandeja, tela bloqueada). PC anterior à 2.5 não
      // tem o método: fica só o "online".
      callRpc(refreshed, 'pc.estado', {}, { timeoutMs: 6000 })
        .then(r => { if (r.estado) registrarEstadoApp(r.estado); })
        .catch(() => {});
      return true;
    } catch (err) {
      // O token foi regenerado no PC: não é "offline", é "token inválido". 429: o PC pausou
      // este IP. Nos dois, os canais param de tentar (cada tentativa contaria como recusa).
      if (err instanceof UnauthorizedError) { marcarRecusa('token'); evento({ tipo: 'token' }); return false; }
      if (err instanceof BloqueadoError) { marcarRecusa('bloqueado'); evento({ tipo: 'bloqueado' }); return false; }
      evento({ tipo: 'falhou' });
      return false;
    }
  }, [evento, onPairingUpdate, refreshEndpoints]);

  /** Uma sonda de cada vez: quem chama durante uma em curso recebe a mesma promessa. */
  const check = useCallback((forcar = false): Promise<boolean> => {
    if (emAndamento.current) return emAndamento.current;
    if (!forcar && Date.now() - ultimaSonda.current < INTERVALO_MINIMO_MS) return Promise.resolve(memRef.current.estado === 'conectado');
    ultimaSonda.current = Date.now();
    const p = sondar().finally(() => { emAndamento.current = null; });
    emAndamento.current = p;
    return p;
  }, [sondar]);

  const agendar = useCallback(function agendarProxima() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stoppedRef.current) return;
    const espera = proximaSonda(memRef.current, Date.now());
    if (!Number.isFinite(espera)) return; // token recusado: só um pareamento novo resolve
    timerRef.current = setTimeout(async () => {
      if (memRef.current.estado === 'bloqueado' && Date.now() >= memRef.current.bloqueadoAte) liberarCanais();
      await check(true);
      agendarProxima();
    }, espera);
  }, [check]);

  useEffect(() => {
    if (!pairing) return;
    stoppedRef.current = false;
    liberarCanais();
    primeira.current = true;
    evento({ tipo: 'acordou' });
    void check(true).then(() => agendar());

    // O único ouvinte de AppState da conexão: voltar é o momento mais provável de a rede ter
    // mudado — mas o rádio ainda está acordando, então espera um instante e dá mais folga.
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      evento({ tipo: 'acordou' });
      primeira.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void check(true).then(() => agendar()); }, ESPERA_AO_VOLTAR_MS);
    });
    // Frame de WebSocket ou RPC bom = o PC está lá; 401/429 vindos de um canal valem igual.
    const tirar = aoSinal((sinal) => {
      if (sinal === 'vivo') { const antes = memRef.current.estado; evento({ tipo: 'vivo' }); if (antes !== 'conectado') agendar(); }
      else evento({ tipo: sinal });
    });

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
      tirar();
    };
  }, [pairing?.token, pairing?.port, check, agendar, evento]);

  // O PC avisou que fechou ou vai dormir: offline na hora, sem esperar a carência.
  const { encerrando } = useEstadoPc();
  useEffect(() => { if (encerrando) evento({ tipo: 'pcFechou' }); }, [encerrando?.em, evento]);

  /** Varredura da sub-rede: só sob pedido explícito do usuário (254 requisições). */
  const runScan = useCallback(async (): Promise<boolean> => {
    const current = pairingRef.current;
    // 31/10: guarda num ref — dois toques rápidos liam o `scanning` antigo e varriam duas vezes.
    if (!current || varrendo.current) return false;
    varrendo.current = true;

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
      evento({ tipo: 'ok' });
      return true;
    } finally {
      setScanning(false);
      varrendo.current = false;
    }
  }, [scanning, onPairingUpdate, evento]);

  const estado: EstadoConexao = mem.estado;
  return {
    status: statusLegado(estado) as ConnectionStatus,
    estado,
    ultimoContato: mem.ultimoVivo || null,
    bloqueadoAte: mem.bloqueadoAte || null,
    recheck: () => check(true),
    scanning, scanProgress, runScan, hasTunnel,
  };
}
