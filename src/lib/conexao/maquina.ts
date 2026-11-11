/**
 * A máquina de estados da conexão com o PC (26/10, pedido do dono: "acabar com os falsos 'PC fora
 * do ar'"). Pura — o hook `useConnection` só alimenta eventos e lê o estado.
 *
 * O falso alarme vinha de duas coisas: a 1ª sonda que falhava já virava "offline", e a volta do
 * segundo plano sondava na hora, com o Wi-Fi/Tailscale do Android ainda acordando. Aqui:
 *  - abrir o app ou voltar do fundo abre uma CARÊNCIA de 8 s: falha dentro dela é "reconectando"
 *    (só a aura discreta, nenhum texto de erro);
 *  - offline de verdade só com 3 falhas seguidas E a carência vencida — ou o PC avisou que fechou;
 *  - qualquer sinal de vida (frame de WebSocket, RPC que deu certo) vale como sonda boa;
 *  - 401 é token recusado e 429 é o PC pausando este IP por 10 min: nos dois, nada de insistir.
 */

export type EstadoConexao = 'conectado' | 'reconectando' | 'procurando' | 'offline' | 'token' | 'bloqueado';

export type MemoriaConexao = {
  estado: EstadoConexao;
  falhas: number;
  /** Até quando falhas não viram erro visível (epoch ms). */
  carenciaAte: number;
  /** Último sinal de vida do PC (epoch ms; 0 = nunca). */
  ultimoVivo: number;
  /** Fim da pausa do PC depois de um 429. */
  bloqueadoAte: number;
};

export type EventoConexao =
  | { tipo: 'acordou' }      // abriu o app ou voltou do segundo plano
  | { tipo: 'ok' }           // sonda respondeu
  | { tipo: 'vivo' }         // frame de WebSocket ou RPC bem-sucedido
  | { tipo: 'falhou' }       // sonda sem resposta
  | { tipo: 'token' }        // 401
  | { tipo: 'bloqueado' }    // 429
  | { tipo: 'pcFechou' };    // o PC avisou que fechou/vai dormir

export const CARENCIA_MS = 8000;
export const FALHAS_PARA_OFFLINE = 3;
export const PAUSA_DO_PC_MS = 10 * 60_000;
/** Visto há pouco: a volta do fundo nem chega a mostrar a aura. */
export const RECENTE_MS = 60_000;

export function memoriaInicial(agora: number): MemoriaConexao {
  return { estado: 'reconectando', falhas: 0, carenciaAte: agora + CARENCIA_MS, ultimoVivo: 0, bloqueadoAte: 0 };
}

export function aplicar(m: MemoriaConexao, ev: EventoConexao, agora: number): MemoriaConexao {
  switch (ev.tipo) {
    case 'ok':
    case 'vivo':
      // Token recusado só sai com um pareamento novo; um frame atrasado não desfaz isso.
      if (m.estado === 'token') return m;
      return { ...m, estado: 'conectado', falhas: 0, ultimoVivo: agora, bloqueadoAte: 0 };
    case 'acordou': {
      if (m.estado === 'token') return m;
      if (m.estado === 'bloqueado' && agora < m.bloqueadoAte) return m;
      const recente = m.ultimoVivo > 0 && agora - m.ultimoVivo < RECENTE_MS && m.estado === 'conectado';
      return { ...m, estado: recente ? 'conectado' : 'reconectando', falhas: 0, carenciaAte: agora + CARENCIA_MS };
    }
    case 'falhou': {
      if (m.estado === 'token' || m.estado === 'bloqueado') return m;
      const falhas = m.falhas + 1;
      if (agora < m.carenciaAte) return { ...m, falhas, estado: m.estado === 'conectado' && falhas < 2 ? 'conectado' : 'reconectando' };
      return { ...m, falhas, estado: falhas >= FALHAS_PARA_OFFLINE ? 'offline' : 'procurando' };
    }
    case 'token':
      return { ...m, estado: 'token' };
    case 'bloqueado':
      return { ...m, estado: 'bloqueado', bloqueadoAte: agora + PAUSA_DO_PC_MS };
    case 'pcFechou':
      return m.estado === 'token' ? m : { ...m, estado: 'offline', carenciaAte: 0 };
  }
}

/** Quanto esperar até a próxima sonda. Pura. */
export function proximaSonda(m: MemoriaConexao, agora: number): number {
  switch (m.estado) {
    case 'conectado': return 30_000;
    case 'reconectando': return 1500;
    case 'procurando': return 2500;
    case 'offline': return Math.min(30_000, 2000 * 2 ** Math.max(0, m.falhas - FALHAS_PARA_OFFLINE));
    case 'bloqueado': return Math.max(1000, m.bloqueadoAte - agora);
    case 'token': return Infinity;
  }
}

/** O estado antigo que o resto do app ainda lê (`status === 'online'` etc.). Pura. */
export function statusLegado(e: EstadoConexao): 'checking' | 'online' | 'offline' | 'unauthorized' {
  return e === 'conectado' ? 'online' : e === 'token' ? 'unauthorized' : e === 'offline' || e === 'bloqueado' ? 'offline' : 'checking';
}
