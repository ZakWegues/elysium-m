import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, TextInput, View,
} from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { falar } from '../lib/falar';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  callRpc, AppEntry, CapturedFrame, DiskEntry, Episodio, MemoryFact,
  PowerOperation, ProcessEntry, Reminder, ScreenInfo,
  Janela, Armazenamento,
} from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { MOV } from '../lib/motion';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { findMetric } from '../lib/telemetryFormat';
import { useTheme } from '../theme';
import TrackpadFullscreen from './TrackpadFullscreen';
import { BarraMidia } from '../components/BarraMidia';
import { MiniTrackpad } from '../components/MiniTrackpad';
import SpotifyPlayer, { SpotifyBar } from './SpotifyPlayer';
import { useAbaAtiva } from '../components/AbaViva';
import { avisarTokenRecusado } from '../lib/erroRpc';
import {
  Button, Card, GlassCircle, GlassModal, MetricBar, ScreenHeader, Text, Toque,
} from '../components/ui';

/**
 * Cadência do espelhamento. Medido no PC do Zak: cada captura leva ~640 ms, e esse
 * custo é fixo do `desktopCapturer` — não muda com o tamanho pedido. O teto real é
 * ~1,5 quadro por segundo. Isto é "dar uma olhada na tela", não vídeo.
 */
const REFRESH_MS = 1200;
/** Como o tamanho não afeta a latência, vale pedir um quadro grande: só custa banda. */
const MIRROR_MAX_WIDTH = 1100;
const MIRROR_QUALITY = 60;

type ErrorHandler = (err: unknown, context: string) => void;

/**
 * Os painéis da aba PC. Cada um abre numa gaveta de vidro (`GlassModal`) por cima da
 * tela, a partir de um azulejo na grade.
 *
 * 🔴 POR QUE AZULEJOS, E NÃO GAVETAS EMPILHADAS. Até o bloco 55 esta tela era o espelho
 * mais OITO `Drawer` recolhíveis um embaixo do outro. Oito cabeçalhos iguais em coluna
 * leem como lista de configuração, não como painel de controle — e para chegar em
 * "Energia" era preciso rolar por todos os outros fechados. Uma grade de 2 colunas põe as
 * oito funções na mesma dobra, com ícone grande e um resumo do que há lá dentro. Abrir um
 * painel não empurra os outros: ele sobe por cima e volta com o botão físico de voltar.
 */
type PainelId =
  | 'lembretes' | 'memoria' | 'monitor' | 'processos'
  | 'programas' | 'janelas' | 'energia' | 'transferencia' | 'armazenamento';

const PAINEIS: {
  id: PainelId | 'spotify';
  titulo: string;
  icone: keyof typeof Feather.glyphMap;
  resumo: string;
  /** Cor do ícone quando não é a primária — só o Spotify, que tem marca própria. */
  cor?: string;
}[] = [
  { id: 'lembretes', titulo: 'Lembretes', icone: 'bell', resumo: 'Ver e cancelar' },
  { id: 'memoria', titulo: 'O que a Ely sabe', icone: 'bookmark', resumo: 'Fatos e conversas' },
  { id: 'monitor', titulo: 'Monitor', icone: 'activity', resumo: 'CPU, RAM e discos' },
  { id: 'processos', titulo: 'Processos', icone: 'cpu', resumo: 'Encerrar à força' },
  { id: 'programas', titulo: 'Programas', icone: 'grid', resumo: 'Abertos, abrir e fechar' },
  { id: 'janelas', titulo: 'Janelas', icone: 'layers', resumo: 'Focar, minimizar, só esta' },
  { id: 'armazenamento', titulo: 'Armazenamento', icone: 'hard-drive', resumo: 'O que ocupa o disco' },
  { id: 'energia', titulo: 'Energia', icone: 'power', resumo: 'Bloquear, desligar' },
  { id: 'transferencia', titulo: 'Transferência', icone: 'clipboard', resumo: 'Colar entre os dois' },
  { id: 'spotify', titulo: 'Spotify', icone: 'music', resumo: 'Player completo', cor: '#1db954' },
];

/**
 * Guia única de controle do PC: espelho no topo, teclas de mídia logo abaixo (a ação
 * mais frequente de um controle remoto merece ficar sem toque extra) e a grade de painéis.
 */
export default function ControlScreen({
  pairing,
  onUnpair,
  pedidoTrackpad,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  /** Fase 22: atalho "Trackpad" do ícone — cada número novo abre o trackpad. */
  pedidoTrackpad?: number;
}) {
  const { palette, tokens } = useTheme();
  const [trackpadOpen, setTrackpadOpen] = useState(false);
  useEffect(() => { if (pedidoTrackpad) setTrackpadOpen(true); }, [pedidoTrackpad]);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [painel, setPainel] = useState<PainelId | null>(null);

  const handleError = useCallback<ErrorHandler>((err, context) => {
    if (err instanceof AuthError) {
      // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
      avisarTokenRecusado();
      return;
    }
    haptica.erro();
    Alert.alert(context, errMessage(err));
  }, [onUnpair]);

  const fecharPainel = useCallback(() => setPainel(null), []);
  const tituloPainel = PAINEIS.find(p => p.id === painel)?.titulo;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="PC" />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
        <MirrorPanel pairing={pairing} onError={handleError} />

        {/* Só aparece quando há algo tocando. Toque abre o player em tela cheia. */}
        <SpotifyBar pairing={pairing} onOpen={() => setPlayerOpen(true)} />

        <BarraMidia pairing={pairing} onError={handleError} />

        {/* Fase 22: botão grande + faixa que já move o cursor aqui mesmo. */}
        <MiniTrackpad pairing={pairing} onAbrir={() => setTrackpadOpen(true)} />

        <View style={styles.grade}>
          {PAINEIS.map((p, i) => (
            <Animated.View
              key={p.id}
              style={styles.celula}
              // Escalonado em 30 ms por azulejo: a grade "assenta" em vez de piscar
              // inteira. 8 × 30 = 240 ms no último, dentro do teto de 300 do bloco 24.
              entering={FadeInDown.delay(i * 30).duration(MOV.base).reduceMotion(ReduceMotion.System)}
            >
              <Toque
                onPress={() => (p.id === 'spotify' ? setPlayerOpen(true) : setPainel(p.id))}
                style={{ flex: 1 }}
              >
                <Card glass style={styles.azulejo}>
                  <View style={[styles.iconeAzulejo, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
                    <Feather name={p.icone} size={20} color={p.cor ?? palette.primary} />
                  </View>
                  <Text variant="label" numberOfLines={1}>{p.titulo}</Text>
                  <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{p.resumo}</Text>
                </Card>
              </Toque>
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <TrackpadFullscreen
        pairing={pairing}
        visible={trackpadOpen}
        onClose={() => setTrackpadOpen(false)}
        onError={handleError}
      />

      <SpotifyPlayer
        pairing={pairing}
        visible={playerOpen}
        onClose={() => setPlayerOpen(false)}
      />

      {/* Um só GlassModal para todos os painéis: o conteúdo é decidido pelo id. O corpo
          monta quando a gaveta abre e desmonta ao fechar — é o que faz cada painel
          carregar os dados dele só quando alguém pede, como as gavetas faziam. */}
      <GlassModal visible={painel !== null} onClose={fecharPainel} title={tituloPainel}>
        {painel === 'lembretes' && <PainelLembretes pairing={pairing} onError={handleError} />}
        {painel === 'memoria' && <PainelMemoria pairing={pairing} onError={handleError} />}
        {painel === 'monitor' && <PainelMonitor pairing={pairing} />}
        {painel === 'processos' && <PainelProcessos pairing={pairing} onError={handleError} />}
        {painel === 'programas' && <PainelProgramas pairing={pairing} onError={handleError} />}
        {painel === 'janelas' && <PainelJanelas pairing={pairing} onError={handleError} />}
        {painel === 'armazenamento' && <PainelArmazenamento pairing={pairing} onError={handleError} />}
        {painel === 'energia' && <PainelEnergia pairing={pairing} onError={handleError} />}
        {painel === 'transferencia' && <PainelTransferencia pairing={pairing} onError={handleError} />}
      </GlassModal>
    </View>
  );
}

// ── Espelho (sempre visível) ──────────────────────────────────────────────────

function MirrorPanel({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  // Evita empilhar requisições quando um quadro demora mais que o intervalo.
  const inFlight = useRef(false);
  const stopped = useRef(false);

  const grab = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const f = await callRpc(
        pairing,
        'screen.capture',
        { sourceId, maxWidth: MIRROR_MAX_WIDTH, quality: MIRROR_QUALITY },
        { timeoutMs: 15000 }
      );
      if (!stopped.current) {
        setFrame(f);
        setError(null);
      }
    } catch (err) {
      if (err instanceof AuthError) { onError(err, 'Espelho'); return; }
      // Falha de quadro é comum e transitória (PC ocupado); mostra sem parar o loop.
      if (!stopped.current) setError(errMessage(err));
    } finally {
      inFlight.current = false;
    }
  }, [pairing, sourceId, onError]);

  useEffect(() => {
    stopped.current = false;
    callRpc(pairing, 'screen.list')
      .then(r => setScreens(r.screens))
      .catch(() => setScreens([]));
    return () => { stopped.current = true; };
  }, [pairing]);

  // Espelho só com a aba PC à vista (08/10): escondida, a aba fica montada mas não captura.
  const ativa = useAbaAtiva();
  useEffect(() => {
    if (!live || !ativa) return;
    grab();
    const timer = setInterval(grab, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, ativa, grab]);

  /**
   * O PC captura a tela de novo e manda para o modelo de visão. Não reaproveitamos o
   * quadro já baixado de propósito: o do espelho é comprimido para caber na rede, e
   * texto pequeno — que costuma ser justo o que se quer ler — não sobrevive a isso.
   */
  async function askScreen() {
    setAsking(true);
    setAnswer(null);
    try {
      const res = await callRpc(pairing, 'vision.screen', {}, { timeoutMs: 90000 });
      setAnswer(res.answer);
      haptica.sucesso();
      falar(res.answer, pairing);
    } catch (err) {
      onError(err, 'Falha ao interpretar a tela');
    } finally {
      setAsking(false);
    }
  }

  /** Salva um PNG na Área de Trabalho do PC — o espelho não guarda nada. */
  const [printando, setPrintando] = useState(false);
  async function tirarPrint() {
    setPrintando(true);
    try {
      const r = await callRpc(pairing, 'screen.screenshot', {}, { timeoutMs: 20000 });
      haptica.sucesso();
      Alert.alert('Print', r.message);
    } catch (err) {
      onError(err, 'Falha ao tirar o print');
    } finally {
      setPrintando(false);
    }
  }

  const aspect = frame ? frame.width / Math.max(1, frame.height) : 16 / 9;

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {frame ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${frame.base64}` }}
          style={{ width: '100%', aspectRatio: aspect, borderRadius: tokens.radii.md, backgroundColor: '#000' }}
          resizeMode="contain"
        />
      ) : (
        <Card style={styles.centerCard}>
          <ActivityIndicator color={palette.primary} />
          <Text variant="caption" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
            Capturando a tela do PC…
          </Text>
        </Card>
      )}

      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setLive(v => !v)}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
        >
          <Feather name={live ? 'pause' : 'play'} size={14} color={palette.primary} />
          <Text variant="caption" color={palette.primary}>{live ? 'Congelar' : 'Retomar'}</Text>
        </Pressable>

        <Pressable
          onPress={grab}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
        >
          <Feather name="refresh-cw" size={14} color={palette.primary} />
          <Text variant="caption" color={palette.primary}>Atualizar</Text>
        </Pressable>

        <Pressable
          onPress={tirarPrint}
          disabled={printando}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}
        >
          {printando
            ? <ActivityIndicator size="small" color={palette.primary} />
            : <Feather name="camera" size={14} color={palette.primary} />}
          <Text variant="caption" color={palette.primary}>Print</Text>
        </Pressable>

        <Pressable
          onPress={askScreen}
          disabled={asking}
          style={[styles.pill, { borderRadius: tokens.radii.full, backgroundColor: palette.primary }]}
        >
          {asking
            ? <ActivityIndicator size="small" color={palette.onPrimary} />
            : <Feather name="help-circle" size={14} color={palette.onPrimary} />}
          <Text variant="caption" color={palette.onPrimary}>Perguntar sobre a tela</Text>
        </Pressable>

        {screens.length > 1 && screens.map(s => {
          const active = (sourceId ?? screens[0]?.id) === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSourceId(s.id)}
              style={[
                styles.pill,
                { borderRadius: tokens.radii.full, backgroundColor: active ? palette.primary : palette.primarySoft },
              ]}
            >
              <Text variant="caption" color={active ? palette.onPrimary : palette.primary}>
                {s.name}{s.isPrimary ? ' ★' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {answer && (
        <Card glass style={{ gap: tokens.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
            <Feather name="eye" size={14} color={palette.primary} />
            <Text variant="label" color={palette.primary}>O que ele viu</Text>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityLabel="Fechar" accessibilityRole="button" onPress={() => setAnswer(null)} hitSlop={10}>
              <Feather name="x" size={16} color={palette.textMuted} />
            </Pressable>
          </View>
          <Text variant="body">{answer}</Text>
        </Card>
      )}

      {error && <Text variant="caption" color={palette.error}>{error}</Text>}
    </View>
  );
}

// ── Lembretes ─────────────────────────────────────────────────────────────────

function formatDue(dueAt: number): string {
  const d = new Date(dueAt);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR')} às ${hora}`;
}

function PainelLembretes({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRpc(pairing, 'reminders.list');
      setReminders(res.reminders.filter(r => !r.firedAt));
    } catch (err) {
      onError(err, 'Falha ao listar lembretes');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  useEffect(() => { load(); }, [load]);

  async function cancel(reminder: Reminder) {
    try {
      await callRpc(pairing, 'reminders.cancel', { id: reminder.id });
      haptica.medio();
      setReminders(prev => prev.filter(r => r.id !== reminder.id));
    } catch (err) {
      onError(err, 'Falha ao cancelar');
    }
  }

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Dica texto="Criar por voz é mais rápido: “me lembra daqui a 10 minutos de…”" />
      {loading && <ActivityIndicator color={palette.primary} />}
      {!loading && reminders.length === 0 && <Vazio icone="bell-off" texto="Nenhum lembrete agendado." />}
      {reminders.map(r => (
        <View key={r.id} style={styles.procRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">{r.text}</Text>
            <Text variant="caption" color={palette.textMuted}>
              {r.kind === 'weekly' ? 'toda semana ' : ''}{formatDue(r.dueAt)}
            </Text>
          </View>
          <Pressable accessibilityLabel="Cancelar o lembrete" accessibilityRole="button" onPress={() => cancel(r)} hitSlop={10}>
            <Feather name="x-circle" size={20} color={palette.error} />
          </Pressable>
        </View>
      ))}
      <Text variant="caption" color={palette.textMuted}>
        Quando disparar, o PC fala e manda uma notificação para o celular — mesmo fora de casa.
      </Text>
    </View>
  );
}

// ── Memória ───────────────────────────────────────────────────────────────────

export function PainelMemoria({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  // Fase 18: busca e correção do que a Ely sabe (o painel de memória que a pesquisa pediu).
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<MemoryFact | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visiveis = busca.trim() ? facts.filter(f => semAcento(f.text).includes(semAcento(busca.trim()))) : facts;
  async function salvarEdicao() {
    const f = editando;
    if (!f) return; // o blur depois do submit não grava de novo
    const texto = textoEdicao.trim();
    setEditando(null);
    if (!f || !texto || texto === f.text) return;
    try {
      const res = await callRpc(pairing, 'memory.edit', { id: f.id, text: texto });
      haptica.sucesso();
      setFacts(prev => prev.map(x => (x.id === f.id ? res.fact : x)));
    } catch (err) { onError(err, 'Falha ao corrigir'); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRpc(pairing, 'memory.list');
      setFacts(res.facts);
    } catch (err) {
      onError(err, 'Falha ao ler a memória');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  useEffect(() => { load(); }, [load]);

  // Fase 19 (bloco 190): as conversas que a Ely lembra e o modo anônimo. PC antigo não tem
  // esses métodos: a seção simplesmente não aparece.
  const [episodios, setEpisodios] = useState<Episodio[] | null>(null);
  const [anonimo, setAnonimo] = useState(false);
  useEffect(() => {
    callRpc(pairing, 'episodios.list').then(r => setEpisodios(r.episodios)).catch(() => setEpisodios(null));
    callRpc(pairing, 'memoria.anonimo.get').then(r => setAnonimo(r.anonimo)).catch(() => {});
  }, [pairing]);
  async function alternarAnonimo(ligar: boolean) {
    setAnonimo(ligar);
    try { setAnonimo((await callRpc(pairing, 'memoria.anonimo.set', { ligar })).anonimo); haptica.leve(); }
    catch (err) { setAnonimo(!ligar); onError(err, 'Falha no modo anônimo'); }
  }
  function apagarEpisodio(ep: Episodio) {
    Alert.alert('Apagar da memória?', `A Ely esquece esta conversa: "${ep.resumo}"`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try {
          await callRpc(pairing, 'episodios.delete', { id: ep.id }, { confirmed: true });
          haptica.medio();
          setEpisodios(prev => (prev ?? []).filter(e => e.id !== ep.id));
        } catch (err) { onError(err, 'Falha ao apagar'); }
      } },
    ]);
  }

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const res = await callRpc(pairing, 'memory.add', { text });
      if (res.created) { haptica.sucesso(); setFacts(prev => [...prev, res.fact]); }
    } catch (err) {
      onError(err, 'Falha ao guardar');
    }
  }

  function remove(fact: MemoryFact) {
    Alert.alert('Esquecer?', `A Ely deixa de saber: "${fact.text}"`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Esquecer', style: 'destructive', onPress: async () => {
        try {
          await callRpc(pairing, 'memory.remove', { id: fact.id }, { confirmed: true });
          haptica.medio();
          setFacts(prev => prev.filter(f => f.id !== fact.id));
        } catch (err) {
          onError(err, 'Falha ao esquecer');
        }
      } },
    ]);
  }

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Dica texto="Fatos curtos que a Ely usa nas conversas. Até 60, de 200 letras cada — toque num para corrigir." />
      {loading && <ActivityIndicator color={palette.primary} />}
      {!loading && facts.length === 0 && <Vazio icone="bookmark" texto="Nada guardado ainda." />}
      {facts.length > 5 && (
        <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar na memória" placeholderTextColor={palette.textMuted}
          style={[styles.input, { flex: 0, borderRadius: tokens.radii.md, borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]} />
      )}
      {visiveis.map(f => (
        editando?.id === f.id ? (
          <View key={f.id} style={[styles.procRow, { gap: 8 }]}>
            <TextInput value={textoEdicao} onChangeText={setTextoEdicao} autoFocus maxLength={200} onSubmitEditing={salvarEdicao} onBlur={salvarEdicao} multiline submitBehavior="blurAndSubmit"
              style={[styles.input, { borderRadius: tokens.radii.md, borderColor: palette.primary, color: palette.text, backgroundColor: palette.surface }]} />
          </View>
        ) : (
          <View key={f.id} style={styles.procRow}>
            <Pressable onPress={() => { setEditando(f); setTextoEdicao(f.text); }} accessibilityRole="button" accessibilityLabel={`Corrigir: ${f.text}`} style={{ flex: 1, gap: 2 }}>
              <Text variant="body">{f.text}</Text>
              <Text variant="caption" color={palette.textMuted}>aprendi em {new Date(f.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · toque para corrigir</Text>
            </Pressable>
            <Pressable onPress={() => remove(f)} hitSlop={12} accessibilityLabel={`Esquecer: ${f.text}`} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x-circle" size={20} color={palette.error} />
            </Pressable>
          </View>
        )
      ))}

      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Guardar um fato…"
          placeholderTextColor={palette.textMuted}
          onSubmitEditing={add}
          maxLength={200}
          style={[
            styles.input,
            {
              borderRadius: tokens.radii.md,
              borderColor: palette.border,
              color: palette.text,
              backgroundColor: palette.surface,
            },
          ]}
        />
        <Pressable accessibilityLabel="Adicionar" accessibilityRole="button"
          onPress={add}
          style={[styles.sendBtn, { borderRadius: tokens.radii.md, backgroundColor: palette.primary }]}
        >
          <Feather name="plus" size={18} color={palette.onPrimary} />
        </Pressable>
      </View>

      {episodios !== null && (
        <View style={{ gap: tokens.spacing.sm, marginTop: tokens.spacing.md }}>
          <Text variant="label" color={palette.textMuted}>CONVERSAS QUE A ELY LEMBRA</Text>
          {episodios.length === 0 && <Vazio icone="message-circle" texto="Nenhuma ainda. Quando uma conversa termina, ela guarda um resumo curto." />}
          {episodios.slice(0, 30).map(ep => (
            <View key={ep.id} style={styles.procRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body">{ep.resumo}</Text>
                <Text variant="caption" color={palette.textMuted}>
                  {new Date(ep.em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  {ep.pendencias.length ? ` · ficou de: ${ep.pendencias.join('; ')}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => apagarEpisodio(ep)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Apagar da memória: ${ep.resumo}`} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x-circle" size={20} color={palette.error} />
              </Pressable>
            </View>
          ))}
          <View style={[styles.procRow, { gap: tokens.spacing.sm }]}>
            <Feather name="eye-off" size={18} color={anonimo ? palette.primary : palette.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="body">Modo anônimo</Text>
              <Text variant="caption" color={palette.textMuted}>
                {anonimo ? 'Ligado: nada das conversas vira lembrança até desligar (ou o PC reiniciar o ELYSIUM).' : 'Para uma conversa não ser lembrada. Também por voz: "modo anônimo".'}
              </Text>
            </View>
            <Switch value={anonimo} onValueChange={alternarAnonimo} trackColor={{ true: palette.primary }} accessibilityLabel="Modo anônimo" />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Monitor ───────────────────────────────────────────────────────────────────

/**
 * O broadcast de telemetria só traz CPU, RAM e bateria — que num desktop é null. Discos
 * e processos vêm por RPC ao abrir o painel e preenchem o mesmo lugar.
 */
function PainelMonitor({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [snapshot, setSnapshot] = useState<TelemetryFrame | null>(null);
  const [discos, setDiscos] = useState<DiskEntry[]>([]);
  const [pesados, setPesados] = useState<ProcessEntry[]>([]);

  const ativa = useAbaAtiva();
  useEffect(
    () => (ativa ? openTelemetryStream(pairing, setSnapshot, setStatus) : undefined),
    [ativa, pairing.activeIp, pairing.port, pairing.token],
  );

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = (await callRpc(pairing, 'system.disks')).disks;
        if (vivo) setDiscos(d);
      } catch { /* segue */ }
      try {
        const r = await callRpc(pairing, 'system.processes');
        if (vivo) setPesados(r.processes.slice().sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, 5));
      } catch { /* segue */ }
    })();
    return () => { vivo = false; };
  }, [pairing]);

  const known = snapshot
    ? Object.entries(snapshot).filter(([k, v]) => findMetric(k) && typeof v === 'number')
    : [];

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View style={styles.linhaAoVivo}>
        <View style={[styles.ponto, { backgroundColor: status === 'open' ? palette.success : palette.textMuted }]} />
        <Text variant="caption" color={palette.textMuted}>
          {status === 'open' ? 'Ao vivo · a cada 5 s' : 'Conectando…'}
        </Text>
      </View>

      {known.length === 0 ? (
        <Text variant="caption" color={palette.textMuted}>Esperando o primeiro broadcast…</Text>
      ) : (
        known.map(([key, value]) => {
          const metric = findMetric(key)!;
          const charging = key.startsWith('battery') && typeof snapshot?.battery_charging === 'boolean'
            ? snapshot.battery_charging
            : undefined;
          const detail = charging !== undefined
            ? `${Math.round(value as number)}%${charging ? ' · carregando' : ''}`
            : undefined;
          return (
            <MetricBar key={key} icon={metric.icon} label={metric.label} percent={value as number} detail={detail} />
          );
        })
      )}

      {discos.map(d => (
        <MetricBar
          key={d.name}
          icon="hard-drive"
          label={`Disco ${d.name}`}
          percent={d.usedPct}
          detail={`${d.freeGB} GB livres de ${d.totalGB}`}
        />
      ))}

      {pesados.length > 0 && (
        <View style={{ gap: 6, marginTop: tokens.spacing.sm }}>
          <Text variant="label" color={palette.textMuted}>Consumindo mais</Text>
          {pesados.map(p => (
            <View key={p.pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="cpu" size={13} color={palette.primary} />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{p.name}</Text>
              <Text variant="caption" color={palette.textMuted}>{Math.round(p.cpu ?? 0)}% · {p.ramMB}MB</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Processos ─────────────────────────────────────────────────────────────────

function PainelProcessos({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const [disks, setDisks] = useState<DiskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sequencial de propósito: cada chamada dispara um PowerShell no PC e as duas
      // juntas competem por CPU justamente quando o usuário quer medir a CPU.
      const procs = await callRpc(pairing, 'system.processes', {}, { timeoutMs: 20000 });
      setProcesses(procs.processes);
      const d = await callRpc(pairing, 'system.disks', {}, { timeoutMs: 20000 });
      setDisks(d.disks);
    } catch (err) {
      onError(err, 'Falha ao ler processos');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  useEffect(() => { load(); }, [load]);

  async function kill(proc: ProcessEntry) {
    haptica.aviso();
    const confirmed = await confirmDestructive(
      `Encerrar ${proc.name}?`,
      `O processo ${proc.name} (PID ${proc.pid}) será encerrado à força. Trabalho não salvo se perde.`
    );
    if (confirmed !== 'confirmed') return;
    try {
      await callRpc(pairing, 'system.killProcess', { pid: proc.pid }, { confirmed: true });
      haptica.sucesso();
      setProcesses(prev => prev.filter(p => p.pid !== proc.pid));
    } catch (err) {
      onError(err, 'Falha ao encerrar processo');
    }
  }

  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro ? processes.filter(p => p.name.toLowerCase().includes(filtro)) : processes;

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View style={styles.procRow}>
        <View style={[styles.campoBusca, { borderRadius: tokens.radii.md, borderColor: palette.border, backgroundColor: palette.surface }]}>
          <Feather name="search" size={15} color={palette.textMuted} />
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Filtrar por nome…"
            placeholderTextColor={palette.textMuted}
            style={{ flex: 1, color: palette.text, paddingVertical: 0 }}
          />
        </View>
        <Pressable accessibilityLabel="Atualizar" accessibilityRole="button" onPress={load} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={palette.textMuted} />
        </Pressable>
      </View>

      {loading && <ActivityIndicator color={palette.primary} />}

      {disks.map(d => (
        <MetricBar
          key={d.name}
          icon="hard-drive"
          label={`Disco ${d.name}`}
          percent={d.usedPct}
          detail={`${d.freeGB} GB livres de ${d.totalGB} GB`}
        />
      ))}

      {!loading && visiveis.length === 0 && <Vazio icone="cpu" texto={filtro ? 'Nada com esse nome.' : 'Nenhum processo reportado.'} />}
      {visiveis.map(proc => (
        <View key={proc.pid} style={styles.procRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">{proc.name}</Text>
            <Text variant="caption" color={palette.textMuted}>
              PID {proc.pid} · {proc.cpu}% CPU · {proc.ramMB} MB{proc.isSystem ? ' · sistema' : ''}
            </Text>
          </View>
          <Pressable accessibilityLabel="Encerrar o processo" accessibilityRole="button" onPress={() => kill(proc)} hitSlop={10}>
            <Feather name="x-circle" size={20} color={palette.error} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ── Janelas (bloco 87) ────────────────────────────────────────────────────────

/**
 * Janela por janela, como a barra de tarefas mostra. "Só esta" é o atalho que um controle
 * remoto pede: do sofá, deixar só o filme na tela. Fechar é o X da janela (o programa
 * pergunta se quer salvar), por isso sem biometria — quem força é o painel Processos.
 */
function PainelJanelas({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [janelas, setJanelas] = useState<Janela[] | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setJanelas((await callRpc(pairing, 'window.list', {}, { timeoutMs: 20000 })).janelas); }
    catch (err) { setJanelas([]); onError(err, 'Falha ao listar janelas'); }
  }, [pairing, onError]);
  useEffect(() => { load(); }, [load]);

  async function agir(j: Janela, operacao: 'focar' | 'minimizar' | 'restaurar' | 'fechar' | 'so_esta') {
    haptica.medio();
    setOcupada(j.hwnd);
    try {
      await callRpc(pairing, 'window.control', { hwnd: j.hwnd, operacao }, { timeoutMs: 20000 });
      haptica.sucesso();
    } catch (err) {
      onError(err, 'Não consegui mexer na janela');
    } finally {
      setOcupada(null);
      setTimeout(load, 400);
    }
  }

  if (janelas === null) return <ActivityIndicator color={palette.primary} />;
  if (!janelas.length) return <Vazio icone="layers" texto="Nenhuma janela aberta." />;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {janelas.map(j => (
        <Card key={j.hwnd} style={{ gap: tokens.spacing.sm, opacity: ocupada === j.hwnd ? 0.5 : 1 }}>
          <View style={styles.procRow}>
            <Feather name={j.emFoco ? 'eye' : j.minimizada ? 'minus' : 'monitor'} size={16} color={j.emFoco ? palette.primary : palette.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>{j.titulo}</Text>
              <Text variant="caption" color={palette.textMuted} numberOfLines={1}>
                {j.processo}{j.emFoco ? ' · em foco' : j.minimizada ? ' · minimizada' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.procRow}>
            {([
              ['focar', 'eye', 'Focar'],
              ['so_esta', 'star', 'Só esta'],
              [j.minimizada ? 'restaurar' : 'minimizar', j.minimizada ? 'maximize-2' : 'minimize-2', j.minimizada ? 'Restaurar' : 'Minimizar'],
              ['fechar', 'x', 'Fechar'],
            ] as const).map(([op, icone, rotulo]) => (
              <Toque key={op} onPress={() => agir(j, op)} style={{ flex: 1 }}>
                <View style={[styles.botaoJanela, { borderRadius: tokens.radii.md, backgroundColor: op === 'fechar' ? palette.errorSoft : palette.primarySoft }]}>
                  <Feather name={icone} size={15} color={op === 'fechar' ? palette.error : palette.primary} />
                  <Text variant="caption" color={op === 'fechar' ? palette.error : palette.primary}>{rotulo}</Text>
                </View>
              </Toque>
            ))}
          </View>
        </Card>
      ))}
      <Pressable onPress={load} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }}>
        <Text variant="caption" color={palette.textMuted}>Atualizar a lista</Text>
      </Pressable>
    </View>
  );
}

// ── Armazenamento (fase 12) ───────────────────────────────────────────────────

function tamanho(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1).replace('.', ',')} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.round(b / 1e3)} kB`;
}

/**
 * O mesmo painel da aba PC do desktop: discos, o que dá para liberar sem risco (Lixeira e
 * temporários antigos, com biometria) e os maiores arquivos de Downloads — que o app não
 * apaga; o botão abre o Explorer no PC com o arquivo selecionado.
 */
function PainelArmazenamento({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [dado, setDado] = useState<Armazenamento | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const load = useCallback(async (forcar = false) => {
    try { setDado(await callRpc(pairing, 'storage.info', forcar ? { forcar: true } : {}, { timeoutMs: 70000 })); }
    catch (err) { onError(err, 'Não consegui medir o disco'); }
  }, [pairing, onError]);
  useEffect(() => { load(); }, [load]);

  async function limpar(alvo: 'lixeira' | 'temp') {
    haptica.aviso();
    const titulo = alvo === 'lixeira' ? 'Esvaziar a Lixeira do PC?' : 'Limpar os temporários do PC?';
    const texto = alvo === 'lixeira' ? 'O que está lá some de vez.' : 'Só sai o que tem mais de 2 dias; arquivo em uso fica.';
    if ((await confirmDestructive(titulo, texto)) !== 'confirmed') return;
    setOcupado(alvo);
    try {
      const r = await callRpc(pairing, 'storage.clean', { alvo }, { confirmed: true, timeoutMs: 150000 });
      haptica.sucesso();
      Alert.alert('Pronto', r.message);
      await load();
    } catch (err) { onError(err, 'Não consegui limpar'); }
    finally { setOcupado(null); }
  }

  async function abrir(alvo: 'downloads' | 'limpeza' | 'arquivo', nome?: string) {
    haptica.leve();
    try {
      const r = await callRpc(pairing, 'storage.open', nome ? { alvo, nome } : { alvo });
      if (!r.ok) Alert.alert('Armazenamento', r.message);
    } catch (err) { onError(err, 'Não consegui abrir no PC'); }
  }

  if (!dado) {
    return (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
        <ActivityIndicator color={palette.primary} />
        <Text variant="caption" color={palette.textMuted}>Medindo o disco do PC… (alguns segundos)</Text>
      </View>
    );
  }

  const linhas: { id: 'lixeira' | 'temp' | 'downloads'; icone: keyof typeof Feather.glyphMap; nome: string; nota: string; bytes: number }[] = [
    { id: 'lixeira', icone: 'trash-2', nome: 'Lixeira', nota: 'Some de vez ao esvaziar', bytes: dado.lixeira },
    { id: 'temp', icone: 'rotate-ccw', nome: 'Temporários', nota: 'Só o que tem mais de 2 dias', bytes: dado.temp },
    { id: 'downloads', icone: 'download', nome: 'Downloads', nota: 'Você decide o que sai', bytes: dado.downloads },
  ];

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Card style={{ gap: tokens.spacing.sm }}>
        {dado.discos.map(d => (
          <View key={d.name} style={{ gap: 4 }}>
            <View style={styles.procRow}>
              <Text variant="body" style={{ flex: 1 }}>Disco {d.name}</Text>
              <Text variant="caption" color={d.usedPct >= 95 ? palette.error : palette.textMuted}>
                {String(d.freeGB).replace('.', ',')} GB livres de {String(d.totalGB).replace('.', ',')} GB
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.primarySoft, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, d.usedPct)}%`, height: '100%', backgroundColor: d.usedPct >= 95 ? palette.error : palette.primary }} />
            </View>
          </View>
        ))}
      </Card>
      <Text variant="label">O que dá para liberar</Text>
      {linhas.map(l => (
        <Card key={l.id} style={[styles.procRow, { opacity: ocupado === l.id ? 0.5 : 1 }]}>
          <Feather name={l.icone} size={16} color={palette.textMuted} />
          <View style={{ flex: 1 }}>
            <Text variant="body">{l.nome}</Text>
            <Text variant="caption" color={palette.textMuted}>{l.nota}</Text>
          </View>
          <Text variant="label">{tamanho(l.bytes)}</Text>
          <Toque onPress={() => (l.id === 'downloads' ? abrir('downloads') : limpar(l.id))} disabled={!!ocupado || (l.id !== 'downloads' && !l.bytes)}>
            <View style={[styles.botaoJanela, { borderRadius: tokens.radii.md, backgroundColor: l.id === 'downloads' ? palette.primarySoft : palette.errorSoft, paddingHorizontal: 12 }]}>
              <Text variant="caption" color={l.id === 'downloads' ? palette.primary : palette.error}>
                {l.id === 'downloads' ? 'Abrir' : l.id === 'lixeira' ? 'Esvaziar' : 'Limpar'}
              </Text>
            </View>
          </Toque>
        </Card>
      ))}
      {dado.grandes.length > 0 && <Text variant="label">Maiores em Downloads</Text>}
      {dado.grandes.map(g => {
        const partes = g.nome.split(/[\\/]/);
        const base = partes.pop();
        return (
          <Card key={g.nome} style={styles.procRow}>
            <Feather name="file" size={16} color={palette.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>{base}</Text>
              <Text variant="caption" color={palette.textMuted} numberOfLines={1}>
                {['Downloads', ...partes].join(' › ')} · {new Date(g.em).toLocaleDateString('pt-BR')}
              </Text>
            </View>
            <Text variant="label">{tamanho(g.bytes)}</Text>
            <Pressable onPress={() => abrir('arquivo', g.nome)} hitSlop={8} accessibilityLabel="Mostrar no PC">
              <Feather name="external-link" size={16} color={palette.primary} />
            </Pressable>
          </Card>
        );
      })}
      <Button title="Limpeza de Disco do Windows" variant="secondary" onPress={() => abrir('limpeza')} />
      <Pressable onPress={() => { setDado(null); load(true); }} hitSlop={8} style={{ alignSelf: 'center', padding: 6 }}>
        <Text variant="caption" color={palette.textMuted}>Medir de novo</Text>
      </Pressable>
    </View>
  );
}

// ── Programas ─────────────────────────────────────────────────────────────────

/** Sem o `#2` dos contadores de desempenho e sem `.exe`, para casar catálogo com processo. */
const normalizarApp = (x: string) => x.toLowerCase().replace(/#\d+$/, '').replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');

function PainelProgramas({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [abertos, setAbertos] = useState<AppEntry[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRpc(pairing, 'apps.list');
      setApps(res.apps);
    } catch (err) {
      onError(err, 'Falha ao listar apps');
    } finally {
      setLoading(false);
    }
  }, [pairing, onError]);

  useEffect(() => { load(); }, [load]);

  // Segunda fase, como no desktop: o catálogo é instantâneo, `apps.running` dispara um
  // PowerShell. Cruzar os dois é o que dá "abertos agora" — só o catálogo não sabe o que
  // está de pé, e um processo fora do catálogo não teria como ser reaberto depois.
  useEffect(() => {
    if (apps.length === 0) return;
    let vivo = true;
    (async () => {
      try {
        const r = await callRpc(pairing, 'apps.running', {}, { timeoutMs: 20000 });
        const rodando = new Set(r.apps.map(a => normalizarApp(a.name)));
        const vistos = new Set<string>();
        const lista = apps.filter(a => {
          const exe = normalizarApp(a.command.split(/[\\/]/).pop()?.split(/\s+/)[0] ?? '');
          const bate = rodando.has(normalizarApp(a.key)) || (exe && rodando.has(exe));
          if (!bate || vistos.has(a.command)) return false;
          vistos.add(a.command);
          return true;
        });
        if (vivo) setAbertos(lista);
      } catch { if (vivo) setAbertos([]); }
    })();
    return () => { vivo = false; };
  }, [apps, pairing]);

  async function open(app: AppEntry) {
    setBusyKey(app.key);
    try {
      await callRpc(pairing, 'apps.open', { name: app.key }, { timeoutMs: 15000 });
      haptica.sucesso();
    } catch (err) {
      onError(err, `Falha ao abrir ${app.key}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function close(app: AppEntry) {
    haptica.aviso();
    const confirmed = await confirmDestructive(`Fechar ${app.key}?`, 'O programa será encerrado à força no PC.');
    if (confirmed !== 'confirmed') return;
    setBusyKey(app.key);
    try {
      await callRpc(pairing, 'apps.close', { name: app.key }, { confirmed: true, timeoutMs: 15000 });
      haptica.sucesso();
    } catch (err) {
      onError(err, `Falha ao fechar ${app.key}`);
    } finally {
      setBusyKey(null);
    }
  }

  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro ? apps.filter(a => a.key.toLowerCase().includes(filtro)) : apps;

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View style={[styles.campoBusca, { borderRadius: tokens.radii.md, borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Feather name="search" size={15} color={palette.textMuted} />
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar programa…"
          placeholderTextColor={palette.textMuted}
          style={{ flex: 1, color: palette.text, paddingVertical: 0 }}
        />
      </View>
      {!loading && (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="label" color={palette.textMuted}>Abertos agora</Text>
          {abertos === null ? (
            <View style={styles.linhaAoVivo}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text variant="caption" color={palette.textMuted}>Procurando o que está aberto…</Text>
            </View>
          ) : abertos.length === 0 ? (
            <Text variant="caption" color={palette.textMuted}>Nenhum programa conhecido aberto.</Text>
          ) : (
            <View style={styles.grid}>
              {abertos.map(a => (
                <View key={a.command} style={[styles.chipAberto, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft }]}>
                  <Text variant="caption" color={palette.primary}>{a.key}</Text>
                  {busyKey === a.key
                    ? <ActivityIndicator size="small" color={palette.primary} />
                    : (
                      <Pressable accessibilityLabel="Fechar" accessibilityRole="button" onPress={() => close(a)} hitSlop={8}>
                        <Feather name="x" size={14} color={palette.error} />
                      </Pressable>
                    )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      <Dica texto="Toque no nome para abrir · X fecha à força" />
      {loading && <ActivityIndicator color={palette.primary} />}
      {!loading && visiveis.length === 0 && <Vazio icone="grid" texto="Nenhum programa com esse nome." />}
      {visiveis.map(app => (
        <View key={app.key} style={styles.procRow}>
          <Pressable style={{ flex: 1 }} onPress={() => open(app)} disabled={busyKey === app.key}>
            <Text variant="body">{app.key}</Text>
            <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{app.command}</Text>
          </Pressable>
          {busyKey === app.key ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Pressable accessibilityLabel="Fechar o programa" accessibilityRole="button" onPress={() => close(app)} hitSlop={10}>
              <Feather name="x-circle" size={20} color={palette.error} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Energia ───────────────────────────────────────────────────────────────────

const POWER_BUTTONS: { op: PowerOperation; label: string; icon: keyof typeof Feather.glyphMap; warn: string }[] = [
  { op: 'lock', label: 'Bloquear', icon: 'lock', warn: 'A tela do PC será bloqueada.' },
  { op: 'sleep', label: 'Suspender', icon: 'moon', warn: 'O PC vai suspender.' },
  { op: 'restart', label: 'Reiniciar', icon: 'rotate-cw', warn: 'O PC reinicia em 30 segundos. Trabalho não salvo se perde.' },
  { op: 'shutdown', label: 'Desligar', icon: 'power', warn: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
];

function PainelEnergia({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();

  async function power(op: PowerOperation, label: string, warn: string) {
    haptica.aviso();
    const confirmed = await confirmDestructive(`${label} o PC?`, warn);
    if (confirmed !== 'confirmed') return;
    try {
      const res = await callRpc(pairing, 'power.control', { operation: op }, { confirmed: true });
      haptica.sucesso();
      Alert.alert('ELYSIUM-M', res.message);
    } catch (err) {
      onError(err, `Falha ao ${label.toLowerCase()}`);
    }
  }

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View style={styles.grid}>
        {POWER_BUTTONS.map(b => {
          const perigo = b.op === 'shutdown' || b.op === 'restart';
          return (
            <Toque
              key={b.op}
              haptico={null}
              onPress={() => power(b.op, b.label, b.warn)}
              style={[styles.powerTile, { borderRadius: tokens.radii.md, backgroundColor: perigo ? palette.errorSoft : palette.primarySoft }]}
            >
              <Feather name={b.icon} size={22} color={perigo ? palette.error : palette.primary} />
              <Text variant="label" color={perigo ? palette.error : palette.primary}>
                {b.label}
              </Text>
            </Toque>
          );
        })}
      </View>
      <Dica texto="Agendar para mais tarde fica no card Energia da Início." />
      <Button
        variant="ghost"
        title="Cancelar desligamento agendado"
        onPress={() => power('cancel', 'Cancelar', 'O desligamento agendado será abortado.')}
      />
    </View>
  );
}

// ── Área de transferência ─────────────────────────────────────────────────────

function PainelTransferencia({ pairing, onError }: { pairing: Pairing; onError: ErrorHandler }) {
  const { palette, tokens } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pull() {
    setBusy(true);
    try {
      const res = await callRpc(pairing, 'clipboard.get');
      setText(res.text);
      if (res.text) await Clipboard.setStringAsync(res.text);
      haptica.sucesso();
    } catch (err) {
      onError(err, 'Falha ao ler a área de transferência do PC');
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setBusy(true);
    try {
      const value = await Clipboard.getStringAsync();
      if (!value) {
        Alert.alert('Vazio', 'Não há nada copiado no celular.');
        return;
      }
      await callRpc(pairing, 'clipboard.set', { text: value });
      setText(value);
      haptica.sucesso();
      Alert.alert('Pronto', 'Colado na área de transferência do PC.');
    } catch (err) {
      onError(err, 'Falha ao enviar para o PC');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Dica texto="Puxar copia o que está no PC para o celular; mandar faz o inverso." />
      {text !== null && (
        <Card style={{ padding: tokens.spacing.md }}>
          <Text variant="caption" color={palette.textMuted} numberOfLines={6}>
            {text || '(vazio)'}
          </Text>
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title="Puxar do PC" onPress={pull} loading={busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="primary" title="Mandar pro PC" onPress={push} loading={busy} />
        </View>
      </View>
    </View>
  );
}

// ── Peças comuns dos painéis ──────────────────────────────────────────────────

/** Uma linha de orientação no topo do painel — o que a gaveta antiga punha no subtítulo. */
function Dica({ texto }: { texto: string }) {
  const { palette } = useTheme();
  return <Text variant="caption" color={palette.textMuted}>{texto}</Text>;
}

/**
 * Estado vazio com ícone, no lugar de uma linha cinza perdida: uma lista vazia ainda
 * precisa parecer uma tela terminada, não uma tela que falhou em carregar.
 */
function Vazio({ icone, texto }: { icone: keyof typeof Feather.glyphMap; texto: string }) {
  const { palette, tokens } = useTheme();
  return (
    <View style={[styles.vazio, { paddingVertical: tokens.spacing.xl }]}>
      <Feather name={icone} size={26} color={palette.textMuted} />
      <Text variant="caption" color={palette.textMuted}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerCard: { alignItems: 'center', paddingVertical: 40 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  linhaHero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconeHero: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // Duas colunas: `gap` de 12 entre elas e cada célula com 48% cabem em qualquer largura
  // sem cálculo, e o card de meia largura da Início usa a mesma proporção.
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  celula: { width: '48%', flexGrow: 1 },
  azulejo: { gap: 4, minHeight: 112, justifyContent: 'flex-end', flex: 1 },
  iconeAzulejo: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  barraMidia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grupoMidia: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divisor: { width: 1, height: 22 },
  procRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  botaoJanela: { alignItems: 'center', gap: 3, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  powerTile: { flexGrow: 1, minWidth: '45%', alignItems: 'center', gap: 6, paddingVertical: 16 },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  sendBtn: { width: 46, alignItems: 'center', justifyContent: 'center' },
  chipAberto: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingLeft: 12, paddingRight: 10 },
  campoBusca: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9,
  },
  linhaAoVivo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  vazio: { alignItems: 'center', gap: 8 },
});
