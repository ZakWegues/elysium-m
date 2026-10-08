import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, Tarefa } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { agruparTarefas, atrasada, filtrarTarefas, mascaraHora, montarQuando, proximosDias, quandoTarefa, validarHora } from '../lib/tarefasUi';
import { useTheme } from '../theme';
import { Button, GlassModal, Snackbar, SobreposicaoContext, Text, useDesfazer } from '../components/ui';
import { useAbaAtiva } from '../components/AbaViva';

/**
 * Tarefas em tela cheia (fase 18, 08/10). O Zak: a lista do Hoje "não dá pra deixar em tela
 * cheia e tem uma parte cortada". Aqui ela ocupa a tela toda, agrupada como no Todoist
 * (Atrasadas / Hoje / Amanhã / Próximos / Sem data / Feitas), com:
 *  - quick add com prévia do que a Ely entendeu ("prova sexta 14h" → "sex 14:00 · aviso na véspera");
 *  - deslizar para a direita conclui; para a esquerda mostra Adiar e Apagar;
 *  - "Desfazer" por 5 s em vez de perguntar antes;
 *  - toque no texto edita (texto, dia, hora, estrela, repetição, ressalva);
 *  - toque no círculo conclui com ressalva opcional.
 */

type Filtro = 'abertas' | 'feitas' | 'todas';
const ADIAMENTOS: { k: '1h' | 'hoje16' | 'amanha' | 'semana'; t: string; icone: keyof typeof Feather.glyphMap }[] = [
  { k: '1h', t: 'Daqui a 1 hora', icone: 'clock' },
  { k: 'hoje16', t: 'Hoje às 16h', icone: 'sun' },
  { k: 'amanha', t: 'Amanhã', icone: 'sunrise' },
  { k: 'semana', t: 'Semana que vem', icone: 'calendar' },
];

export default function TarefasScreen({ pairing, onClose, onMudou, abrirNova = false }: {
  pairing: Pairing; onClose: () => void; onMudou: (tarefasDoHoje: Tarefa[]) => void; abrirNova?: boolean;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [todas, setTodas] = useState<Tarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [busca, setBusca] = useState('');
  const [escondidas, setEscondidas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Tarefa | 'nova' | null>(abrirNova ? 'nova' : null);
  const [adiando, setAdiando] = useState<Tarefa | null>(null);
  const [concluindo, setConcluindo] = useState<Tarefa | null>(null);
  const [ressalva, setRessalva] = useState('');
  const desfazer = useDesfazer();
  const sobreposicao = useContext(SobreposicaoContext);

  useEffect(() => {
    sobreposicao?.mais();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => { sobreposicao?.menos(); sub.remove(); };
  }, [sobreposicao, onClose]);
  // Hoje escondido por fora (o "Ely" leva ao Chat): fecha, senão a barra de abas some junto.
  const ativa = useAbaAtiva();
  useEffect(() => { if (!ativa) onClose(); }, [ativa, onClose]);

  const carregar = useCallback(async () => {
    try {
      setTodas((await callRpc(pairing, 'tarefas.list', { filtro: 'todas' }, { timeoutMs: 15000 })).tarefas);
      setErro(null);
    } catch (e) { setErro(errMessage(e)); }
  }, [pairing]);
  useEffect(() => { void carregar(); }, [carregar]);

  /** Depois de qualquer mudança: relê tudo e avisa o Hoje (que mostra só as do dia). */
  const aposMudar = useCallback(async (doHoje?: Tarefa[]) => {
    if (doHoje) onMudou(doHoje);
    await carregar();
  }, [carregar, onMudou]);

  const visiveis = useMemo(() => {
    const base = (todas ?? []).filter(t => !escondidas.has(t.id));
    const porFiltro = filtro === 'abertas' ? base.filter(t => !t.feita) : filtro === 'feitas' ? base.filter(t => t.feita) : base;
    return filtrarTarefas(porFiltro, busca);
  }, [todas, escondidas, filtro, busca]);
  const secoes = useMemo(() => agruparTarefas(visiveis), [visiveis]);
  const nAtrasadas = useMemo(() => (todas ?? []).filter(t => atrasada(t)).length, [todas]);

  // ── ações ──
  async function concluirRapido(t: Tarefa) {
    haptica.sucesso();
    setTodas(l => l && l.map(x => (x.id === t.id ? { ...x, feita: true, feitaEm: Date.now() } : x)));
    try {
      const r = await callRpc(pairing, 'tarefas.concluir', { id: t.id });
      desfazer.mostrar(`Concluída: ${t.texto}${r.proxima ? ' · a próxima já está na lista' : ''}`, async () => {
        try { await aposMudar((await callRpc(pairing, 'tarefas.reabrir', { id: t.id })).tarefas); } catch (e) { Alert.alert('Não deu para desfazer', errMessage(e)); }
      });
      await aposMudar(r.tarefas);
    } catch (e) { Alert.alert('Não deu para concluir', errMessage(e)); void carregar(); }
  }

  async function concluirComRessalva() {
    const t = concluindo;
    if (!t) return;
    const texto = ressalva.trim();
    setConcluindo(null);
    haptica.sucesso();
    try {
      const r = await callRpc(pairing, 'tarefas.concluir', { id: t.id, ressalva: texto || undefined });
      setRessalva('');
      await aposMudar(r.tarefas);
    } catch (e) {
      // A ressalva digitada não se perde: o modal volta com ela.
      Alert.alert('Não deu para concluir', errMessage(e));
      setConcluindo(t);
    }
  }

  async function reabrir(t: Tarefa) {
    haptica.leve();
    try { await aposMudar((await callRpc(pairing, 'tarefas.reabrir', { id: t.id })).tarefas); }
    catch (e) { Alert.alert('Não deu para reabrir', errMessage(e)); }
  }

  /** Apagar não pergunta antes: some na hora, e o PC só apaga se ninguém desfizer em 5 s. */
  function apagar(t: Tarefa) {
    haptica.medio();
    setEscondidas(s => new Set(s).add(t.id));
    desfazer.mostrar(`Apagada: ${t.texto}`,
      () => setEscondidas(s => { const n = new Set(s); n.delete(t.id); return n; }),
      async () => {
        try { await aposMudar((await callRpc(pairing, 'tarefas.delete', { id: t.id }, { confirmed: true })).tarefas); }
        catch (e) { Alert.alert('Não deu para apagar', errMessage(e)); setEscondidas(s => { const n = new Set(s); n.delete(t.id); return n; }); }
      });
  }

  async function adiar(t: Tarefa, para: (typeof ADIAMENTOS)[number]['k']) {
    setAdiando(null);
    haptica.leve();
    try {
      const r = await callRpc(pairing, 'tarefas.adiar', { id: t.id, para });
      await aposMudar(r.tarefas);
    } catch (e) { Alert.alert('Não deu para adiar', errMessage(e)); }
  }

  function reagendarAtrasadas() {
    haptica.leve();
    Alert.alert(`Reagendar ${nAtrasadas} atrasada${nAtrasadas === 1 ? '' : 's'}`, 'Para quando?', [
      { text: 'Cancelar', style: 'cancel' },
      ...(['hoje16', 'amanha', 'semana'] as const).map(para => ({
        text: para === 'hoje16' ? 'Hoje 16h' : para === 'amanha' ? 'Amanhã' : 'Semana que vem',
        onPress: async () => {
          try { const r = await callRpc(pairing, 'tarefas.reagendarAtrasadas', { para }); await aposMudar(r.tarefas); }
          catch (e) { Alert.alert('Não deu para reagendar', errMessage(e)); }
        },
      })),
    ]);
  }

  return (
    <Animated.View entering={SlideInRight.duration(220)} exiting={SlideOutRight.duration(180)} style={[StyleSheet.absoluteFill, styles.camada, { backgroundColor: palette.background }]}>
      <View style={[styles.topo, { paddingTop: insets.top + 8, borderBottomColor: palette.border }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar" style={styles.icone}>
          <Feather name="arrow-left" size={22} color={palette.text} />
        </Pressable>
        <Text variant="heading" style={{ flex: 1 }}>Tarefas</Text>
        <Pressable onPress={() => setEditando('nova')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Nova tarefa" style={styles.icone}>
          <Feather name="plus" size={22} color={palette.primary} />
        </Pressable>
      </View>

      <QuickAdd pairing={pairing} aoCriar={aposMudar} />

      {/* Filtros e busca */}
      <View style={[styles.linha, { paddingHorizontal: tokens.spacing.lg, paddingBottom: 8, flexWrap: 'wrap' }]}>
        {(['abertas', 'feitas', 'todas'] as const).map(f => {
          const on = f === filtro;
          return (
            <Pressable key={f} onPress={() => { haptica.tique(); setFiltro(f); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
              <Text variant="caption" color={on ? palette.primary : palette.text} maxFontSizeMultiplier={1.3}>{f === 'abertas' ? 'Abertas' : f === 'feitas' ? 'Feitas (30 dias)' : 'Todas'}</Text>
            </Pressable>
          );
        })}
        <View style={[styles.busca, { borderColor: palette.border, borderRadius: tokens.radii.md }]}>
          <Feather name="search" size={14} color={palette.textMuted} />
          <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar" placeholderTextColor={palette.textMuted} style={{ flex: 1, color: palette.text, paddingVertical: 6, fontSize: 14 }} />
        </View>
      </View>

      {todas === null && !erro && <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />}
      {erro && (
        <View style={{ padding: tokens.spacing.lg, gap: 10 }}>
          <Text variant="caption" color={palette.error}>{/não existe|unknown|404/i.test(erro) ? 'O PC precisa da versão 2.3 para a tela cheia de tarefas.' : `Não consegui falar com o PC: ${erro}`}</Text>
          <Button title="Tentar de novo" variant="secondary" onPress={() => void carregar()} />
        </View>
      )}

      {todas !== null && (
        <SectionList
          sections={secoes}
          keyExtractor={t => t.id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: insets.bottom + 96 }}
          ListEmptyComponent={
            <Text variant="caption" color={palette.textMuted} style={{ marginTop: 16 }}>
              {busca ? 'Nada com esse texto.' : filtro === 'feitas' ? 'Nada concluído nos últimos 30 dias.' : 'Lista limpa. Escreva acima — "prova de física sexta 14h" já vira lembrete.'}
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.secaoTopo, { marginTop: 14 }]}>
              <Text variant="label" color={section.chave === 'atrasadas' ? palette.error : palette.textMuted} style={{ letterSpacing: 1.4, flex: 1 }}>{section.titulo} · {section.data.length}</Text>
              {section.chave === 'atrasadas' && (
                <Pressable onPress={reagendarAtrasadas} hitSlop={10} accessibilityRole="button" style={styles.linha}>
                  <Feather name="calendar" size={13} color={palette.primary} />
                  <Text variant="label" color={palette.primary}>Reagendar</Text>
                </Pressable>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <Animated.View layout={LinearTransition.duration(180)} entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)}>
              <LinhaTarefa
                t={item}
                aoTocarCirculo={() => (item.feita ? void reabrir(item) : (setRessalva(item.ressalva ?? ''), setConcluindo(item)))}
                aoEditar={() => setEditando(item)}
                aoConcluirRapido={() => void concluirRapido(item)}
                aoAdiar={() => setAdiando(item)}
                aoApagar={() => apagar(item)}
              />
            </Animated.View>
          )}
        />
      )}

      <Snackbar estado={desfazer} />

      <GlassModal title="Concluir" visible={concluindo !== null} onClose={() => setConcluindo(null)}>
        {concluindo && (
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="subheading">{concluindo.texto}</Text>
            <Text variant="caption" color={palette.textMuted}>Ressalva (opcional) — o que ficou de fora, uma observação.</Text>
            <TextInput value={ressalva} onChangeText={setRessalva} multiline maxLength={300} placeholder="Ex.: fiz, mas faltou revisar o capítulo 3" placeholderTextColor={palette.textMuted}
              style={[styles.campo, { minHeight: 80, textAlignVertical: 'top', borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]} />
            <Button title="Concluir" onPress={() => void concluirComRessalva()} />
          </View>
        )}
      </GlassModal>

      <GlassModal title="Adiar" visible={adiando !== null} onClose={() => setAdiando(null)}>
        {adiando && (
          <View style={{ gap: 4 }}>
            <Text variant="caption" color={palette.textMuted} numberOfLines={2}>{adiando.texto}</Text>
            {ADIAMENTOS.map(a => (
              <Pressable key={a.k} onPress={() => void adiar(adiando, a.k)} accessibilityRole="button" style={[styles.linha, { minHeight: 52 }]}>
                <Feather name={a.icone} size={18} color={palette.primary} />
                <Text variant="body">{a.t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </GlassModal>

      <GlassModal title={editando === 'nova' ? 'Nova tarefa' : 'Editar tarefa'} visible={editando !== null} onClose={() => setEditando(null)} altura="cheia">
        {editando && (
          <EditorTarefa
            pairing={pairing}
            base={editando === 'nova' ? null : editando}
            aoTerminar={async (doHoje) => { setEditando(null); await aposMudar(doHoje); }}
            aoApagar={editando === 'nova' ? undefined : () => { const t = editando; setEditando(null); apagar(t); }}
          />
        )}
      </GlassModal>
    </Animated.View>
  );
}

/** Uma linha: deslizar para a direita conclui; para a esquerda abre Adiar e Apagar. */
function LinhaTarefa({ t, aoTocarCirculo, aoEditar, aoConcluirRapido, aoAdiar, aoApagar }: {
  t: Tarefa; aoTocarCirculo: () => void; aoEditar: () => void; aoConcluirRapido: () => void; aoAdiar: () => void; aoApagar: () => void;
}) {
  const { palette } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const late = atrasada(t);
  const fechar = () => ref.current?.close();
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={70}
      rightThreshold={40}
      overshootLeft={false}
      enabled={!t.feita}
      renderLeftActions={() => (
        <View style={[styles.acaoEsq, { backgroundColor: palette.primary }]}>
          <Feather name="check" size={20} color={palette.background} />
          <Text variant="label" color={palette.background}>Concluir</Text>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.acoesDir}>
          <Pressable onPress={() => { fechar(); aoAdiar(); }} accessibilityLabel="Adiar" style={[styles.acaoDir, { backgroundColor: palette.accent }]}>
            <Feather name="clock" size={18} color={palette.background} />
            <Text variant="caption" color={palette.background}>Adiar</Text>
          </Pressable>
          <Pressable onPress={() => { fechar(); aoApagar(); }} accessibilityLabel="Apagar" style={[styles.acaoDir, { backgroundColor: palette.error }]}>
            <Feather name="trash-2" size={18} color={palette.background} />
            <Text variant="caption" color={palette.background}>Apagar</Text>
          </Pressable>
        </View>
      )}
      onSwipeableOpen={(direcao) => {
        // "left" = as ações da esquerda abriram (o dedo foi para a direita): conclui.
        if (String(direcao).toLowerCase() === 'left') { fechar(); aoConcluirRapido(); }
      }}
    >
      <View style={[styles.item, { backgroundColor: palette.background, borderBottomColor: palette.border }]}>
        <Pressable onPress={aoTocarCirculo} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: t.feita }} accessibilityLabel={t.feita ? `Reabrir ${t.texto}` : `Concluir ${t.texto}`}
          style={[styles.check, { borderColor: t.prioridade === 'alta' ? palette.accent : palette.primary, backgroundColor: t.feita ? palette.primary : 'transparent' }]}>
          {t.feita && <Feather name="check" size={15} color={palette.background} />}
        </Pressable>
        <Pressable onPress={aoEditar} accessibilityRole="button" accessibilityHint="Toque para editar; deslize para concluir, adiar ou apagar" style={{ flex: 1, gap: 2, paddingVertical: 2 }}>
          <Text variant="body" color={t.feita ? palette.textMuted : palette.text} style={t.feita ? { textDecorationLine: 'line-through' } : undefined}>
            {t.prioridade === 'alta' ? '★ ' : ''}{t.texto}
          </Text>
          {(t.prazo !== undefined || t.repete) && (
            <Text variant="caption" color={late ? palette.error : palette.textMuted} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {t.feita && t.feitaEm ? `feita ${quandoTarefa(t.feitaEm)}` : t.prazo !== undefined ? `${late ? 'atrasada · ' : ''}${quandoTarefa(t.prazo, t.semHora)}` : ''}
              {t.repete ? ` · ↻ ${t.repete === 'diaria' ? 'todo dia' : 'toda semana'}` : ''}
            </Text>
          )}
          {t.ressalva ? <Text variant="caption" color={palette.accent} numberOfLines={2}>✎ {t.ressalva}</Text> : null}
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}

/** O campo do topo: escreve do jeito que fala; a prévia mostra o que a Ely entendeu. */
function QuickAdd({ pairing, aoCriar }: { pairing: Pairing; aoCriar: (doHoje?: Tarefa[]) => Promise<void> }) {
  const { palette, tokens } = useTheme();
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState<{ texto: string; rotulo: string | null; vespera?: boolean; passou?: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 4) { setPrevia(null); return; }
    let vivo = true;
    const h = setTimeout(async () => {
      try {
        const r = await callRpc(pairing, 'tarefas.interpretar', { texto: t }, { timeoutMs: 5000 });
        if (vivo) setPrevia(r.quando ? { texto: r.texto, rotulo: r.rotulo ?? null, vespera: r.vespera, passou: r.passou } : null);
      } catch { if (vivo) setPrevia(null); }
    }, 400);
    return () => { vivo = false; clearTimeout(h); };
  }, [texto, pairing]);

  async function criar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    haptica.leve();
    try {
      const r = await callRpc(pairing, 'tarefas.criar', { texto: t });
      // Só limpa quando deu certo: horário que já passou volta como erro e o texto fica.
      setTexto(''); setPrevia(null);
      haptica.sucesso();
      await aoCriar(r.tarefas);
    } catch (e) { Alert.alert('Não deu para anotar', errMessage(e)); }
    finally { setEnviando(false); }
  }

  return (
    <View style={{ paddingHorizontal: tokens.spacing.lg, paddingTop: 10, paddingBottom: 8, gap: 6 }}>
      <View style={styles.linha}>
        <TextInput
          value={texto}
          onChangeText={setTexto}
          placeholder='Nova tarefa — "prova de física sexta 14h"'
          placeholderTextColor={palette.textMuted}
          maxLength={200}
          onSubmitEditing={() => void criar()}
          returnKeyType="done"
          style={[styles.campo, { flex: 1, borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]}
        />
        <Pressable onPress={() => void criar()} disabled={enviando} accessibilityLabel="Adicionar tarefa" style={[styles.redondo, { backgroundColor: palette.primary, opacity: enviando ? 0.6 : 1 }]}>
          {enviando ? <ActivityIndicator size="small" color={palette.background} /> : <Feather name="plus" size={20} color={palette.background} />}
        </Pressable>
      </View>
      {previa && (
        <Animated.View entering={FadeIn.duration(160)} style={styles.linha}>
          <Feather name={previa.passou ? 'alert-triangle' : 'calendar'} size={13} color={previa.passou ? palette.error : palette.accent} />
          <Text variant="caption" color={previa.passou ? palette.error : palette.accent} style={{ flex: 1 }} numberOfLines={2}>
            {previa.passou ? 'Esse horário já passou' : `"${previa.texto}" · ${previa.rotulo ?? ''}${previa.vespera ? ' · aviso na véspera 16h' : ''}`}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

/** Editor: texto, dia (sem data ou um dos próximos 14), hora com máscara, estrela, repetição, ressalva. */
function EditorTarefa({ pairing, base, aoTerminar, aoApagar }: {
  pairing: Pairing; base: Tarefa | null; aoTerminar: (doHoje?: Tarefa[]) => Promise<void>; aoApagar?: () => void;
}) {
  const { palette, tokens } = useTheme();
  const dias = useMemo(() => proximosDias(14), []);
  const diaInicial = base?.prazo !== undefined ? new Date(base.prazo) : null;
  const [texto, setTexto] = useState(base?.texto ?? '');
  const [dia, setDia] = useState<Date | null>(diaInicial && dias.some(d => d.data.toDateString() === diaInicial.toDateString()) ? new Date(diaInicial.getFullYear(), diaInicial.getMonth(), diaInicial.getDate()) : diaInicial);
  const [hora, setHora] = useState(base?.prazo !== undefined && !base.semHora ? `${String(new Date(base.prazo).getHours()).padStart(2, '0')}:${String(new Date(base.prazo).getMinutes()).padStart(2, '0')}` : '');
  const [estrela, setEstrela] = useState(base?.prioridade === 'alta');
  const [repete, setRepete] = useState<'nao' | 'diaria' | 'semanal'>(base?.repete ?? 'nao');
  const [ressalva, setRessalva] = useState(base?.ressalva ?? '');
  const [salvando, setSalvando] = useState(false);
  const campo = [styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];

  async function salvar() {
    if (!texto.trim()) { Alert.alert('Falta o texto', 'Escreva a tarefa.'); return; }
    const h = validarHora(hora);
    if (h === null) { Alert.alert('Hora inválida', 'Use HH:MM, por exemplo 14:30.'); return; }
    const quando = montarQuando(dia, h);
    setSalvando(true);
    try {
      if (!base) {
        const r = await callRpc(pairing, 'tarefas.criar', { texto: texto.trim(), quando, semHora: !!quando && !h, prioridade: estrela ? 'alta' : undefined, repete: repete === 'nao' ? undefined : repete, interpretar: !quando });
        haptica.sucesso();
        await aoTerminar(r.tarefas);
        return;
      }
      const mudouData = quando !== montarQuando(diaInicial, base.prazo !== undefined && !base.semHora ? hora : '') || (base.prazo === undefined) !== !quando;
      const r = await callRpc(pairing, 'tarefas.editar', {
        id: base.id,
        texto: texto.trim(),
        ...(mudouData ? { quando: quando ?? null, semHora: !!quando && !h } : {}),
        prioridade: estrela ? 'alta' : null,
        repete: repete === 'nao' ? null : repete,
        ...(base.feita ? { ressalva: ressalva.trim() || null } : {}),
      });
      haptica.sucesso();
      await aoTerminar(r.tarefas);
    } catch (e) { Alert.alert('Não deu para salvar', errMessage(e)); }
    finally { setSalvando(false); }
  }

  const chip = (on: boolean, rotulo: string, aoTocar: () => void, chave: string) => (
    <Pressable key={chave} onPress={() => { haptica.tique(); aoTocar(); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
      <Text variant="caption" color={on ? palette.primary : palette.text} maxFontSizeMultiplier={1.3}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <TextInput value={texto} onChangeText={setTexto} placeholder="O que fazer" placeholderTextColor={palette.textMuted} maxLength={200} multiline style={[campo, { minHeight: 48 }]} />
      <Text variant="caption" color={palette.textMuted}>Dia</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {chip(dia === null, 'Sem data', () => { setDia(null); setHora(''); }, 'sem')}
        {dias.map(d => chip(!!dia && dia.toDateString() === d.data.toDateString(), d.rotulo, () => setDia(d.data), d.rotulo))}
        {dia && !dias.some(d => d.data.toDateString() === dia.toDateString()) && chip(true, quandoTarefa(dia.getTime(), true).replace(' · dia todo', ''), () => {}, 'outro')}
      </ScrollView>
      <View style={styles.linha}>
        <TextInput value={hora} onChangeText={v => setHora(mascaraHora(v))} placeholder="Hora (opcional)" placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={5} style={[campo, { flex: 1 }]} />
        <Text variant="caption" color={palette.textMuted} style={{ flex: 1.3 }}>{hora ? 'Avisa nesse horário.' : dia ? 'Sem hora: aviso às 16h (prova e consulta: véspera também).' : 'Hora sem dia = hoje.'}</Text>
      </View>
      <View style={[styles.linha, { flexWrap: 'wrap' }]}>
        {chip(estrela, '★ Importante', () => setEstrela(e => !e), 'estrela')}
        {chip(repete === 'nao', 'Não repete', () => setRepete('nao'), 'r0')}
        {chip(repete === 'diaria', '↻ Todo dia', () => setRepete('diaria'), 'r1')}
        {chip(repete === 'semanal', '↻ Toda semana', () => setRepete('semanal'), 'r2')}
      </View>
      {repete !== 'nao' && !dia && !hora && <Text variant="caption" color={palette.accent}>Para repetir, escolha um dia.</Text>}
      {base?.feita && (
        <TextInput value={ressalva} onChangeText={setRessalva} placeholder="Ressalva" placeholderTextColor={palette.textMuted} maxLength={300} multiline style={[campo, { minHeight: 60, textAlignVertical: 'top' }]} />
      )}
      <Button title={salvando ? 'Salvando…' : base ? 'Salvar' : 'Criar tarefa'} onPress={() => void salvar()} disabled={salvando} />
      {aoApagar && <Button title="Apagar tarefa" variant="secondary" onPress={aoApagar} />}
    </View>
  );
}

const styles = StyleSheet.create({
  camada: { zIndex: 25, elevation: 25 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  icone: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 12, minHeight: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 10, flexGrow: 1, minWidth: 120, minHeight: 36 },
  campo: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  redondo: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  secaoTopo: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  acaoEsq: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18 },
  acoesDir: { flexDirection: 'row' },
  acaoDir: { width: 76, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
