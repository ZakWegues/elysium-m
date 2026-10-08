import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, Habito, Meta, PainelCorpo, PainelHoje, Revisao, Tarefa } from '../lib/rpc';
import { falar } from '../lib/falar';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { confirmDestructive } from '../lib/confirm';
import { useTheme } from '../theme';
import { Button, Card, GlassModal, ScreenHeader, Text } from '../components/ui';
import { Reator } from '../components/Reator';
import { Markdown } from '../components/Markdown';
import { useAbaAtiva, useAoReativar } from '../components/AbaViva';
import { CardCorrida, CardElysium, CardIdeia, CardNutricao, CardRotinasHoje, CardTreino, OuvirResumo } from './hoje/CardsFase18';
import TreinoScreen from './TreinoScreen';
import TarefasScreen from './TarefasScreen';
import { atrasada, mascaraHora, quandoTarefa, validarHora } from '../lib/tarefasUi';

/**
 * Hoje (fase 16, 07/10) — o briefing do dia, a mesma aba do desktop. Uma chamada só
 * (`hoje.painel`) traz saudação, status, clima, agenda, listas, hábitos, metas e alertas.
 * Hábito marca com um toque (com vibração e a sequência 🔥); toque longo edita.
 */

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Quantas tarefas o card do Hoje mostra; o resto fica no "Ver todas" (tela cheia). */
const TAREFAS_NO_CARD = 5;

function horaCurta(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function restante(ms: number) {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function HojeScreen({ pairing, pedidoTarefas = 0 }: { pairing: Pairing; pedidoTarefas?: number }) {
  const { palette, tokens } = useTheme();
  const [painel, setPainel] = useState<PainelHoje | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [habitoEdit, setHabitoEdit] = useState<Partial<Habito> | null>(null);
  const [metaEdit, setMetaEdit] = useState<Partial<Meta> | null>(null);
  const [manchetes, setManchetes] = useState<string | null>(null);
  /**
   * "Todos" (revisão de 07/10): a aba só mostra os hábitos que valem HOJE e as metas em
   * andamento; sem esta lista, um hábito de seg/qua/sex não dava para editar na terça e meta
   * concluída não dava para apagar.
   */
  const [todos, setTodos] = useState<{ habitos: Habito[]; metas: Meta[] } | null>(null);
  /** Fase 17: a tarefa sendo concluída (o modal pede a ressalva opcional). */
  const [concluindo, setConcluindo] = useState<Tarefa | null>(null);
  const [ressalva, setRessalva] = useState('');
  const [novaTarefa, setNovaTarefa] = useState('');
  const [diaNova, setDiaNova] = useState<'nenhum' | 'hoje' | 'amanha'>('nenhum');
  const [horaNova, setHoraNova] = useState('');
  /** Fase 18: as tarefas em tela cheia ("Ver todas", widget, elysium://tarefas). */
  const [tarefasAbertas, setTarefasAbertas] = useState(false);
  const fecharTarefas = useCallback(() => setTarefasAbertas(false), []);
  useEffect(() => { if (pedidoTarefas) setTarefasAbertas(true); }, [pedidoTarefas]);
  /** Fase 18: o treino em tela cheia, aberto pelos cards do corpo. */
  const [treinoAberto, setTreinoAberto] = useState(false);
  const aplicarCorpo = useCallback((corpo: PainelCorpo) => setPainel(p => p && { ...p, corpo }), []);
  const fecharTreino = useCallback(() => setTreinoAberto(false), []);

  function aplicarTarefas(tarefas: Tarefa[]) {
    setPainel(p => p && { ...p, tarefas });
  }

  async function adicionarTarefa() {
    const texto = novaTarefa.trim();
    if (!texto) return;
    if (horaNova && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(horaNova)) { Alert.alert('Hora inválida', 'Use HH:MM, por exemplo 14:30.'); return; }
    const base = new Date();
    if (diaNova === 'amanha') base.setDate(base.getDate() + 1);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const dia = `${base.getFullYear()}-${p2(base.getMonth() + 1)}-${p2(base.getDate())}`;
    const comData = diaNova !== 'nenhum' || !!horaNova;
    const hora = horaNova ? horaNova.padStart(5, '0') : '';
    haptica.leve();
    try {
      const r = await callRpc(pairing, 'tarefas.criar', comData ? { texto, quando: hora ? `${dia}T${hora}` : dia } : { texto });
      aplicarTarefas(r.tarefas);
      setNovaTarefa(''); setHoraNova(''); setDiaNova('nenhum');
      if (comData || r.tarefa?.prazo) Alert.alert('Anotado', r.mensagem);
    } catch (e) { Alert.alert('Não deu para anotar', errMessage(e)); }
  }

  async function concluir() {
    const t = concluindo;
    if (!t) return;
    setConcluindo(null);
    haptica.sucesso();
    // Otimista: risca na hora; o PC confirma logo depois.
    setPainel(p => p && { ...p, tarefas: p.tarefas?.map(x => (x.id === t.id ? { ...x, feita: true, feitaEm: Date.now(), ressalva: ressalva.trim() || undefined } : x)) });
    try {
      const r = await callRpc(pairing, 'tarefas.concluir', { id: t.id, ressalva: ressalva.trim() || undefined });
      aplicarTarefas(r.tarefas);
      setRessalva('');
    } catch (e) {
      // A ressalva digitada não se perde: o modal volta com ela (08/10).
      Alert.alert('Não deu para concluir', errMessage(e));
      setConcluindo(t);
      void carregar();
    }
  }

  async function tocarTarefa(t: Tarefa) {
    if (!t.feita) { setRessalva(''); setConcluindo(t); return; }
    haptica.leve();
    try { aplicarTarefas((await callRpc(pairing, 'tarefas.reabrir', { id: t.id })).tarefas); }
    catch (e) { Alert.alert('Não deu para reabrir', errMessage(e)); }
  }

  function apagarTarefa(t: Tarefa) {
    haptica.leve();
    Alert.alert('Apagar a tarefa?', `"${t.texto}"${t.lembreteIds?.length ? ' — os avisos que faltam são cancelados.' : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try { aplicarTarefas((await callRpc(pairing, 'tarefas.delete', { id: t.id }, { confirmed: true })).tarefas); }
        catch (e) { Alert.alert('Não deu para apagar', errMessage(e)); }
      } },
    ]);
  }
  async function abrirTodos() {
    try { setTodos(await callRpc(pairing, 'habitos.list')); }
    catch (e) { Alert.alert('Não consegui ler', errMessage(e)); }
  }
  const [buscandoManchetes, setBuscandoManchetes] = useState(false);
  const [, setTique] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setPainel(await callRpc(pairing, 'hoje.painel', {}, { timeoutMs: 15000 }));
      setErro(null);
    } catch (e) {
      setErro(/não existe|unknown|404/i.test(errMessage(e)) ? 'O PC precisa da versão 2.0 para a aba Hoje.' : `Não consegui falar com o PC: ${errMessage(e)}`);
    }
  }, [pairing]);

  useEffect(() => {
    void carregar();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void carregar(); });
    return () => sub.remove();
  }, [carregar]);

  // Voltou ao Hoje (08/10, abas vivas): mostra o que tinha e atualiza por trás.
  useAoReativar(() => { void carregar(); });
  const ativa = useAbaAtiva();

  // Contagem dos timers ao vivo, só com timer correndo e a aba à vista.
  useEffect(() => {
    if (!painel?.timers.length || !ativa) return;
    const t = setInterval(() => setTique(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [painel?.timers.length, ativa]);

  async function puxar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  async function marcar(h: Habito) {
    haptica.medio();
    // Otimista: o toque responde na hora; o PC confirma logo depois.
    setPainel(p => p && { ...p, habitos: p.habitos.map(x => x.id === h.id ? { ...x, feitoHoje: !x.feitoHoje } : x) });
    try {
      const r = await callRpc(pairing, 'habitos.marcar', { id: h.id, feito: !h.feitoHoje });
      if (!h.feitoHoje) haptica.sucesso();
      setPainel(p => p && { ...p, habitos: p.habitos.map(x => x.id === h.id ? r.habito : x) });
    } catch (e) {
      Alert.alert('Não deu para marcar', errMessage(e));
      void carregar();
    }
  }

  async function somar(m: Meta, delta: number) {
    haptica.leve();
    try {
      const r = await callRpc(pairing, 'metas.progresso', { id: m.id, delta });
      if (r.meta.concluidaEm && !m.concluidaEm) { haptica.sucesso(); Alert.alert('Meta concluída', `${r.meta.titulo}: ${r.meta.progresso} de ${r.meta.alvo}.`); }
      setPainel(p => p && { ...p, metas: p.metas.map(x => x.id === m.id ? r.meta : x) });
    } catch (e) { Alert.alert('Não deu para atualizar', errMessage(e)); }
  }

  async function buscarManchetes() {
    setBuscandoManchetes(true);
    try {
      const r = await callRpc(pairing, 'web.search', { query: 'principais notícias do Brasil e do mundo hoje, em tópicos curtos' }, { timeoutMs: 60000 });
      setManchetes(r.answer);
    } catch (e) { setManchetes(`Não consegui buscar agora: ${errMessage(e)}`); }
    finally { setBuscandoManchetes(false); }
  }

  const habitos = painel?.habitos ?? [];
  const feitos = habitos.filter(h => h.feitoHoje).length;
  const agenda = [
    ...(painel?.lembretes ?? []).map(l => ({ em: l.em, icone: 'bell' as const, texto: l.texto })),
    ...(painel?.proximaRotina ? [{ em: painel.proximaRotina.em, icone: 'zap' as const, texto: `Rotina ${painel.proximaRotina.nome}` }] : []),
  ].sort((a, b) => a.em - b.em);

  // Fase 18: seções ocultáveis (toque longo no título). A lista é a mesma do PC — a chave
  // vem do título, do mesmo jeito que o dashboard faz.
  const ocultos = painel?.ocultos ?? [];
  const vis = (chave: string) => !ocultos.includes(chave);
  const chaveDe = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function mudarOcultos(chave: string, ocultar: boolean) {
    try {
      const r = await callRpc(pairing, 'hoje.ocultar', { secao: chave, ocultar });
      setPainel(p => p && { ...p, ocultos: r.ocultos });
    } catch (e) { Alert.alert('Hoje', errMessage(e)); }
  }
  function perguntarOcultar(t: string, chave: string) {
    haptica.leve();
    Alert.alert(`Ocultar "${t.charAt(0)}${t.slice(1).toLowerCase()}"?`, 'Some daqui e do Hoje do PC. Para mostrar de novo, use o botão no fim da página.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Ocultar', onPress: () => void mudarOcultos(chave, true) },
    ]);
  }
  async function mostrarOcultos() {
    for (const c of ocultos) await mudarOcultos(c, false);
  }
  const [revisao, setRevisao] = useState<Revisao | null>(null);
  async function abrirRevisao() {
    haptica.leve();
    try { setRevisao(await callRpc(pairing, 'hoje.revisao', {}, { timeoutMs: 15000 })); }
    catch (e) { Alert.alert('Revisão da semana', errMessage(e)); }
  }

  const secao = (t: string, acao?: { rotulo: string; onPress: () => void; icone?: keyof typeof Feather.glyphMap }, chave = chaveDe(t)) => (
    <View style={styles.secaoTopo}>
      <Pressable onLongPress={() => perguntarOcultar(t, chave)} accessibilityHint="Toque longo para ocultar a seção" hitSlop={6}>
        <Text variant="label" color={palette.textMuted} style={styles.secao}>{t}</Text>
      </Pressable>
      {acao && (
        <Pressable onPress={acao.onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={acao.rotulo} style={styles.secaoAcao}>
          <Feather name={acao.icone ?? 'plus'} size={15} color={palette.primary} />
          <Text variant="label" color={palette.primary}>{acao.rotulo}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Hoje" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxar} tintColor={palette.primary} colors={[palette.primary]} />}
      >
        {!painel && !erro && <ActivityIndicator color={palette.primary} />}
        {erro && <Text variant="caption" color={palette.error}>{erro}</Text>}

        {painel && (
          <>
            {/* Cabeçalho: o reator mostra os hábitos de hoje feitos. */}
            <View style={styles.topo}>
              <Reator fracao={habitos.length ? feitos / habitos.length : 0} rotulo={`${feitos}/${habitos.length}`} sub="hábitos" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" color={palette.primary} style={styles.rotuloHud}>BRIEFING · {painel.data.toUpperCase()}</Text>
                <Text variant="heading">{painel.saudacao}</Text>
                <Text variant="caption" color={palette.textMuted}>{painel.frase}</Text>
              </View>
            </View>

            {/* Fase 18: ouvir o resumo inteiro — a fala segue ao trocar de aba ou minimizar. */}
            <OuvirResumo pairing={pairing} />
            <Pressable onPress={abrirRevisao} accessibilityRole="button" hitSlop={6} style={[styles.linha, { alignSelf: 'flex-start', minHeight: 40 }]}>
              <Feather name="calendar" size={15} color={palette.primary} />
              <Text variant="label" color={palette.primary}>{new Date().getDay() === 0 ? 'Revisão da semana (é domingo!)' : 'Revisão da semana'}</Text>
            </Pressable>

            {painel.amanha && vis('amanha') && (
              <>
                {secao('MEU AMANHÃ', undefined, 'amanha')}
                <Card glass style={{ gap: 8 }}>
                  {painel.amanha.clima && (
                    <Text variant="caption" color={palette.textMuted}>Amanhã: {Math.round(painel.amanha.clima.min)}°–{Math.round(painel.amanha.clima.max)}°</Text>
                  )}
                  {painel.amanha.tarefas.length === 0 && <Text variant="caption" color={palette.textMuted}>Nada marcado para amanhã — bom momento para escolher a prioridade do dia.</Text>}
                  {painel.amanha.tarefas.map(t => (
                    <View key={t.id} style={styles.linha}>
                      <Feather name="circle" size={13} color={palette.primary} />
                      <Text variant="body" style={{ flex: 1 }}>{t.texto}</Text>
                      <Text variant="caption" color={palette.textMuted}>{t.prazo !== undefined ? quandoTarefa(t.prazo, t.semHora).replace(/^amanhã ·? ?/, '') : ''}</Text>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {painel.alertas.map((a, i) => (
              <Card key={i} glass style={[styles.alerta, { borderColor: a.nivel === 'erro' ? palette.error : palette.accent }]}>
                <Feather name="alert-triangle" size={16} color={a.nivel === 'erro' ? palette.error : palette.accent} />
                <Text variant="caption" style={{ flex: 1 }}><Text variant="caption" style={{ fontWeight: '700' }}>{a.titulo}</Text> — {a.detalhe}</Text>
              </Card>
            ))}

            {vis('habitos-de-hoje') && (<>
            {secao('HÁBITOS DE HOJE', { rotulo: 'Hábito', onPress: () => setHabitoEdit({}) })}
            <Pressable onPress={abrirTodos} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}>
              <Text variant="caption" color={palette.primary}>Ver todos os hábitos e metas</Text>
            </Pressable>
            <Card glass style={{ gap: 2 }}>
              {habitos.length === 0 && <Text variant="caption" color={palette.textMuted}>Nenhum hábito para hoje. Toque em "Hábito" para criar — a Ely marca pela voz também ("marquei academia").</Text>}
              {habitos.map((h, i) => (
                <Pressable
                  key={h.id}
                  onPress={() => marcar(h)}
                  onLongPress={() => { haptica.leve(); setHabitoEdit(h); }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: h.feitoHoje }}
                  accessibilityLabel={`${h.nome}, sequência de ${h.sequencia} dias`}
                  style={[styles.habito, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
                >
                  <View style={[styles.check, { borderColor: palette.primary, backgroundColor: h.feitoHoje ? palette.primary : 'transparent' }]}>
                    {h.feitoHoje && <Feather name="check" size={16} color={palette.background} />}
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text variant="body" color={h.feitoHoje ? palette.textMuted : palette.text}>{h.nome}</Text>
                    <View style={styles.mapa}>
                      {h.mapa.map((d, j) => (
                        <View key={j} style={[styles.dia, { backgroundColor: d === null ? 'transparent' : d ? palette.primary : palette.primarySoft, borderWidth: d === null ? StyleSheet.hairlineWidth : 0, borderColor: palette.border }]} />
                      ))}
                    </View>
                  </View>
                  <View style={{ alignItems: 'center', minWidth: 44 }}>
                    <Text variant="subheading" color={palette.accent}>{h.sequencia}</Text>
                    <Text variant="caption" color={palette.textMuted}>{h.pausadoHoje ? '❄ hoje' : '🔥 dias'}</Text>
                    {h.forca !== undefined && <Text variant="caption" color={palette.textMuted} style={{ fontSize: 10 }} maxFontSizeMultiplier={1.2}>força {h.forca}%</Text>}
                  </View>
                </Pressable>
              ))}
            </Card>
            </>)}

            {painel.corpo && (
              <>
                {vis('treino-de-hoje') && (<>
                  {secao('TREINO DE HOJE')}
                  <CardTreino corpo={painel.corpo} pairing={pairing} aoAbrir={() => setTreinoAberto(true)} aoMudar={aplicarCorpo} />
                </>)}
                {vis('nutricao') && (<>
                  {secao('NUTRIÇÃO')}
                  <CardNutricao corpo={painel.corpo} dica={painel.dica ?? null} pairing={pairing} aoAbrir={() => setTreinoAberto(true)} />
                </>)}
                {vis('corrida') && (<>
                  {secao('CORRIDA')}
                  <CardCorrida corpo={painel.corpo} aoAbrir={() => setTreinoAberto(true)} />
                </>)}
              </>
            )}

            {vis('metas') && (<>
            {secao('METAS', { rotulo: 'Meta', onPress: () => setMetaEdit({ alvo: 10 }) })}
            <Card glass style={{ gap: tokens.spacing.sm }}>
              {painel.metas.length === 0 && <Text variant="caption" color={palette.textMuted}>Sem metas em andamento.</Text>}
              {painel.metas.map(m => {
                const f = m.alvo ? Math.min(1, m.progresso / m.alvo) : 0;
                return (
                  <Pressable key={m.id} onLongPress={() => setMetaEdit(m)} style={{ gap: 6 }}>
                    <View style={styles.linha}>
                      <Text variant="body" style={{ flex: 1 }}>{m.titulo}</Text>
                      <Text variant="label" color={palette.primary}>{m.progresso}/{m.alvo}{m.unidade ? ` ${m.unidade}` : ''}</Text>
                    </View>
                    <View style={[styles.barra, { backgroundColor: palette.primarySoft }]}>
                      <View style={{ width: `${Math.round(f * 100)}%`, height: '100%', backgroundColor: palette.primary, borderRadius: 3 }} />
                    </View>
                    <View style={styles.linha}>
                      <Pressable onPress={() => somar(m, -1)} hitSlop={10} style={[styles.passo, { borderColor: palette.border }]} accessibilityLabel={`Tirar 1 de ${m.titulo}`}><Text variant="label">−1</Text></Pressable>
                      <Pressable onPress={() => somar(m, 1)} hitSlop={10} style={[styles.passo, { borderColor: palette.border }]} accessibilityLabel={`Somar 1 em ${m.titulo}`}><Text variant="label">+1</Text></Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
            </>)}

            {painel.tarefas && vis('lembretes-e-tarefas') && (
              <>
                {secao('LEMBRETES E TAREFAS', { rotulo: 'Tela cheia', icone: 'maximize-2', onPress: () => { haptica.leve(); setTarefasAbertas(true); } })}
                <Card glass style={{ gap: 4 }}>
                  {/* Nova tarefa: com dia ou hora vira lembrete (16h sem hora; prova e consulta avisam na véspera). */}
                  <TextInput
                    value={novaTarefa}
                    onChangeText={setNovaTarefa}
                    placeholder="Nova tarefa ou lembrete"
                    placeholderTextColor={palette.textMuted}
                    maxLength={200}
                    onSubmitEditing={adicionarTarefa}
                    returnKeyType="done"
                    style={[styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]}
                  />
                  {/* 08/10: em duas fileiras. Numa linha só (3 chips + HH:MM + botão) não cabia em
                      360 dp — o Card corta o que passa, e o "+" sumia. */}
                  <View style={[styles.linha, { marginTop: 6, flexWrap: 'wrap', gap: 6 }]}>
                    {(['nenhum', 'hoje', 'amanha'] as const).map(d => {
                      const on = diaNova === d;
                      return (
                        <Pressable key={d} onPress={() => setDiaNova(d)} hitSlop={4}
                          style={[styles.chipDia, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
                          <Text variant="caption" color={on ? palette.primary : palette.textMuted} maxFontSizeMultiplier={1.3}>{d === 'nenhum' ? 'Sem data' : d === 'hoje' ? 'Hoje' : 'Amanhã'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[styles.linha, { marginTop: 6, marginBottom: 6 }]}>
                    <TextInput value={horaNova} onChangeText={v => setHoraNova(mascaraHora(v))} placeholder="Hora (opcional)" placeholderTextColor={palette.textMuted} maxLength={5} keyboardType="number-pad"
                      style={[styles.campo, { flex: 1, paddingVertical: 8, borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]} />
                    <Pressable onPress={adicionarTarefa} hitSlop={8} accessibilityLabel="Adicionar tarefa" style={[styles.botaoAdd, { backgroundColor: palette.primary }]}>
                      <Feather name="plus" size={18} color={palette.background} />
                    </Pressable>
                  </View>
                  {painel.tarefas.length === 0 && <Text variant="caption" color={palette.textMuted}>Nada na lista. Diga à Ely "tenho prova sexta" — ela anota e avisa na véspera.</Text>}
                  {painel.tarefas.slice(0, TAREFAS_NO_CARD).map((t, i) => {
                    const late = atrasada(t);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => tocarTarefa(t)}
                        onLongPress={() => apagarTarefa(t)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: t.feita }}
                        accessibilityLabel={`${t.texto}${t.prazo ? `, ${quandoTarefa(t.prazo, t.semHora)}` : ''}`}
                        style={[styles.habito, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
                      >
                        <View style={[styles.check, { borderColor: palette.primary, backgroundColor: t.feita ? palette.primary : 'transparent' }]}>
                          {t.feita && <Feather name="check" size={16} color={palette.background} />}
                        </View>
                        {/* A data vai embaixo do texto (08/10): à direita ela espremia a tarefa. */}
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="body" color={t.feita ? palette.textMuted : palette.text} style={t.feita ? { textDecorationLine: 'line-through' } : undefined}>{t.prioridade === 'alta' ? '★ ' : ''}{t.texto}</Text>
                          {(t.feita || t.prazo !== undefined) && (
                            <Text variant="caption" color={late ? palette.error : palette.textMuted} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                              {t.feita ? 'feita' : t.prazo !== undefined ? `${late ? 'atrasada · ' : ''}${quandoTarefa(t.prazo, t.semHora)}` : ''}
                            </Text>
                          )}
                          {t.ressalva ? <Text variant="caption" color={palette.accent}>✎ {t.ressalva}</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                  {painel.tarefas.length > TAREFAS_NO_CARD && (
                    <Pressable onPress={() => { haptica.leve(); setTarefasAbertas(true); }} accessibilityRole="button" style={[styles.linha, { minHeight: 44, justifyContent: 'center' }]}>
                      <Text variant="label" color={palette.primary}>Ver todas ({painel.tarefas.length})</Text>
                      <Feather name="chevron-right" size={16} color={palette.primary} />
                    </Pressable>
                  )}
                </Card>
              </>
            )}

            {vis('agenda') && (<>
            {secao('AGENDA')}
            <Card glass style={{ gap: 8 }}>
              {painel.timers.map(t => (
                <View key={t.id} style={styles.linha}>
                  <Feather name="clock" size={15} color={palette.textMuted} />
                  <Text variant="body" style={{ flex: 1 }}>{t.nome || 'Timer'}</Text>
                  <Text variant="label" color={palette.accent} style={{ fontVariant: ['tabular-nums'] }}>{restante(t.fimEm)}</Text>
                </View>
              ))}
              {agenda.map((a, i) => (
                <View key={i} style={styles.linha}>
                  <Text variant="label" color={palette.primary} style={{ minWidth: 44, fontVariant: ['tabular-nums'] }}>{horaCurta(a.em)}</Text>
                  <Feather name={a.icone} size={14} color={palette.textMuted} />
                  <Text variant="body" style={{ flex: 1 }}>{a.texto}</Text>
                </View>
              ))}
              {!agenda.length && !painel.timers.length && <Text variant="caption" color={palette.textMuted}>Agenda livre hoje.</Text>}
            </Card>
            </>)}

            {painel.clima && vis('clima') && (
              <>
                {secao('CLIMA')}
                <Card glass style={styles.linha}>
                  <Text variant="heading" color={palette.primary}>{Math.round(painel.clima.temperatura)}°</Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{painel.clima.descricao}</Text>
                    <Text variant="caption" color={palette.textMuted}>{painel.clima.cidade} · {Math.round(painel.clima.min)}°–{Math.round(painel.clima.max)}°{painel.clima.chuvaHoje ? ' · chuva hoje' : ''}</Text>
                  </View>
                </Card>
              </>
            )}

            {painel.rotinasHoje && vis('rotinas-de-hoje') && (
              <>
                {secao('ROTINAS DE HOJE')}
                <CardRotinasHoje painel={painel} />
              </>
            )}

            {painel.ideia && vis('ideia-para-hoje') ? (
              <>
                {secao('IDEIA PARA HOJE')}
                <CardIdeia ideia={painel.ideia} pairing={pairing} />
              </>
            ) : null}

            {painel.elysium && vis('elysium') && (
              <>
                {secao('ELYSIUM')}
                <CardElysium e={painel.elysium} pairing={pairing} />
              </>
            )}

            {painel.listas.length > 0 && vis('listas') && (
              <>
                {secao('LISTAS')}
                <Card glass style={{ gap: 8 }}>
                  {painel.listas.map(l => (
                    <View key={l.id}>
                      <Text variant="label">{l.nome} · {l.pendentes}</Text>
                      <Text variant="caption" color={palette.textMuted}>{l.itens.join(' · ')}</Text>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {vis('manchetes') && (<>
            {secao('MANCHETES')}
            <Card glass style={{ gap: 8 }}>
              {manchetes ? <Markdown texto={manchetes} cor={palette.text} /> : <Text variant="caption" color={palette.textMuted}>Sob demanda — a busca vai à internet.</Text>}
              <Button title={buscandoManchetes ? 'Buscando…' : manchetes ? 'Buscar de novo' : 'Buscar manchetes'} variant="secondary" onPress={buscarManchetes} disabled={buscandoManchetes} />
            </Card>
            </>)}

            {ocultos.length > 0 && (
              <Pressable onPress={() => void mostrarOcultos()} accessibilityRole="button" style={[styles.linha, { alignSelf: 'center', minHeight: 44 }]}>
                <Feather name="eye" size={15} color={palette.primary} />
                <Text variant="label" color={palette.primary}>Mostrar {ocultos.length} seç{ocultos.length === 1 ? 'ão oculta' : 'ões ocultas'}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <GlassModal title="Concluir" visible={concluindo !== null} onClose={() => setConcluindo(null)}>
        {concluindo && (
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="subheading">{concluindo.texto}</Text>
            <Text variant="caption" color={palette.textMuted}>Ressalva (opcional) — o que ficou de fora, uma observação. Fica anotada na tarefa.</Text>
            <TextInput
              value={ressalva}
              onChangeText={setRessalva}
              multiline
              maxLength={300}
              placeholder="Ex.: fiz, mas faltou revisar o capítulo 3"
              placeholderTextColor={palette.textMuted}
              style={[styles.campo, { minHeight: 80, textAlignVertical: 'top', borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]}
            />
            <Button title="Concluir" onPress={concluir} />
          </View>
        )}
      </GlassModal>
      <GlassModal title="Hábitos e metas" visible={todos !== null} onClose={() => setTodos(null)}>
        {todos && (
          <View style={{ gap: tokens.spacing.sm }}>
            <Text variant="label" color={palette.textMuted}>HÁBITOS</Text>
            {todos.habitos.length === 0 && <Text variant="caption" color={palette.textMuted}>Nenhum hábito.</Text>}
            {todos.habitos.map(h => (
              <Pressable key={h.id} onPress={() => { setTodos(null); setHabitoEdit(h); }} style={[styles.linha, { minHeight: 44 }]}>
                <Feather name="check-circle" size={16} color={palette.primary} />
                <Text variant="body" style={{ flex: 1 }}>{h.nome}</Text>
                <Text variant="caption" color={palette.textMuted}>{h.dias.length ? h.dias.map(d => DIAS[d]).join(' ') : 'todo dia'} · 🔥{h.sequencia}</Text>
              </Pressable>
            ))}
            <Text variant="label" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>METAS</Text>
            {todos.metas.length === 0 && <Text variant="caption" color={palette.textMuted}>Nenhuma meta.</Text>}
            {todos.metas.map(m => (
              <Pressable key={m.id} onPress={() => { setTodos(null); setMetaEdit(m); }} style={[styles.linha, { minHeight: 44 }]}>
                <Feather name="star" size={16} color={palette.primary} />
                <Text variant="body" style={{ flex: 1 }}>{m.titulo}</Text>
                <Text variant="caption" color={palette.textMuted}>{m.progresso}/{m.alvo}{m.concluidaEm ? ' · concluída' : ''}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </GlassModal>
      <GlassModal title={habitoEdit?.id ? 'Editar hábito' : 'Novo hábito'} visible={habitoEdit !== null} onClose={() => setHabitoEdit(null)}>
        {habitoEdit && <FormHabito pairing={pairing} base={habitoEdit} aoTerminar={() => { setHabitoEdit(null); void carregar(); }} />}
      </GlassModal>
      <GlassModal title={metaEdit?.id ? 'Editar meta' : 'Nova meta'} visible={metaEdit !== null} onClose={() => setMetaEdit(null)}>
        {metaEdit && <FormMeta pairing={pairing} base={metaEdit} aoTerminar={() => { setMetaEdit(null); void carregar(); }} />}
      </GlassModal>
      <GlassModal title="Revisão da semana" visible={revisao !== null} onClose={() => setRevisao(null)}>
        {revisao && (
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="body" style={{ lineHeight: 22 }}>{revisao.texto}</Text>
            {revisao.habitos.map(h => (
              <View key={h.nome} style={styles.linha}>
                <Text variant="body" style={{ flex: 1 }}>{h.nome}</Text>
                <Text variant="caption" color={palette.textMuted}>{h.feitos}/{h.dias} · força {h.forca}%</Text>
              </View>
            ))}
            <Button title="Ouvir" onPress={() => { void falar(revisao.texto, pairing); }} />
            {revisao.atrasadas.length > 0 && <Button title="Ver as tarefas" variant="secondary" onPress={() => { setRevisao(null); setTarefasAbertas(true); }} />}
          </View>
        )}
      </GlassModal>
      {tarefasAbertas && (
        <TarefasScreen pairing={pairing} onClose={fecharTarefas} onMudou={aplicarTarefas} />
      )}
      {treinoAberto && painel?.corpo && (
        <TreinoScreen pairing={pairing} corpo={painel.corpo} onClose={fecharTreino} onMudar={aplicarCorpo} />
      )}
    </View>
  );
}

function FormHabito({ pairing, base, aoTerminar }: { pairing: Pairing; base: Partial<Habito>; aoTerminar: () => void }) {
  const { palette, tokens } = useTheme();
  const [nome, setNome] = useState(base.nome ?? '');
  const [dias, setDias] = useState<number[]>(base.dias ?? []);
  const [hora, setHora] = useState(base.horaLembrete ?? '');
  const [folgas, setFolgas] = useState(base.folgasPorSemana ?? 1);
  const [salvando, setSalvando] = useState(false);
  const campo = [styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];
  async function salvar() {
    if (!nome.trim()) return;
    const h = validarHora(hora);
    if (h === null) { Alert.alert('Hora inválida', 'Use HH:MM, por exemplo 07:30.'); return; }
    setSalvando(true);
    try { await callRpc(pairing, 'habitos.save', { id: base.id, nome, dias, horaLembrete: h || undefined, folgasPorSemana: folgas }); haptica.sucesso(); aoTerminar(); }
    catch (e) { Alert.alert('Não deu para salvar', errMessage(e)); }
    finally { setSalvando(false); }
  }
  /** Viagem, doença: hoje não conta como falta (fase 18). */
  async function congelar() {
    if (!base.id) return;
    try {
      await callRpc(pairing, 'habitos.pausar', { id: base.id, pausar: !base.pausadoHoje });
      haptica.sucesso();
      aoTerminar();
    } catch (e) { Alert.alert('Não deu para congelar', errMessage(e)); }
  }
  async function apagar() {
    if (!base.id) return;
    const ok = await confirmDestructive(`Apagar o hábito ${base.nome}?`, 'A sequência e o histórico de dias vão junto.');
    if (ok !== 'confirmed') return;
    try { await callRpc(pairing, 'habitos.delete', { id: base.id }, { confirmed: true }); aoTerminar(); }
    catch (e) { Alert.alert('Não deu para apagar', errMessage(e)); }
  }
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <TextInput value={nome} onChangeText={setNome} placeholder="Ex.: Academia, Leitura, Água" placeholderTextColor={palette.textMuted} maxLength={40} style={campo} />
      <Text variant="caption" color={palette.textMuted}>Dias (nenhum = todo dia; dia fora da lista não quebra a sequência)</Text>
      <View style={[styles.linha, { flexWrap: 'wrap', gap: 6 }]}>
        {DIAS.map((d, i) => {
          const on = dias.includes(i);
          return (
            <Pressable key={i} onPress={() => setDias(on ? dias.filter(x => x !== i) : [...dias, i].sort())} hitSlop={4}
              style={[styles.diaBtn, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
              <Text variant="label" color={on ? palette.primary : palette.textMuted}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput value={hora} onChangeText={v => setHora(mascaraHora(v))} placeholder="Lembrar às (HH:MM) — opcional" placeholderTextColor={palette.textMuted} maxLength={5} keyboardType="number-pad" style={campo} />
      <Text variant="caption" color={palette.textMuted}>Folgas por semana — faltas que não quebram a sequência (a força cai um pouco, nada zera)</Text>
      <View style={[styles.linha, { flexWrap: 'wrap', gap: 6 }]}>
        {[0, 1, 2].map(n => {
          const on = folgas === n;
          return (
            <Pressable key={n} onPress={() => setFolgas(n)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[styles.chipDia, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
              <Text variant="caption" color={on ? palette.primary : palette.textMuted}>{n === 0 ? 'Nenhuma' : n === 1 ? '1 por semana' : '2 por semana'}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button title={salvando ? 'Salvando…' : base.id ? 'Salvar' : 'Criar hábito'} onPress={salvar} disabled={salvando || !nome.trim()} />
      {base.id && <Button title={base.pausadoHoje ? 'Descongelar hoje' : '❄ Congelar hoje (viagem, doença)'} variant="secondary" onPress={congelar} />}
      {base.id && <Button title="Apagar hábito" variant="secondary" onPress={apagar} />}
    </View>
  );
}

function FormMeta({ pairing, base, aoTerminar }: { pairing: Pairing; base: Partial<Meta>; aoTerminar: () => void }) {
  const { palette, tokens } = useTheme();
  const [titulo, setTitulo] = useState(base.titulo ?? '');
  const [alvo, setAlvo] = useState(String(base.alvo ?? 10));
  const [unidade, setUnidade] = useState(base.unidade ?? '');
  const [salvando, setSalvando] = useState(false);
  const campo = [styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];
  async function salvar() {
    const n = Number(alvo.replace(',', '.'));
    if (!titulo.trim() || !(n > 0)) { Alert.alert('Faltou algo', 'A meta precisa de um nome e de um alvo maior que zero.'); return; }
    setSalvando(true);
    try { await callRpc(pairing, 'metas.save', { id: base.id, titulo, alvo: n, unidade }); haptica.sucesso(); aoTerminar(); }
    catch (e) { Alert.alert('Não deu para salvar', errMessage(e)); }
    finally { setSalvando(false); }
  }
  async function apagar() {
    if (!base.id) return;
    const ok = await confirmDestructive(`Apagar a meta ${base.titulo}?`, 'O progresso vai junto.');
    if (ok !== 'confirmed') return;
    try { await callRpc(pairing, 'metas.delete', { id: base.id }, { confirmed: true }); aoTerminar(); }
    catch (e) { Alert.alert('Não deu para apagar', errMessage(e)); }
  }
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <TextInput value={titulo} onChangeText={setTitulo} placeholder="Ex.: Ler livros, Guardar para a viagem" placeholderTextColor={palette.textMuted} maxLength={60} style={campo} />
      <TextInput value={alvo} onChangeText={setAlvo} placeholder="Alvo" placeholderTextColor={palette.textMuted} keyboardType="decimal-pad" style={campo} />
      <TextInput value={unidade} onChangeText={setUnidade} placeholder="Unidade (livros, km, reais…) — opcional" placeholderTextColor={palette.textMuted} maxLength={16} style={campo} />
      <Button title={salvando ? 'Salvando…' : base.id ? 'Salvar' : 'Criar meta'} onPress={salvar} disabled={salvando} />
      {base.id && <Button title="Apagar meta" variant="secondary" onPress={apagar} />}
    </View>
  );
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rotuloHud: { letterSpacing: 1.6, fontWeight: '700' },
  secaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  secao: { letterSpacing: 1.4 },
  secaoAcao: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  alerta: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1 },
  habito: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  mapa: { flexDirection: 'row', gap: 2 },
  dia: { flex: 1, height: 7, borderRadius: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barra: { height: 6, borderRadius: 3, overflow: 'hidden' },
  passo: { minWidth: 44, minHeight: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  campo: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  chipDia: { paddingHorizontal: 10, minHeight: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  botaoAdd: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  diaBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
