import type Feather from '@expo/vector-icons/Feather';
import type { Pairing } from '../../lib/pairing';
import type { Clima, DiskEntry, PowerOperation, ProcessEntry, Reminder, Sugestao } from '../../lib/rpc';
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
export const CHAVE_AGENDAMENTO = 'elysium_desligamento_agendado';

export type Dados = {
  telemetria: TelemetryFrame | null;
  lembretes: Reminder[];
  sugestoes: Sugestao[];
  clima: Clima | null;
  processos: ProcessEntry[];
  discos: DiskEntry[];
  transferencia: string;
};

export type Ctx = {
  dados: Dados;
  pairing: Pairing;
  ocupado: boolean;
  navegar: (tela: 'chat' | 'control') => void;
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

/** Ordem de fábrica. Card fora desta lista existe, mas nasce desligado. */
export const CARDS_PADRAO = ['sugestoes', 'computador', 'musica', 'lembretes', 'atalhos', 'energia'];
