import { useContext, useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, Exercicio, PainelCorpo, PerfilCorpo, Treino } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { useTheme } from '../theme';
import { Button, Card, GlassModal, SobreposicaoContext, Text } from '../components/ui';
import { useAbaAtiva } from '../components/AbaViva';

/**
 * Treino em tela cheia (fase 18, 08/10) — aberto pelo card do Hoje, sem aba nova.
 *
 * Na academia: o treino da vez com os exercícios para ir marcando (o check é só do momento,
 * fica no aparelho), "Concluir treino" no fim, e um toque longo edita séries, reps e carga.
 * Abaixo, a nutrição (meta e peso), a corrida do plano e o perfil — a base da meta.
 * Os dados moram no PC (corpo.json); o celular só mostra e manda o que mudou.
 */

const OBJETIVOS: { k: PerfilCorpo['objetivo']; t: string }[] = [{ k: 'ganhar', t: 'Ganhar' }, { k: 'manter', t: 'Manter' }, { k: 'perder', t: 'Perder' }];
const ATIVIDADES: { k: PerfilCorpo['atividade']; t: string }[] = [
  { k: 'leve', t: '1–2 dias' }, { k: 'moderado', t: '3 dias' }, { k: 'ativo', t: '4–5 dias' }, { k: 'muito', t: '6+ dias' },
];

const series = (e: Pick<Exercicio, 'aquecimento' | 'series' | 'reps'>) => `${e.aquecimento ? `${e.aquecimento} aquec. + ` : ''}${e.series}×${e.reps}`;
const numero = (t: string) => { const n = Number(t.replace(',', '.')); return t.trim() && Number.isFinite(n) ? n : undefined; };

export default function TreinoScreen({ pairing, corpo: inicial, onClose, onMudar }: {
  pairing: Pairing; corpo: PainelCorpo; onClose: () => void; onMudar: (c: PainelCorpo) => void;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [corpo, setCorpo] = useState(inicial);
  const [selecionado, setSelecionado] = useState<string | null>(inicial.treinoHoje?.treino.id ?? inicial.treinos[0]?.id ?? null);
  /** Exercícios marcados durante o treino: só do momento, por treino. */
  const [feitos, setFeitos] = useState<Record<string, number[]>>({});
  const [editando, setEditando] = useState<{ treino: Treino; indice: number | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** Sem treino nenhum, o "+" cria o treino (a revisão pegou: antes o toque era ignorado). */
  const [criandoTreino, setCriandoTreino] = useState(false);
  const [nomeTreino, setNomeTreino] = useState('');
  async function criarTreino() {
    const nome = nomeTreino.trim();
    if (!nome) return;
    try {
      const r = await callRpc(pairing, 'treinos.save', { nome, exercicios: [], ordem: corpo.treinos.length });
      setCriandoTreino(false); setNomeTreino('');
      await recarregar();
      setSelecionado(r.treino.id);
      setEditando({ treino: r.treino, indice: null });
    } catch (e) { Alert.alert('Treino', errMessage(e)); }
  }
  const sobreposicao = useContext(SobreposicaoContext);

  // Tela cheia por cima do Hoje: a barra de abas sai (como numa gaveta) e o voltar fecha.
  useEffect(() => {
    sobreposicao?.mais();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => { sobreposicao?.menos(); sub.remove(); };
  }, [sobreposicao, onClose]);

  // Hoje escondido por fora (o "Ely" leva ao Chat): fecha, senão a barra de abas some junto.
  const ativa = useAbaAtiva();
  useEffect(() => { if (!ativa) onClose(); }, [ativa, onClose]);

  function aplicar(c: PainelCorpo) { setCorpo(c); onMudar(c); }
  async function recarregar() {
    try { aplicar(await callRpc(pairing, 'corpo.painel')); } catch { /* fica o que tinha */ }
  }

  const treino = corpo.treinos.find(t => t.id === selecionado) ?? null;
  const daVez = corpo.treinoHoje?.treino.id;
  const marcados = treino ? feitos[treino.id] ?? [] : [];

  function alternarExercicio(i: number) {
    if (!treino) return;
    haptica.leve();
    setFeitos(f => {
      const atual = f[treino.id] ?? [];
      return { ...f, [treino.id]: atual.includes(i) ? atual.filter(x => x !== i) : [...atual, i] };
    });
  }

  async function concluirTreino() {
    if (!treino) return;
    const jaFeito = corpo.treinoHoje?.feitoHoje && daVez === treino.id;
    haptica.medio();
    setOcupado(true);
    try {
      const r = await callRpc(pairing, 'treinos.marcar', { id: treino.id, feito: !jaFeito });
      aplicar(r.painel);
      if (!jaFeito) { haptica.sucesso(); setFeitos(f => ({ ...f, [treino.id]: [] })); Alert.alert('Treino concluído', `${treino.nome} marcado. ${r.painel.treinosNoMes} no mês.`); }
    } catch (e) { Alert.alert('Treino', errMessage(e)); }
    finally { setOcupado(false); }
  }

  const jaFeitoHoje = !!treino && corpo.treinoHoje?.feitoHoje && daVez === treino.id;

  return (
    <Animated.View entering={SlideInRight.duration(220)} exiting={SlideOutRight.duration(180)} style={[StyleSheet.absoluteFill, styles.camada, { backgroundColor: palette.background }]}>
      <View style={[styles.topo, { paddingTop: insets.top + 8, borderBottomColor: palette.border }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar" style={styles.voltar}>
          <Feather name="arrow-left" size={22} color={palette.text} />
        </Pressable>
        <Text variant="heading" style={{ flex: 1 }}>Treino</Text>
        <Pressable onPress={() => (treino ? setEditando({ treino, indice: null }) : setCriandoTreino(true))} hitSlop={12} accessibilityRole="button" accessibilityLabel={treino ? 'Adicionar exercício' : 'Criar treino'} style={styles.voltar}>
          <Feather name="plus" size={22} color={palette.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* Treinos: chips na ordem da rotação; "da vez" marcado. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {corpo.treinos.map(t => {
            const on = t.id === selecionado;
            return (
              <Pressable key={t.id} onPress={() => { haptica.tique(); setSelecionado(t.id); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={[styles.chip, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
                <Text variant="label" color={on ? palette.primary : palette.text}>{t.nome}</Text>
                {t.id === daVez && <Text variant="caption" color={palette.accent}>{corpo.treinoHoje?.feitoHoje ? '✓' : 'da vez'}</Text>}
              </Pressable>
            );
          })}
        </ScrollView>

        {treino ? (
          <Card glass style={{ gap: 2 }}>
            <View style={[styles.linha, { marginBottom: 6 }]}>
              <Text variant="subheading" style={{ flex: 1 }}>{treino.nome}</Text>
              <Text variant="caption" color={palette.textMuted}>{marcados.length}/{treino.exercicios.length}</Text>
            </View>
            {treino.exercicios.map((e, i) => {
              const ok = marcados.includes(i);
              return (
                <Pressable key={`${e.nome}-${i}`} onPress={() => alternarExercicio(i)} onLongPress={() => { haptica.leve(); setEditando({ treino, indice: i }); }}
                  accessibilityRole="checkbox" accessibilityState={{ checked: ok }} accessibilityHint="Toque longo para editar"
                  style={[styles.exercicio, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
                  <View style={[styles.check, { borderColor: palette.primary, backgroundColor: ok ? palette.primary : 'transparent' }]}>
                    {ok && <Feather name="check" size={15} color={palette.background} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" color={ok ? palette.textMuted : palette.text} style={ok ? { textDecorationLine: 'line-through' } : undefined}>{e.nome}</Text>
                    <Text variant="caption" color={palette.textMuted}>{series(e)}{e.carga ? ` · ${e.carga}` : ''}{e.obs ? ` · ${e.obs}` : ''}</Text>
                  </View>
                  <Pressable onPress={() => setEditando({ treino, indice: i })} hitSlop={10} accessibilityLabel={`Editar ${e.nome}`} style={styles.editar}>
                    <Feather name="edit-2" size={15} color={palette.textMuted} />
                  </Pressable>
                </Pressable>
              );
            })}
            <View style={{ marginTop: 10 }}>
              <Button title={ocupado ? 'Salvando…' : jaFeitoHoje ? 'Desmarcar treino de hoje' : 'Concluir treino'} variant={jaFeitoHoje ? 'secondary' : undefined} onPress={concluirTreino} disabled={ocupado} />
            </View>
          </Card>
        ) : (
          <Card glass style={{ gap: 10 }}>
            <Text variant="caption" color={palette.textMuted}>Nenhum treino ainda.</Text>
            <Button title="Criar o primeiro treino" onPress={() => setCriandoTreino(true)} />
          </Card>
        )}

        <Nutricao corpo={corpo} pairing={pairing} recarregar={recarregar} />
        <Corrida corpo={corpo} pairing={pairing} aplicar={aplicar} />
        <Perfil corpo={corpo} pairing={pairing} recarregar={recarregar} />
      </ScrollView>

      <GlassModal title="Novo treino" visible={criandoTreino} onClose={() => setCriandoTreino(false)}>
        <View style={{ gap: tokens.spacing.sm }}>
          <TextInput value={nomeTreino} onChangeText={setNomeTreino} placeholder="Nome (ex.: Treino A)" placeholderTextColor={palette.textMuted} maxLength={40} autoFocus
            style={[styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]} />
          <Button title="Criar e adicionar exercícios" onPress={() => void criarTreino()} disabled={!nomeTreino.trim()} />
        </View>
      </GlassModal>
      <GlassModal title={editando?.indice === null ? 'Novo exercício' : 'Editar exercício'} visible={editando !== null} onClose={() => setEditando(null)}>
        {editando && (
          <FormExercicio
            pairing={pairing}
            treino={editando.treino}
            indice={editando.indice}
            aoTerminar={() => { setEditando(null); void recarregar(); }}
          />
        )}
      </GlassModal>
    </Animated.View>
  );
}

function FormExercicio({ pairing, treino, indice, aoTerminar }: { pairing: Pairing; treino: Treino; indice: number | null; aoTerminar: () => void }) {
  const { palette, tokens } = useTheme();
  const base = indice === null ? null : treino.exercicios[indice];
  const [nome, setNome] = useState(base?.nome ?? '');
  const [aquec, setAquec] = useState(base ? String(base.aquecimento) : '');
  const [ser, setSer] = useState(base ? String(base.series) : '');
  const [reps, setReps] = useState(base?.reps ?? '');
  const [carga, setCarga] = useState(base?.carga ?? '');
  const [obs, setObs] = useState(base?.obs ?? '');
  const [salvando, setSalvando] = useState(false);
  const campo = [styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];

  async function gravar(exercicios: Partial<Exercicio>[]) {
    setSalvando(true);
    try {
      await callRpc(pairing, 'treinos.save', { id: treino.id, nome: treino.nome, ordem: treino.ordem, exercicios });
      haptica.sucesso();
      aoTerminar();
    } catch (e) { Alert.alert('Não deu para salvar', errMessage(e)); }
    finally { setSalvando(false); }
  }
  function salvar() {
    if (!nome.trim()) { Alert.alert('Falta o nome', 'Dê um nome ao exercício.'); return; }
    // Em branco = o padrão do tipo (composto 2 aquec. + 3×4–6; isolador 3×10–12), decidido no PC.
    // Mantém o que o formulário não mostra (o tipo): edita por cima do exercício original.
    const novo: Partial<Exercicio> = { ...(base ?? {}), nome: nome.trim(), aquecimento: numero(aquec), series: numero(ser), reps: reps.trim() || undefined, carga: carga.trim() || undefined, obs: obs.trim() || undefined };
    const lista: Partial<Exercicio>[] = [...treino.exercicios];
    if (indice === null) lista.push(novo); else lista[indice] = novo;
    void gravar(lista);
  }
  function tirar() {
    if (indice === null) return;
    Alert.alert('Tirar o exercício?', `"${treino.exercicios[indice].nome}" sai do ${treino.nome}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar', style: 'destructive', onPress: () => void gravar(treino.exercicios.filter((_, i) => i !== indice)) },
    ]);
  }
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <TextInput value={nome} onChangeText={setNome} placeholder="Exercício (ex.: Rosca Direta)" placeholderTextColor={palette.textMuted} maxLength={80} style={campo} />
      <View style={styles.linha}>
        <TextInput value={aquec} onChangeText={setAquec} placeholder="Aquec." placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={1} style={[campo, { flex: 1 }]} />
        <TextInput value={ser} onChangeText={setSer} placeholder="Séries" placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={2} style={[campo, { flex: 1 }]} />
        <TextInput value={reps} onChangeText={setReps} placeholder="Reps (4–6)" placeholderTextColor={palette.textMuted} maxLength={12} style={[campo, { flex: 1.4 }]} />
      </View>
      <TextInput value={carga} onChangeText={setCarga} placeholder="Carga (ex.: 40 kg)" placeholderTextColor={palette.textMuted} maxLength={20} style={campo} />
      <TextInput value={obs} onChangeText={setObs} placeholder="Observação (opcional)" placeholderTextColor={palette.textMuted} maxLength={120} style={campo} />
      <Text variant="caption" color={palette.textMuted}>Em branco: compostos ficam com 2 aquecimentos + 3×4–6; isoladores com 3×10–12.</Text>
      <Button title={salvando ? 'Salvando…' : 'Salvar'} onPress={salvar} disabled={salvando} />
      {indice !== null && <Button title="Tirar do treino" variant="secondary" onPress={tirar} />}
    </View>
  );
}

function Nutricao({ corpo, pairing, recarregar }: { corpo: PainelCorpo; pairing: Pairing; recarregar: () => Promise<void> }) {
  const { palette, tokens } = useTheme();
  const [peso, setPeso] = useState('');
  const m = corpo.meta;
  async function anotarPeso() {
    const kg = numero(peso);
    if (!kg) return;
    haptica.leve();
    try { await callRpc(pairing, 'corpo.peso', { kg }); setPeso(''); await recarregar(); }
    catch (e) { Alert.alert('Peso', errMessage(e)); }
  }
  return (
    <>
      <Text variant="label" color={palette.textMuted} style={styles.secao}>NUTRIÇÃO</Text>
      <Card glass style={{ gap: 8 }}>
        {m ? (
          <>
            <View style={[styles.linha, { alignItems: 'baseline' }]}>
              <Text variant="heading" color={palette.primary}>{m.kcal}</Text>
              <Text variant="caption" color={palette.textMuted}>kcal hoje · gasto ~{m.gasto}{m.corrida ? ` + ${m.corrida} da corrida` : ''}</Text>
            </View>
            <View style={styles.macros}>
              {[['Proteína', m.proteinaG], ['Carbo', m.carboG], ['Gordura', m.gorduraG]].map(([t, g]) => (
                <View key={t as string} style={[styles.macro, { borderColor: palette.border, borderRadius: tokens.radii.md }]}>
                  <Text variant="subheading">{g} g</Text>
                  <Text variant="caption" color={palette.textMuted}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text variant="caption" color={palette.textMuted}>Para a meta faltam: {corpo.faltaPerfil.join(', ')} — preencha o perfil abaixo.</Text>
        )}
        {corpo.sugestao ? <Text variant="caption" color={palette.accent}>{corpo.sugestao}</Text> : null}
        <View style={styles.linha}>
          <TextInput value={peso} onChangeText={setPeso} placeholder={corpo.perfil.pesoKg ? `Peso hoje (último: ${corpo.perfil.pesoKg} kg)` : 'Peso hoje (kg)'} placeholderTextColor={palette.textMuted} keyboardType="decimal-pad" maxLength={5}
            onSubmitEditing={anotarPeso} style={[styles.campo, { flex: 1, borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }]} />
          <Pressable onPress={anotarPeso} accessibilityLabel="Anotar peso" style={[styles.redondo, { backgroundColor: palette.primary }]}>
            <Feather name="check" size={18} color={palette.background} />
          </Pressable>
        </View>
        {corpo.pesos.length > 1 && (
          <Text variant="caption" color={palette.textMuted}>
            {corpo.pesos.slice(-6).map(p => `${p.data.slice(8, 10)}/${p.data.slice(5, 7)} ${String(p.kg).replace('.', ',')}`).join('  ·  ')}
          </Text>
        )}
      </Card>
    </>
  );
}

function Corrida({ corpo, pairing, aplicar }: { corpo: PainelCorpo; pairing: Pairing; aplicar: (c: PainelCorpo) => void }) {
  const { palette, tokens } = useTheme();
  const c = corpo.corrida;
  const [min, setMin] = useState('');
  const [km, setKm] = useState('');
  async function anotar() {
    const minutos = numero(min) ?? c.minutos;
    haptica.medio();
    try {
      const r = await callRpc(pairing, 'corrida.marcar', { minutos, km: numero(km) });
      aplicar(r.painel);
      setMin(''); setKm('');
      haptica.sucesso();
      if (r.painel.corrida.semana > c.semana) Alert.alert('Plano de corrida', `Semana ${r.painel.corrida.semana} liberada. 🏃`);
    } catch (e) { Alert.alert('Corrida', errMessage(e)); }
  }
  const campo = [styles.campo, { flex: 1, borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];
  return (
    <>
      <Text variant="label" color={palette.textMuted} style={styles.secao}>CORRIDA</Text>
      <Card glass style={{ gap: 8 }}>
        <Text variant="label" color={palette.accent} style={{ letterSpacing: 1.2 }}>{c.concluido ? 'PLANO CONCLUÍDO' : `SEMANA ${c.semana} · SESSÃO ${c.sessao}/3`}</Text>
        <Text variant="body">{c.texto}</Text>
        <Text variant="caption" color={palette.textMuted}>Ritmo de conversa: se não dá para falar, está rápido demais. Semana difícil? Repita — o plano avança por sessão anotada.</Text>
        <View style={styles.linha}>
          <TextInput value={min} onChangeText={setMin} placeholder={`${c.minutos} min`} placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={3} style={campo} />
          <TextInput value={km} onChangeText={setKm} placeholder="km (opcional)" placeholderTextColor={palette.textMuted} keyboardType="decimal-pad" maxLength={5} style={campo} />
          <Pressable onPress={anotar} accessibilityLabel="Anotar corrida" style={[styles.redondo, { backgroundColor: palette.primary }]}>
            <Feather name="check" size={18} color={palette.background} />
          </Pressable>
        </View>
        {c.ultimas.map(x => (
          <Animated.View key={x.id} entering={FadeIn.duration(200)} style={styles.linha}>
            <Feather name="activity" size={13} color={palette.textMuted} />
            <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>
              {x.data.slice(8, 10)}/{x.data.slice(5, 7)} · {x.minutos} min{x.km ? ` · ${String(x.km).replace('.', ',')} km` : ''}{x.doPlano ? '' : ' · livre'}
            </Text>
          </Animated.View>
        ))}
      </Card>
    </>
  );
}

function Perfil({ corpo, pairing, recarregar }: { corpo: PainelCorpo; pairing: Pairing; recarregar: () => Promise<void> }) {
  const { palette, tokens } = useTheme();
  const p = corpo.perfil;
  const [sexo, setSexo] = useState(p.sexo);
  const [idade, setIdade] = useState(p.idade ? String(p.idade) : '');
  const [altura, setAltura] = useState(p.alturaCm ? String(p.alturaCm) : '');
  const [atividade, setAtividade] = useState(p.atividade);
  const [objetivo, setObjetivo] = useState(p.objetivo);
  const [foco, setFoco] = useState(p.foco ?? '');
  const [ajuste, setAjuste] = useState(p.ajusteKcal ? String(p.ajusteKcal) : '');
  const [salvando, setSalvando] = useState(false);
  const campo = [styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];
  const chips = <T extends string>(lista: { k: T; t: string }[], atual: T | undefined, set: (v: T) => void) => (
    <View style={[styles.linha, { flexWrap: 'wrap' }]}>
      {lista.map(o => {
        const on = o.k === atual;
        return (
          <Pressable key={o.k} onPress={() => { haptica.tique(); set(o.k); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={[styles.chip, { borderColor: on ? palette.primary : palette.border, backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
            <Text variant="caption" color={on ? palette.primary : palette.text}>{o.t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  async function salvar() {
    setSalvando(true);
    try {
      await callRpc(pairing, 'corpo.perfil', { sexo, idade: numero(idade), alturaCm: numero(altura), atividade, objetivo, foco, ajusteKcal: numero(ajuste) ?? 0 });
      haptica.sucesso();
      await recarregar();
    } catch (e) { Alert.alert('Perfil', errMessage(e)); }
    finally { setSalvando(false); }
  }
  return (
    <>
      <Text variant="label" color={palette.textMuted} style={styles.secao}>PERFIL — BASE DA META</Text>
      <Card glass style={{ gap: 10 }}>
        {chips([{ k: 'masculino', t: 'Masculino' }, { k: 'feminino', t: 'Feminino' }], sexo, setSexo)}
        <View style={styles.linha}>
          <TextInput value={idade} onChangeText={setIdade} placeholder="Idade" placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={3} style={[campo, { flex: 1 }]} />
          <TextInput value={altura} onChangeText={setAltura} placeholder="Altura (cm)" placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={3} style={[campo, { flex: 1 }]} />
        </View>
        <Text variant="caption" color={palette.textMuted}>Treino por semana</Text>
        {chips(ATIVIDADES, atividade, setAtividade)}
        <Text variant="caption" color={palette.textMuted}>Objetivo</Text>
        {chips(OBJETIVOS, objetivo, setObjetivo)}
        <TextInput value={foco} onChangeText={setFoco} placeholder="Foco (ex.: braços) — entra nas dicas" placeholderTextColor={palette.textMuted} maxLength={60} style={campo} />
        <TextInput value={ajuste} onChangeText={setAjuste} placeholder="Ajuste manual da meta (kcal, ex.: 150)" placeholderTextColor={palette.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} style={campo} />
        <Text variant="caption" color={palette.textMuted}>O peso entra pela Nutrição, acima. Tudo fica só no seu PC.</Text>
        <Button title={salvando ? 'Salvando…' : 'Salvar perfil'} onPress={salvar} disabled={salvando} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  camada: { zIndex: 25, elevation: 25 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  voltar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 20, borderWidth: 1 },
  exercicio: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  editar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  secao: { letterSpacing: 1.4, marginTop: 4 },
  campo: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  redondo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  macros: { flexDirection: 'row', gap: 8 },
  macro: { flex: 1, alignItems: 'center', paddingVertical: 8, borderWidth: 1 },
});
