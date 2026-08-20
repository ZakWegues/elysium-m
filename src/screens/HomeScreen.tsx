import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, PanResponder, Pressable, RefreshControl, ScrollView,
  StyleSheet, TextInput, View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  callRpc, Clima, DiskEntry, PowerOperation, ProcessEntry, Reminder, Sugestao,
} from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { findMetric } from '../lib/telemetryFormat';
import { MOV, animarProximoLayout, anima } from '../lib/motion';
import { useTheme } from '../theme';
import { SpotifyBar } from './SpotifyPlayer';
import { Card, MetricBar, ScreenHeader, Text } from '../components/ui';

/**
 * Tela inicial: um catálogo de cards, não uma tela fixa.
 *
 * A versão anterior tinha header, player, quatro atalhos, métricas, lembretes e energia —
 * nessa ordem, sempre. Agora cada card se declara num registro, sabe o que precisa buscar,
 * e pode ser ligado, desligado e arrastado para outro lugar. É o espelho do que o desktop
 * ganhou no mesmo bloco, e os dois leem pelos mesmos métodos RPC.
 *
 * ⚠️ O arrasto usa `PanResponder` + `Animated`, ambos do core do React Native. Não entra
 * `react-native-gesture-handler` nem `reanimated`: são dependências NATIVAS, mudariam o
 * fingerprint do `expo-updates` e obrigariam a gerar um APK novo. Isto precisa viajar por
 * `npm run update`.
 */

const CHAVE_CARDS = 'elysium_home_cards';

type Dados = {
  telemetria: TelemetryFrame | null;
  lembretes: Reminder[];
  sugestoes: Sugestao[];
  clima: Clima | null;
  processos: ProcessEntry[];
  discos: DiskEntry[];
  transferencia: string;
};

type Ctx = {
  dados: Dados;
  pairing: Pairing;
  ocupado: boolean;
  navegar: (tela: 'chat' | 'control') => void;
  abrirPlayer: () => void;
  energia: (op: PowerOperation, label: string, aviso: string) => void;
  executarSugestao: (s: Sugestao) => void;
  criarLembrete: (texto: string, hora: Date) => Promise<void>;
  recarregar: () => void;
};

type DefCard = {
  titulo: string;
  icone: keyof typeof Feather.glyphMap;
  /** Chaves de dado que este card consome — só o que os visíveis pedem é buscado. */
  precisa: (keyof Dados)[];
  corpo: (c: Ctx) => React.ReactNode;
};

/** Ordem de fábrica. Card fora desta lista existe, mas nasce desligado. */
const CARDS_PADRAO = ['sugestoes', 'computador', 'musica', 'lembretes', 'atalhos', 'energia'];

export default function HomeScreen({
  pairing,
  onNavigate,
  onOpenPlayer,
  onUnpair,
}: {
  pairing: Pairing;
  onNavigate: (screen: 'chat' | 'control') => void;
  onOpenPlayer: () => void;
  onUnpair: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [telemetria, setTelemetria] = useState<TelemetryFrame | null>(null);
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [dados, setDados] = useState<Dados>({
    telemetria: null, lembretes: [], sugestoes: [], clima: null,
    processos: [], discos: [], transferencia: '',
  });
  const [ocupado, setOcupado] = useState(false);
  const [ordem, setOrdem] = useState<string[]>(CARDS_PADRAO);
  const [ocultos, setOcultos] = useState<string[]>([]);
  /** Fixos ficam no topo e não saem do lugar quando os outros são arrastados. */
  const [fixos, setFixos] = useState<string[]>(['clima']);
  const [editando, setEditando] = useState(false);

  useEffect(() => openTelemetryStream(pairing, setTelemetria, setStatus),
    [pairing.activeIp, pairing.port, pairing.token]);

  // ── ordem gravada
  useEffect(() => {
    (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE_CARDS);
        if (!bruto) return;
        const salvo = JSON.parse(bruto) as { ordem?: string[]; ocultos?: string[]; fixos?: string[] };
        const conhecidos = (salvo.ordem ?? []).filter(id => id in CARDS);
        // Card novo numa versão futura precisa aparecer para quem já tinha configuração
        // gravada — senão nasce invisível e ninguém descobre que existe.
        const faltando = Object.keys(CARDS).filter(id => !conhecidos.includes(id));
        setOrdem([...conhecidos, ...faltando]);
        setOcultos([
          ...(salvo.ocultos ?? []).filter(id => id in CARDS),
          ...faltando.filter(id => !CARDS_PADRAO.includes(id)),
        ]);
        // Configuração gravada antes desta versão não tem `fixos` — nasce sem nenhum, em
        // vez de reimpor o padrão de fábrica por cima de uma escolha já feita.
        setFixos((salvo.fixos ?? []).filter(id => id in CARDS));
      } catch { /* fica com o padrão */ }
    })();
  }, []);

  const gravar = useCallback(async (o: string[], oc: string[], fx: string[] = fixos) => {
    try { await AsyncStorage.setItem(CHAVE_CARDS, JSON.stringify({ ordem: o, ocultos: oc, fixos: fx })); }
    catch { /* segue com o que está na tela */ }
  }, [fixos]);

  const visiveis = useMemo(() => {
    const vis = ordem.filter(id => id in CARDS && !ocultos.includes(id));
    // Fixos primeiro, na ordem em que foram fixados; o resto mantém a ordem arrastada.
    const fx = fixos.filter(id => vis.includes(id));
    return [...fx, ...vis.filter(id => !fx.includes(id))];
  }, [ordem, ocultos, fixos]);

  // ── busca: só o que os cards visíveis pedem
  const carregar = useCallback(async () => {
    const precisa = new Set(visiveis.flatMap(id => CARDS[id].precisa));
    const d: Partial<Dados> = {};
    const jobs: Promise<void>[] = [];
    // Cada fonte falha por conta própria: o clima sem rede ou o Spotify deslogado não
    // podem derrubar a tela inteira, que é o que um `Promise.all` cru faria.
    const puxar = async <K extends keyof Dados>(k: K, fn: () => Promise<Dados[K]>) => {
      try { d[k] = await fn(); } catch { /* fonte muda */ }
    };

    if (precisa.has('lembretes')) jobs.push(puxar('lembretes', async () =>
      (await callRpc(pairing, 'reminders.list')).reminders
        .filter(r => !r.firedAt && r.dueAt > Date.now())
        .sort((a, b) => a.dueAt - b.dueAt)));
    if (precisa.has('sugestoes')) jobs.push(puxar('sugestoes', async () =>
      (await callRpc(pairing, 'suggestions.list')).suggestions));
    if (precisa.has('clima')) jobs.push(puxar('clima', async () =>
      await callRpc(pairing, 'weather.now')));
    if (precisa.has('processos')) jobs.push(puxar('processos', async () =>
      (await callRpc(pairing, 'system.processes')).processes
        .slice().sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))));
    if (precisa.has('discos')) jobs.push(puxar('discos', async () =>
      (await callRpc(pairing, 'system.disks')).disks));
    if (precisa.has('transferencia')) jobs.push(puxar('transferencia', async () =>
      (await callRpc(pairing, 'clipboard.get')).text));

    await Promise.all(jobs);
    setDados(prev => ({ ...prev, ...d }));
  }, [pairing, visiveis]);

  useEffect(() => { carregar(); }, [carregar]);

  function tratarErro(err: unknown, contexto: string) {
    if (err instanceof AuthError) {
      Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
      onUnpair();
      return;
    }
    Alert.alert(contexto, errMessage(err));
  }

  async function energia(op: PowerOperation, label: string, aviso: string) {
    const ok = await confirmDestructive(`${label} o PC?`, aviso);
    if (ok !== 'confirmed') return;
    setOcupado(true);
    try {
      const res = await callRpc(pairing, 'power.control', { operation: op }, { confirmed: true });
      Alert.alert('ELYSIUM-M', res.message);
    } catch (err) { tratarErro(err, `Falha ao ${label.toLowerCase()}`); }
    finally { setOcupado(false); }
  }

  async function executarSugestao(s: Sugestao) {
    if (s.acao?.aba === 'chat' || s.acao?.aba === 'control') { onNavigate(s.acao.aba); return; }
    if (!s.acao?.metodo || s.acao.metodo.startsWith('__')) return;
    setOcupado(true);
    try {
      await callRpc(pairing, s.acao.metodo as never, s.acao.params as never);
      Alert.alert('ELYSIUM-M', s.acao.aviso ?? 'Feito.');
      await carregar();
    } catch (err) { tratarErro(err, 'Não consegui executar'); }
    finally { setOcupado(false); }
  }

  async function criarLembrete(texto: string, quando: Date) {
    await callRpc(pairing, 'reminders.create', { text: texto, dueAt: quando.getTime() });
    await carregar();
  }

  const ctx: Ctx = {
    dados: { ...dados, telemetria },
    pairing, ocupado,
    navegar: onNavigate, abrirPlayer: onOpenPlayer,
    energia, executarSugestao, criarLembrete, recarregar: carregar,
  };

  // ── arrastar: troca com o vizinho ao passar de meio card
  function mover(de: number, para: number) {
    if (para < 0 || para >= visiveis.length || de === para) return;

    const novaVisivel = visiveis.slice();
    const [movido] = novaVisivel.splice(de, 1);
    novaVisivel.splice(para, 0, movido);

    // A ordem gravada inclui os ocultos, e eles precisam ficar onde estão: percorre a
    // ordem antiga e, a cada posição que era de um card visível, encaixa o próximo da
    // sequência nova. Reordenar só a lista visível e concatenar o resto jogaria todo card
    // desligado para o fim — e ligar um de volta o faria reaparecer no lugar errado.
    let i = 0;
    const nova = ordem.map(id => (visiveis.includes(id) ? novaVisivel[i++] : id));

    animarProximoLayout();
    setOrdem(nova);
    gravar(nova, ocultos);
  }

  const online = status === 'open';

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="ELYSIUM-M"
        right={
          <View style={styles.linhaStatus}>
            <Pressable
              onPress={() => { animarProximoLayout(); setEditando(v => !v); }}
              hitSlop={10}
              style={{ marginRight: 10 }}
            >
              <Feather name="sliders" size={17} color={editando ? palette.primary : palette.textMuted} />
            </Pressable>
            <View style={[styles.ponto, { backgroundColor: online ? palette.success : palette.error }]} />
            <Text variant="caption" color={online ? palette.success : palette.error}>
              {online ? 'PC online' : 'PC offline'}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={carregar} tintColor={palette.primary} />}
        // Enquanto se arrasta um card, a rolagem tem que ficar quieta — senão o dedo faz
        // as duas coisas ao mesmo tempo.
        scrollEnabled={!editando}
      >
        {editando && (
          <Card glass style={{ gap: tokens.spacing.sm }}>
            <Text variant="label">Cards da tela</Text>
            <View style={styles.chips}>
              {Object.entries(CARDS).map(([id, def]) => {
                const ligado = !ocultos.includes(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      const novos = ligado ? [...ocultos, id] : ocultos.filter(x => x !== id);
                      animarProximoLayout();
                      setOcultos(novos);
                      gravar(ordem, novos);
                    }}
                    style={[styles.chip, {
                      borderRadius: tokens.radii.full,
                      backgroundColor: ligado ? palette.primarySoft : 'transparent',
                      borderColor: palette.glassBorder,
                    }]}
                  >
                    <Feather name={def.icone} size={13} color={ligado ? palette.primary : palette.textMuted} />
                    <Text variant="caption" color={ligado ? palette.primary : palette.textMuted}>{def.titulo}</Text>
                    <Pressable
                      onPress={() => {
                        const novos = fixos.includes(id) ? fixos.filter(x => x !== id) : [...fixos, id];
                        animarProximoLayout();
                        setFixos(novos);
                        gravar(ordem, ocultos, novos);
                      }}
                      hitSlop={6}
                    >
                      <Feather name="bookmark" size={12} color={fixos.includes(id) ? palette.accent : palette.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" color={palette.textMuted}>
              Segure e arraste um card para trocar de lugar.
            </Text>
          </Card>
        )}

        {visiveis.map((id, i) => (
          <CardArrastavel
            key={id}
            indice={i}
            ativo={editando && !fixos.includes(id)}
            onMover={mover}
          >
            <Card glass style={{ gap: tokens.spacing.sm }}>
              <View style={styles.cabecalho}>
                <Feather name={CARDS[id].icone} size={14} color={palette.textMuted} />
                <Text variant="label" color={palette.textMuted}>{CARDS[id].titulo}</Text>
                {editando && <Feather name="menu" size={14} color={palette.textMuted} style={{ marginLeft: 'auto' }} />}
              </View>
              {CARDS[id].corpo(ctx)}
            </Card>
          </CardArrastavel>
        ))}

        {visiveis.length === 0 && (
          <Text variant="caption" color={palette.textMuted}>
            Todos os cards estão desligados. Toque no ícone acima para escolher.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Envelope arrastável. Só responde ao toque no modo de edição — fora dele, o card inteiro
 * continua clicável normalmente, e um gesto de rolagem não deve ser confundido com arrasto.
 */
function CardArrastavel({
  indice, ativo, onMover, children,
}: {
  indice: number;
  ativo: boolean;
  onMover: (de: number, para: number) => void;
  children: React.ReactNode;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const altura = useRef(120);
  const acumulado = useRef(0);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Só assume o gesto depois de 6px na vertical: abaixo disso ainda pode ser um toque.
    onMoveShouldSetPanResponder: (_e, g) => ativo && Math.abs(g.dy) > 6,
    onPanResponderMove: (_e, g) => {
      y.setValue(g.dy);
      const passos = Math.round(g.dy / altura.current);
      if (passos !== acumulado.current) {
        onMover(indice, indice + (passos - acumulado.current));
        acumulado.current = passos;
      }
    },
    onPanResponderRelease: () => {
      acumulado.current = 0;
      anima(y, 0, MOV.base).start();
    },
  }), [ativo, indice, onMover]);

  return (
    <Animated.View
      {...(ativo ? pan.panHandlers : {})}
      onLayout={e => { altura.current = e.nativeEvent.layout.height + 12; }}
      style={{ transform: [{ translateY: y }] }}
    >
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────
// O CATÁLOGO
// ─────────────────────────────────────────────────

const CARDS: Record<string, DefCard> = {
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
    corpo: ({ energia, ocupado }) => <Energia acionar={energia} ocupado={ocupado} />,
  },
};

// ─────────────────────────────────────────────────
// CORPOS
// ─────────────────────────────────────────────────

function Bolhas({ lista, onToque }: { lista: Sugestao[]; onToque: (s: Sugestao) => void }) {
  const { palette, tokens } = useTheme();
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
  acionar, ocupado,
}: {
  acionar: (op: PowerOperation, label: string, aviso: string) => void;
  ocupado: boolean;
}) {
  const { palette, tokens } = useTheme();
  const botoes = [
    { op: 'lock' as const, label: 'Bloquear', icone: 'lock' as const, aviso: 'A tela do PC será bloqueada.' },
    { op: 'sleep' as const, label: 'Suspender', icone: 'moon' as const, aviso: 'O PC vai suspender.' },
    { op: 'shutdown' as const, label: 'Desligar', icone: 'power' as const, aviso: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
  ];
  return (
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
  );
}

const styles = StyleSheet.create({
  linhaStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
  bolha: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%' },
  linhaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  climaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  campo: { paddingVertical: 8, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 13 },
  botaoIcone: { paddingVertical: 9, paddingHorizontal: 12 },
  caixaTexto: { padding: 10, borderWidth: StyleSheet.hairlineWidth },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ladrilho: { flexGrow: 1, minWidth: '30%', alignItems: 'center', gap: 6, paddingVertical: 16 },
  linhaEnergia: { flexDirection: 'row', gap: 8 },
  botaoEnergia: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12 },
});
