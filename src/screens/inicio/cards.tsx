import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { callRpc, Clima, DiskEntry, ItemSaude, PowerOperation, Reminder, Sugestao } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { confirmDestructive } from '../../lib/confirm';
import { haptica } from '../../lib/haptica';
import { TelemetryFrame } from '../../lib/telemetry';
import { findMetric } from '../../lib/telemetryFormat';
import { errMessage } from '../../lib/errors';
import { useTheme } from '../../theme';
import { SpotifyBar } from '../SpotifyPlayer';
import { MetricBar, Text } from '../../components/ui';
import type { DefCard } from './tipos';

/**
 * O catálogo de cards da Início e os corpos de cada um (bloco 81: saíram do HomeScreen).
 * Um card novo é uma entrada em `CARDS` e uma função de corpo aqui — a tela não muda.
 */
// ─────────────────────────────────────────────────
// O CATÁLOGO
// ─────────────────────────────────────────────────

export const CARDS: Record<string, DefCard> = {
  sugestoes: {
    titulo: 'Para agora', icone: 'zap', precisa: ['sugestoes'],
    corpo: ({ dados, executarSugestao }) => <Bolhas lista={dados.sugestoes} onToque={executarSugestao} />,
  },
  computador: {
    titulo: 'Este computador', icone: 'activity', precisa: [],
    corpo: ({ dados }) => <Metricas frame={dados.telemetria} />,
  },
  musica: {
    titulo: 'Tocando', icone: 'music', precisa: [],
    corpo: ({ pairing, abrirPlayer }) => <SpotifyBar pairing={pairing} onOpen={abrirPlayer} semCard />,
  },
  clima: {
    titulo: 'Lá fora', icone: 'cloud', precisa: ['clima'],
    corpo: ({ dados }) => <ClimaCorpo clima={dados.clima} />,
  },
  lembretes: {
    titulo: 'Próximos lembretes', icone: 'clock', precisa: ['lembretes'],
    corpo: (c) => <Lembretes lista={c.dados.lembretes} criar={c.criarLembrete} />,
  },
  processos: {
    titulo: 'Consumindo mais', icone: 'cpu', precisa: ['processos'],
    corpo: ({ dados }) => <Lista itens={dados.processos.slice(0, 4).map(p => ({
      chave: String(p.pid), icone: 'cpu' as const, texto: p.name, direita: `${Math.round(p.cpu ?? 0)}%`,
    }))} vazio="Sem leitura de processos." />,
  },
  // Fase 12: o que está quebrado no PC, com o conserto de um clique — o mesmo card do desktop.
  saude: {
    titulo: 'Saúde do ELYSIUM', icone: 'heart', precisa: ['saude'],
    corpo: ({ dados, pairing, navegar, recarregar }) => <Saude itens={dados.saude} pairing={pairing} navegar={navegar} recarregar={recarregar} />,
  },
  discos: {
    titulo: 'Armazenamento', icone: 'hard-drive', precisa: ['discos'],
    corpo: ({ dados }) => <Discos lista={dados.discos} />,
  },
  transferencia: {
    titulo: 'Área de transferência', icone: 'clipboard', precisa: ['transferencia'],
    corpo: ({ dados }) => <Transferencia texto={dados.transferencia} />,
  },
  atalhos: {
    titulo: 'Atalhos', icone: 'grid', precisa: [],
    corpo: ({ navegar, abrirPlayer }) => <Atalhos navegar={navegar} abrirPlayer={abrirPlayer} />,
  },
  energia: {
    titulo: 'Energia', icone: 'power', precisa: [],
    corpo: ({ energia, agendarDesligamento, cancelarDesligamento, agendado, ocupado }) => (
      <Energia
        acionar={energia}
        agendar={agendarDesligamento}
        cancelarAgendamento={cancelarDesligamento}
        agendado={agendado}
        ocupado={ocupado}
      />
    ),
  },
};

// ─────────────────────────────────────────────────
// CORPOS
// ─────────────────────────────────────────────────

function Bolhas({ lista, onToque }: { lista: Sugestao[]; onToque: (s: Sugestao) => void }) {
  const { palette } = useTheme();
  if (!lista.length) return <Text variant="caption" color={palette.textMuted}>Nada de urgente por aqui.</Text>;
  return (
    <View style={styles.chips}>
      {lista.map((s, i) => (
        <Pressable
          key={i}
          onPress={() => onToque(s)}
          style={[styles.bolha, {
            borderRadius: 999,
            backgroundColor: palette.primarySoft,
            borderColor: palette.glassBorder,
          }]}
        >
          <Feather name={(s.icone as keyof typeof Feather.glyphMap) ?? 'zap'} size={13} color={palette.primary} />
          <Text variant="caption" style={{ flexShrink: 1 }}>{s.texto}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Metricas({ frame }: { frame: TelemetryFrame | null }) {
  const { palette } = useTheme();
  const metricas = frame
    ? Object.entries(frame).filter(([k, v]) => findMetric(k) && typeof v === 'number')
    : [];
  if (!metricas.length) return <Text variant="caption" color={palette.textMuted}>Esperando o PC…</Text>;
  return (
    <>
      {metricas.map(([k, v]) => {
        const m = findMetric(k)!;
        return <MetricBar key={k} icon={m.icon} label={m.label} percent={v as number} />;
      })}
    </>
  );
}

function ClimaCorpo({ clima }: { clima: Clima | null }) {
  const { palette } = useTheme();
  if (!clima) {
    return <Text variant="caption" color={palette.textMuted}>Defina a cidade nos Ajustes do PC.</Text>;
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.climaLinha}>
        <Feather name={(clima.icone as keyof typeof Feather.glyphMap) ?? 'cloud'} size={26} color={palette.primary} />
        <Text variant="display">{Math.round(clima.temperatura)}°</Text>
        <Text variant="caption" color={palette.textMuted}>{clima.descricao}</Text>
      </View>
      <Text variant="caption" color={palette.textMuted}>
        {clima.cidade} · máx {Math.round(clima.max)}° / mín {Math.round(clima.min)}°
      </Text>
    </View>
  );
}

function Lembretes({
  lista, criar,
}: {
  lista: Reminder[];
  criar: (texto: string, quando: Date) => Promise<void>;
}) {
  const { palette, tokens } = useTheme();
  const [texto, setTexto] = useState('');
  const [hora, setHora] = useState('');

  async function enviar() {
    const t = texto.trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
    if (!t || !m) { Alert.alert('Lembrete', 'Escreva o texto e a hora no formato 14:30.'); return; }
    // A hora digitada é sempre a PRÓXIMA ocorrência: 08:00 às 14h vira amanhã. Senão o
    // lembrete nasceria vencido e o desktop recusaria com "dueAt já passou".
    const quando = new Date();
    quando.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (quando.getTime() <= Date.now()) quando.setDate(quando.getDate() + 1);
    try { await criar(t, quando); setTexto(''); setHora(''); }
    catch (e) { Alert.alert('Lembrete', errMessage(e)); }
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {lista.length === 0
        ? <Text variant="caption" color={palette.textMuted}>Nada agendado.</Text>
        : lista.slice(0, 4).map(r => (
          <View key={r.id} style={styles.linhaItem}>
            <Feather name="bell" size={13} color={palette.primary} />
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{r.text}</Text>
            <Text variant="caption" color={palette.textMuted}>
              {new Date(r.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ))}
      {/* `reminders.create` já existia no RPC e nunca era chamado: o lembrete só podia ser
          criado por voz. Agora dá para digitar dos dois lados. */}
      <View style={styles.formLinha}>
        <TextInput
          value={texto}
          onChangeText={setTexto}
          placeholder="Lembrar de…"
          placeholderTextColor={palette.textMuted}
          style={[styles.campo, { flex: 1, color: palette.text, borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}
        />
        <TextInput
          value={hora}
          onChangeText={setHora}
          placeholder="14:30"
          keyboardType="numbers-and-punctuation"
          placeholderTextColor={palette.textMuted}
          style={[styles.campo, { width: 68, textAlign: 'center', color: palette.text, borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}
        />
        <Pressable onPress={enviar} style={[styles.botaoIcone, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
          <Feather name="check" size={16} color={palette.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function Lista({
  itens, vazio,
}: {
  itens: { chave: string; icone: keyof typeof Feather.glyphMap; texto: string; direita?: string }[];
  vazio: string;
}) {
  const { palette } = useTheme();
  if (!itens.length) return <Text variant="caption" color={palette.textMuted}>{vazio}</Text>;
  return (
    <>
      {itens.map(i => (
        <View key={i.chave} style={styles.linhaItem}>
          <Feather name={i.icone} size={13} color={palette.primary} />
          <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{i.texto}</Text>
          {i.direita && <Text variant="caption" color={palette.textMuted}>{i.direita}</Text>}
        </View>
      ))}
    </>
  );
}

function Saude({ itens, pairing, navegar, recarregar }: {
  itens: ItemSaude[] | null;
  pairing: Pairing;
  navegar: (tela: 'chat' | 'control') => void;
  recarregar: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!itens) return <Text variant="caption" color={palette.textMuted}>O PC não respondeu (ou ainda não tem esta conferência).</Text>;
  const ruins = itens.filter(i => i.nivel !== 'ok');
  const cor = (n: ItemSaude['nivel']) => (n === 'erro' ? palette.error : n === 'aviso' ? '#d99a2b' : '#3fae6a');

  async function consertar(i: ItemSaude) {
    const c = i.conserto;
    if (!c) return;
    if (c.tipo === 'painel') { navegar('control'); return; }
    haptica.medio();
    if (c.tipo === 'rpc' && c.valor === 'update.install') {
      const ok = await confirmDestructive('Atualizar o PC agora?', 'O ELYSIUM do PC fecha por alguns segundos e volta sozinho.');
      if (ok !== 'confirmed') return;
    }
    setOcupado(i.id);
    try {
      const r = c.tipo === 'rpc'
        ? await callRpc(pairing, 'update.install', {}, { confirmed: true })
        : await callRpc(pairing, 'system.saude.consertar', { item: c.valor }, { timeoutMs: 30000 });
      haptica.sucesso();
      Alert.alert(i.titulo, 'message' in r ? r.message : r.mensagem);
    } catch (e) {
      haptica.erro();
      Alert.alert('Não deu certo', errMessage(e));
    } finally {
      setOcupado(null);
      recarregar();
    }
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="label" color={ruins.length ? '#d99a2b' : palette.text}>
        {ruins.length ? (ruins.length === 1 ? '1 ponto de atenção' : `${ruins.length} pontos de atenção`) : 'Tudo certo.'}
      </Text>
      {(ruins.length ? ruins : itens).map(i => (
        <View key={i.id} style={[styles.linhaSaude, { opacity: ocupado === i.id ? 0.5 : 1 }]}>
          <View style={[styles.pontoSaude, { backgroundColor: cor(i.nivel) }]} />
          <View style={{ flex: 1 }}>
            <Text variant="body">{i.titulo}</Text>
            <Text variant="caption" color={palette.textMuted} numberOfLines={2}>{i.detalhe}</Text>
          </View>
          {i.conserto && (
            <Pressable onPress={() => consertar(i)} disabled={!!ocupado} hitSlop={6}
              style={[styles.botaoSaude, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
              <Text variant="caption" color={palette.primary}>{i.conserto.rotulo}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

function Discos({ lista }: { lista: DiskEntry[] }) {
  const { palette } = useTheme();
  if (!lista.length) return <Text variant="caption" color={palette.textMuted}>Sem leitura dos discos.</Text>;
  return (
    <>
      {lista.map(d => (
        <MetricBar key={d.name} icon="hard-drive" label={`${d.name} · ${d.freeGB} GB livres`} percent={d.usedPct} />
      ))}
    </>
  );
}

function Transferencia({ texto }: { texto: string }) {
  const { palette, tokens } = useTheme();
  return (
    <View style={[styles.caixaTexto, { borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}>
      <Text variant="caption" numberOfLines={4} color={texto ? palette.text : palette.textMuted}>
        {texto || 'Vazia.'}
      </Text>
    </View>
  );
}

function Atalhos({
  navegar, abrirPlayer,
}: {
  navegar: (t: 'chat' | 'control') => void;
  abrirPlayer: () => void;
}) {
  const { palette, tokens } = useTheme();
  const itens = [
    { chave: 'chat', label: 'Conversar', icone: 'message-circle' as const, acao: () => navegar('chat') },
    { chave: 'control', label: 'Controlar', icone: 'monitor' as const, acao: () => navegar('control') },
    { chave: 'player', label: 'Música', icone: 'music' as const, acao: abrirPlayer },
  ];
  return (
    <View style={styles.grade}>
      {itens.map(i => (
        <Pressable
          key={i.chave}
          onPress={i.acao}
          style={[styles.ladrilho, { borderRadius: tokens.radii.lg, backgroundColor: palette.primarySoft }]}
        >
          <Feather name={i.icone} size={20} color={palette.primary} />
          <Text variant="label" color={palette.primary}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Energia({
  acionar, agendar, cancelarAgendamento, agendado, ocupado,
}: {
  acionar: (op: PowerOperation, label: string, aviso: string) => void;
  agendar: (segundos: number) => void;
  cancelarAgendamento: () => void;
  agendado: number | null;
  ocupado: boolean;
}) {
  const { palette, tokens } = useTheme();
  const [abrindoHora, setAbrindoHora] = useState(false);
  const [horaTexto, setHoraTexto] = useState('');

  const botoes = [
    { op: 'lock' as const, label: 'Bloquear', icone: 'lock' as const, aviso: 'A tela do PC será bloqueada.' },
    { op: 'sleep' as const, label: 'Suspender', icone: 'moon' as const, aviso: 'O PC vai suspender.' },
    { op: 'shutdown' as const, label: 'Desligar', icone: 'power' as const, aviso: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
  ];

  /** Atalhos em minutos. Acima de 24 h o servidor recusa — ver `LIMITE_AGENDAMENTO_S`. */
  const atalhos = [15, 30, 60, 120];

  function confirmarHora() {
    const segundos = segundosAte(horaTexto);
    if (segundos === null) {
      Alert.alert('Hora inválida', 'Escreva no formato 23:30.');
      return;
    }
    if (segundos > LIMITE_AGENDAMENTO_S) {
      Alert.alert('Longe demais', 'O Windows aceita agendar o desligamento com até 24 horas de antecedência.');
      return;
    }
    setAbrindoHora(false);
    setHoraTexto('');
    agendar(segundos);
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <View style={styles.linhaEnergia}>
        {botoes.map(b => (
          <Pressable
            key={b.op}
            onPress={() => acionar(b.op, b.label, b.aviso)}
            disabled={ocupado}
            style={[styles.botaoEnergia, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft, opacity: ocupado ? 0.5 : 1 }]}
          >
            <Feather name={b.icone} size={17} color={b.op === 'shutdown' ? palette.error : palette.primary} />
            <Text variant="caption" color={b.op === 'shutdown' ? palette.error : palette.primary}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Agendamento em pé: o que está marcado e como desmarcar, sem precisar lembrar de
          um comando de voz. Enquanto há um agendamento, oferecer outro só confundiria —
          o Windows guarda um de cada vez, e o segundo pedido é recusado até cancelar. */}
      {agendado !== null ? (
        <View style={[styles.agendaAtiva, {
          borderRadius: tokens.radii.md,
          borderColor: palette.error,
          backgroundColor: palette.errorSoft,
        }]}>
          <Feather name="power" size={15} color={palette.error} />
          <View style={{ flex: 1 }}>
            <Text variant="caption" color={palette.error}>Desliga às {relogio(agendado)}</Text>
            <Text variant="caption" color={palette.textMuted}>{faltando(agendado)}</Text>
          </View>
          <Pressable
            onPress={cancelarAgendamento}
            disabled={ocupado}
            hitSlop={6}
            style={[styles.botaoCancelar, { borderRadius: tokens.radii.sm, borderColor: palette.error }]}
          >
            <Text variant="caption" color={palette.error}>Cancelar</Text>
          </Pressable>
        </View>
      ) : abrindoHora ? (
        <View style={styles.formLinha}>
          <TextInput
            value={horaTexto}
            onChangeText={setHoraTexto}
            placeholder="23:30"
            placeholderTextColor={palette.textMuted}
            keyboardType="numbers-and-punctuation"
            autoFocus
            onSubmitEditing={confirmarHora}
            style={[styles.campo, {
              flex: 1, borderRadius: tokens.radii.md,
              borderColor: palette.glassBorder, color: palette.text,
            }]}
          />
          <Pressable onPress={confirmarHora} style={[styles.botaoIcone, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
            <Feather name="check" size={16} color={palette.primary} />
          </Pressable>
          <Pressable onPress={() => { setAbrindoHora(false); setHoraTexto(''); }} style={styles.botaoIcone}>
            <Feather name="x" size={16} color={palette.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <Text variant="caption" color={palette.textMuted}>Agendar desligamento</Text>
          <View style={styles.chips}>
            {atalhos.map(min => (
              <Pressable
                key={min}
                onPress={() => agendar(min * 60)}
                disabled={ocupado}
                style={[styles.chip, {
                  borderRadius: tokens.radii.full,
                  borderColor: palette.glassBorder,
                  opacity: ocupado ? 0.5 : 1,
                }]}
              >
                <Feather name="clock" size={12} color={palette.textMuted} />
                <Text variant="caption" color={palette.text}>
                  {min < 60 ? `${min} min` : `${min / 60} h`}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setAbrindoHora(true)}
              disabled={ocupado}
              style={[styles.chip, {
                borderRadius: tokens.radii.full,
                borderColor: palette.glassBorder,
                opacity: ocupado ? 0.5 : 1,
              }]}
            >
              <Feather name="edit-2" size={12} color={palette.textMuted} />
              <Text variant="caption" color={palette.text}>Escolher hora</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** Teto do `power.control` no servidor: `delaySeconds` entre 0 e 86400. */
const LIMITE_AGENDAMENTO_S = 86400;

/**
 * "23:30" → quantos segundos faltam até lá.
 *
 * Hora já passada hoje vira amanhã, em vez de erro: quem digita 07:00 às 23h quer o
 * próximo 07:00, e recusar seria pedir para a pessoa fazer a conta que o app pode fazer.
 * Devolve `null` quando o texto não é uma hora.
 */
function segundosAte(texto: string): number | null {
  const m = texto.trim().match(/^(\d{1,2})\s*[:h]?\s*(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;

  const alvo = new Date();
  alvo.setHours(h, min, 0, 0);
  if (alvo.getTime() <= Date.now()) alvo.setDate(alvo.getDate() + 1);
  return Math.round((alvo.getTime() - Date.now()) / 1000);
}

function relogio(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function faltando(ts: number): string {
  const s = Math.max(0, Math.round((ts - Date.now()) / 1000));
  if (s < 60) return `em ${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  return `em ${h} h ${min % 60} min`;
}

const styles = StyleSheet.create({
  linhaSaude: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pontoSaude: { width: 8, height: 8, borderRadius: 4 },
  botaoSaude: { paddingHorizontal: 10, paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  bolha: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%' },
  climaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linhaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  campo: { paddingVertical: 8, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 13 },
  botaoIcone: { paddingVertical: 9, paddingHorizontal: 12 },
  caixaTexto: { padding: 10, borderWidth: StyleSheet.hairlineWidth },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ladrilho: { flexGrow: 1, minWidth: '30%', alignItems: 'center', gap: 6, paddingVertical: 16 },
  linhaEnergia: { flexDirection: 'row', gap: 8 },
  botaoEnergia: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12 },
  agendaAtiva: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  botaoCancelar: { paddingVertical: 6, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
});
