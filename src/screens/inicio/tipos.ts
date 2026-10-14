import type Feather from '@expo/vector-icons/Feather';
import { chavePorPc } from '../../lib/pcAtivo';
import type { Pairing } from '../../lib/pairing';
import type { Clima, DiskEntry, EstadoFoco, ItemSaude, Lista, PowerOperation, ProcessEntry, Reminder, Sugestao, TimerPc } from '../../lib/rpc';
import type { TelemetryFrame } from '../../lib/telemetry';

/** Tipos e constantes da Início (bloco 81) — partilhados pela tela, pelos cards e pela busca. */

export const CHAVE_CARDS = 'elysium_home_cards';

export function saudacao(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
/** Horário do desligamento agendado, em epoch ms. Ver `gravarAgendamento`. */
export const CHAVE_AGENDAMENTO = () => chavePorPc('elysium_desligamento_agendado');

export type Dados = {
  telemetria: TelemetryFrame | null;
  lembretes: Reminder[];
  sugestoes: Sugestao[];
  clima: Clima | null;
  processos: ProcessEntry[];
  discos: DiskEntry[];
  transferencia: string;
  /** `null` = o PC não respondeu (ou é anterior à 1.5.4, sem o método). */
  saude: ItemSaude[] | null;
  /** `null` = PC anterior à 1.5.6 (sem modo foco) ou fora de alcance. */
  foco: EstadoFoco | null;
  /** Sugestões de memória (fase 13); `null` = PC anterior à 1.6.2. */
  aprendi: { id: string; text: string }[] | null;
  /** Resumo do dia (bloco 126); `null` = PC anterior à 1.7.1 ou fora de alcance. */
  hoje: string | null;
  /** Blocos 135/136; `null` = PC anterior à 1.8.0 ou fora de alcance. */
  listas: Lista[] | null;
  timers: { lista: TimerPc[]; diferenca: number } | null;
};

import { CARDS_PADRAO_V2 } from '../../lib/layoutInicio';

export type Ctx = {
  dados: Dados;
  pairing: Pairing;
  ocupado: boolean;
  navegar: (tela: 'chat' | 'control' | 'rotinas') => void;
  abrirPlayer: () => void;
  energia: (op: PowerOperation, label: string, aviso: string) => void;
  agendarDesligamento: (segundos: number) => void;
  cancelarDesligamento: () => void;
  /** Epoch ms do desligamento marcado, ou `null`. */
  agendado: number | null;
  executarSugestao: (s: Sugestao) => void;
  criarLembrete: (texto: string, hora: Date) => Promise<void>;
  recarregar: () => void;
};

export type DefCard = {
  titulo: string;
  icone: keyof typeof Feather.glyphMap;
  /** Chaves de dado que este card consome — só o que os visíveis pedem é buscado. */
  precisa: (keyof Dados)[];
  corpo: (c: Ctx) => React.ReactNode;
};

/**
 * Ordem de fábrica. Card fora desta lista existe, mas nasce desligado. Fase 22: cinco em vez
 * de onze (lib/layoutInicio.ts) — o resto fica em "Personalizar".
 */
export const CARDS_PADRAO: string[] = [...CARDS_PADRAO_V2];
