import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { callRpc, Clima, DiskEntry, EstadoFoco, ItemSaude, Lista as ListaPc, PowerOperation, Reminder, Sugestao, TimerPc } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { confirmDestructive } from '../../lib/confirm';
import { haptica } from '../../lib/haptica';
import { TelemetryFrame } from '../../lib/telemetry';
import { findMetric } from '../../lib/telemetryFormat';
import { errMessage } from '../../lib/errors';
import { falar, pararDeFalar, useFala } from '../../lib/falar';
import { useTheme } from '../../theme';
import { SpotifyBar } from '../SpotifyPlayer';
import { MetricBar, Text, VIDRO_BOTAO } from '../../components/ui';
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
  // Listas que o PC também vê (bloco 135): "põe leite na lista" pela voz cai aqui.
  listas: {
    titulo: 'Listas', icone: 'list', precisa: ['listas'],
    corpo: ({ dados, pairing, recarregar }) => <Listas listas={dados.listas} pairing={pairing} recarregar={recarregar} />,
  },
  // Timers com nome (bloco 136): correm no PC, avisam aqui quando acabam.
  timers: {
    titulo: 'Timers', icone: 'clock', precisa: ['timers'],
    corpo: ({ dados, pairing, recarregar }) => <Timers estado={dados.timers} pairing={pairing} recarregar={recarregar} />,
  },
  // Resumo do dia (bloco 126): o mesmo texto do "bom dia" do PC, montado sem modelo.
  hoje: {
    titulo: 'Hoje', icone: 'sun', precisa: ['hoje'],
    corpo: ({ dados, pairing }) => <Hoje texto={dados.hoje} pairing={pairing} />,
  },
  // Memória que aprende (fase 13): o que o PC percebeu nas conversas, para guardar ou não.
  aprendi: {
    titulo: 'Aprendi isto', icone: 'bookmark', precisa: ['aprendi'],
    corpo: ({ dados, pairing, recarregar }) => <Aprendi lista={dados.aprendi} pairing={pairing} recarregar={recarregar} />,
  },
  // Modo foco do PC (fase 12): começar de longe, ver quanto falta, parar.
  foco: {
    titulo: 'Modo foco', icone: 'eye', precisa: ['foco'],
    corpo: ({ dados, pairing, recarregar }) => <Foco estado={dados.foco} pairing={pairing} recarregar={recarregar} />,
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
        <Pressable accessibilityLabel="Enviar" accessibilityRole="button" onPress={enviar} style={[styles.botaoIcone, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
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

function Listas({ listas, pairing, recarregar }: { listas: ListaPc[] | null; pairing: Pairing; recarregar: () => void }) {
  const { palette, tokens } = useTheme();
  const [novo, setNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  if (!listas) return <Text variant="caption" color={palette.textMuted}>O PC não respondeu (ou é anterior à 1.8.0).</Text>;
  const alvo = listas[0]?.nome ?? 'Compras';
  async function agir(fn: () => Promise<unknown>) {
    setOcupado(true);
    try { await fn(); haptica.leve(); } catch (e) { Alert.alert('Listas', errMessage(e)); }
    finally { setOcupado(false); recarregar(); }
  }
  return (
    <View style={{ gap: tokens.spacing.sm, opacity: ocupado ? 0.6 : 1 }}>
      {!listas.length && <Text variant="caption" color={palette.textMuted}>Nenhuma lista ainda. Diga “põe leite na lista do mercado” ou escreva abaixo.</Text>}
      {listas.slice(0, 2).map(l => (
        <View key={l.id} style={{ gap: 4 }}>
          <Text variant="label">{l.nome} <Text variant="caption" color={palette.textMuted}>· {l.itens.filter(i => !i.feito).length} pendente(s)</Text></Text>
          {[...l.itens].sort((a, b) => Number(a.feito) - Number(b.feito)).slice(0, 10).map(i => (
            <View key={i.id} style={styles.linhaSaude}>
              <Pressable hitSlop={6} disabled={ocupado} onPress={() => agir(() => callRpc(pairing, 'listas.toggle', { listaId: l.id, itemId: i.id, feito: !i.feito }))}>
                <Feather name={i.feito ? 'check-square' : 'square'} size={18} color={i.feito ? palette.success : palette.textMuted} />
              </Pressable>
              <Text variant="body" style={{ flex: 1, textDecorationLine: i.feito ? 'line-through' : 'none', opacity: i.feito ? 0.55 : 1 }}>{i.texto}</Text>
              <Pressable accessibilityLabel="Tirar o item da lista" accessibilityRole="button" hitSlop={6} disabled={ocupado} onPress={() => agir(() => callRpc(pairing, 'listas.remove', { listaId: l.id, itemId: i.id }))}>
                <Feather name="x" size={15} color={palette.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ))}
      <View style={[styles.linhaSaude, { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: tokens.radii.md, paddingHorizontal: 10 }]}>
        <TextInput
          value={novo}
          onChangeText={setNovo}
          placeholder={`Pôr em ${alvo}… (vírgula separa)`}
          placeholderTextColor={palette.textMuted}
          onSubmitEditing={() => { const t = novo.trim(); if (!t) return; setNovo(''); agir(() => callRpc(pairing, 'listas.add', { lista: alvo, texto: t })); }}
          returnKeyType="done"
          style={{ flex: 1, color: palette.text, paddingVertical: 8, fontSize: 14 }}
        />
        <Feather name="plus" size={17} color={palette.primary} />
      </View>
    </View>
  );
}

/** "9:41" de uma contagem em ms. */
function contagem(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}` : `${m}:${String(seg).padStart(2, '0')}`;
}

function Timers({ estado, pairing, recarregar }: { estado: { lista: TimerPc[]; diferenca: number } | null; pairing: Pairing; recarregar: () => void }) {
  const { palette, tokens } = useTheme();
  const [agora, setAgora] = useState(Date.now());
  const [ocupado, setOcupado] = useState(false);
  const vivos = (estado?.lista ?? []).filter(t => t.fimEm - (estado?.diferenca ?? 0) > agora);
  // Relógio de 1 s só enquanto há timer correndo — card parado não acorda a tela.
  useEffect(() => {
    if (!vivos.length) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [vivos.length]);
  if (!estado) return <Text variant="caption" color={palette.textMuted}>O PC não respondeu (ou é anterior à 1.8.0).</Text>;
  async function agir(fn: () => Promise<unknown>) {
    setOcupado(true);
    try { await fn(); haptica.leve(); } catch (e) { Alert.alert('Timers', errMessage(e)); }
    finally { setOcupado(false); recarregar(); }
  }
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {vivos.map(t => (
        <View key={t.id} style={styles.linhaSaude}>
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>{contagem(t.fimEm - estado.diferenca - agora)}</Text>
          <Text variant="body" color={palette.textMuted} style={{ flex: 1 }} numberOfLines={1}>{t.nome || 'timer'}</Text>
          <Pressable accessibilityLabel="Cancelar o timer" accessibilityRole="button" hitSlop={6} disabled={ocupado} onPress={() => agir(() => callRpc(pairing, 'timers.cancel', { id: t.id }))}>
            <Feather name="x" size={16} color={palette.textMuted} />
          </Pressable>
        </View>
      ))}
      {!vivos.length && <Text variant="caption" color={palette.textMuted}>Nenhum correndo. Diga “timer de 10 minutos do miojo” ou toque abaixo.</Text>}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {[5, 10, 15, 25].map(m => (
          <Pressable key={m} disabled={ocupado} onPress={() => agir(() => callRpc(pairing, 'timers.start', { minutos: m }))}
            style={[styles.botaoSaude, { paddingHorizontal: 12, borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
            <Text variant="label" color={palette.primary}>{m} min</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Hoje({ texto, pairing }: { texto: string | null; pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  // O botão olha a fala GLOBAL (08/10): ela segue ao trocar de aba, e voltar à Início com o
  // resumo ainda sendo lido mostra "Parar", não um "Ouvir" que começaria de novo.
  const fala = useFala();
  const [meu, setMeu] = useState(false);
  const falando = meu && fala.falando;
  if (!texto) return <Text variant="caption" color={palette.textMuted}>O PC não respondeu (ou é anterior à 1.7.1).</Text>;
  async function ouvir() {
    haptica.leve();
    if (falando) { pararDeFalar(); return; }
    setMeu(true);
    try { await falar(texto!, pairing); } finally { setMeu(false); }
  }
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="body" style={{ lineHeight: 21 }}>{texto}</Text>
      <Pressable onPress={ouvir} hitSlop={6}
        style={[styles.botaoSaude, { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, paddingHorizontal: 12, borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
        <Feather name={falando ? 'square' : 'volume-2'} size={14} color={palette.primary} />
        <Text variant="label" color={palette.primary}>{falando ? 'Parar' : 'Ouvir'}</Text>
      </Pressable>
    </View>
  );
}

function Aprendi({ lista, pairing, recarregar }: { lista: { id: string; text: string }[] | null; pairing: Pairing; recarregar: () => void }) {
  const { palette, tokens } = useTheme();
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!lista) return <Text variant="caption" color={palette.textMuted}>O PC não respondeu (ou é anterior à 1.6.2).</Text>;
  if (!lista.length) return <Text variant="caption" color={palette.textMuted}>Nada novo. Quando você contar algo sobre você numa conversa, aparece aqui para guardar.</Text>;
  async function decidir(id: string, guardar: boolean) {
    haptica.leve();
    setOcupado(id);
    try { await callRpc(pairing, guardar ? 'memory.aceitar' : 'memory.recusar', { id }); }
    catch (e) { Alert.alert('Memória', errMessage(e)); }
    finally { setOcupado(null); recarregar(); }
  }
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {lista.map(s => (
        <View key={s.id} style={[styles.linhaSaude, { opacity: ocupado === s.id ? 0.5 : 1 }]}>
          <Text variant="body" style={{ flex: 1 }}>{s.text}</Text>
          <Pressable accessibilityLabel="Guardar na memória" accessibilityRole="button" onPress={() => decidir(s.id, true)} disabled={!!ocupado} hitSlop={6}
            style={[styles.botaoSaude, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
            <Feather name="check" size={15} color={palette.primary} />
          </Pressable>
          <Pressable accessibilityLabel="Não guardar" accessibilityRole="button" onPress={() => decidir(s.id, false)} disabled={!!ocupado} hitSlop={6}
            style={[styles.botaoSaude, { borderRadius: tokens.radii.md, backgroundColor: palette.errorSoft }]}>
            <Feather name="x" size={15} color={palette.error} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Foco({ estado, pairing, recarregar }: { estado: EstadoFoco | null; pairing: Pairing; recarregar: () => void }) {
  const { palette, tokens } = useTheme();
  const [ocupado, setOcupado] = useState(false);
  if (!estado) return <Text variant="caption" color={palette.textMuted}>O PC não tem o modo foco (atualize para a 1.5.6) ou não respondeu.</Text>;

  async function agir(fn: () => Promise<unknown>) {
    haptica.medio();
    setOcupado(true);
    try { await fn(); haptica.sucesso(); } catch (e) { haptica.erro(); Alert.alert('Modo foco', errMessage(e)); }
    finally { setOcupado(false); recarregar(); }
  }

  if (estado.ativo && estado.ate) {
    const min = Math.max(0, Math.ceil((estado.ate - Date.now()) / 60000));
    return (
      <View style={{ gap: tokens.spacing.sm, opacity: ocupado ? 0.5 : 1 }}>
        <Text variant="heading" color={palette.primary}>{min} min</Text>
        <Text variant="caption" color={palette.textMuted}>
          {estado.fechar ? 'Fechando' : 'Avisando sobre'} {estado.apps.slice(0, 4).join(', ')}{estado.apps.length > 4 ? '…' : ''} · {estado.distracoes === 1 ? '1 distração' : `${estado.distracoes} distrações`}
        </Text>
        <Pressable onPress={() => agir(() => callRpc(pairing, 'foco.stop'))} disabled={ocupado}
          style={[styles.botaoSaude, { borderRadius: tokens.radii.md, backgroundColor: palette.errorSoft, alignSelf: 'flex-start' }]}>
          <Text variant="caption" color={palette.error}>Parar</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ gap: tokens.spacing.sm, opacity: ocupado ? 0.5 : 1 }}>
      <Text variant="caption" color={palette.textMuted}>Abrir {(estado.listaPadrao ?? estado.apps).slice(0, 3).join(', ')} e afins vira aviso no PC.</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[25, 50, 90].map(m => (
          <Pressable key={m} onPress={() => agir(() => callRpc(pairing, 'foco.start', { minutos: m }))} disabled={ocupado}
            style={[styles.botaoSaude, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
            <Text variant="caption" color={palette.primary}>{m} min</Text>
          </Pressable>
        ))}
      </View>
    </View>
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
  navegar: (t: 'chat' | 'control' | 'rotinas') => void;
  abrirPlayer: () => void;
}) {
  const { palette, tokens } = useTheme();
  // Fase 22: Rotinas saiu das abas; daqui abre a gaveta.
  const itens = [
    { chave: 'chat', label: 'Conversar', icone: 'message-circle' as const, acao: () => navegar('chat') },
    { chave: 'control', label: 'Controlar', icone: 'monitor' as const, acao: () => navegar('control') },
    { chave: 'player', label: 'Música', icone: 'music' as const, acao: abrirPlayer },
    { chave: 'rotinas', label: 'Rotinas', icone: 'repeat' as const, acao: () => navegar('rotinas') },
  ];
  return (
    <View style={styles.grade}>
      {itens.map(i => (
        <Pressable
          key={i.chave}
          onPress={i.acao}
          style={({ pressed }) => [styles.ladrilho, VIDRO_BOTAO, { borderRadius: tokens.radii.lg, opacity: pressed ? 0.75 : 1 }]}
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
          <Pressable accessibilityLabel="Confirmar a hora" accessibilityRole="button" onPress={confirmarHora} style={[styles.botaoIcone, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
            <Feather name="check" size={16} color={palette.primary} />
          </Pressable>
          <Pressable accessibilityLabel="Fechar" accessibilityRole="button" onPress={() => { setAbrindoHora(false); setHoraTexto(''); }} style={styles.botaoIcone}>
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
