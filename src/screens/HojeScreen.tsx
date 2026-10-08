import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, Habito, Meta, PainelHoje } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { confirmDestructive } from '../lib/confirm';
import { useTheme } from '../theme';
import { Button, Card, GlassModal, ScreenHeader, Text } from '../components/ui';
import { Reator } from '../components/Reator';
import { Markdown } from '../components/Markdown';

/**
 * Hoje (fase 16, 07/10) — o briefing do dia, a mesma aba do desktop. Uma chamada só
 * (`hoje.painel`) traz saudação, status, clima, agenda, listas, hábitos, metas e alertas.
 * Hábito marca com um toque (com vibração e a sequência 🔥); toque longo edita.
 */

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function horaCurta(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function restante(ms: number) {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function HojeScreen({ pairing }: { pairing: Pairing }) {
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

  // Contagem dos timers ao vivo, só com timer correndo.
  useEffect(() => {
    if (!painel?.timers.length) return;
    const t = setInterval(() => setTique(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [painel?.timers.length]);

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

  const secao = (t: string, acao?: { rotulo: string; onPress: () => void }) => (
    <View style={styles.secaoTopo}>
      <Text variant="label" color={palette.textMuted} style={styles.secao}>{t}</Text>
      {acao && (
        <Pressable onPress={acao.onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={acao.rotulo} style={styles.secaoAcao}>
          <Feather name="plus" size={15} color={palette.primary} />
          <Text variant="label" color={palette.primary}>{acao.rotulo}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Hoje" />
      <ScrollView
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

            {painel.alertas.map((a, i) => (
              <Card key={i} glass style={[styles.alerta, { borderColor: a.nivel === 'erro' ? palette.error : '#f0b43c' }]}>
                <Feather name="alert-triangle" size={16} color={a.nivel === 'erro' ? palette.error : '#f0b43c'} />
                <Text variant="caption" style={{ flex: 1 }}><Text variant="caption" style={{ fontWeight: '700' }}>{a.titulo}</Text> — {a.detalhe}</Text>
              </Card>
            ))}

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
                    <Text variant="caption" color={palette.textMuted}>🔥 dias</Text>
                  </View>
                </Pressable>
              ))}
            </Card>

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

            {painel.clima && (
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

            {painel.listas.length > 0 && (
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

            {secao('MANCHETES')}
            <Card glass style={{ gap: 8 }}>
              {manchetes ? <Markdown texto={manchetes} cor={palette.text} /> : <Text variant="caption" color={palette.textMuted}>Sob demanda — a busca vai à internet.</Text>}
              <Button title={buscandoManchetes ? 'Buscando…' : manchetes ? 'Buscar de novo' : 'Buscar manchetes'} variant="secondary" onPress={buscarManchetes} disabled={buscandoManchetes} />
            </Card>
          </>
        )}
      </ScrollView>

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
    </View>
  );
}

function FormHabito({ pairing, base, aoTerminar }: { pairing: Pairing; base: Partial<Habito>; aoTerminar: () => void }) {
  const { palette, tokens } = useTheme();
  const [nome, setNome] = useState(base.nome ?? '');
  const [dias, setDias] = useState<number[]>(base.dias ?? []);
  const [hora, setHora] = useState(base.horaLembrete ?? '');
  const [salvando, setSalvando] = useState(false);
  const campo = [styles.campo, { borderColor: palette.border, color: palette.text, borderRadius: tokens.radii.md }];
  async function salvar() {
    if (!nome.trim()) return;
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { Alert.alert('Hora inválida', 'Use HH:MM, por exemplo 07:30.'); return; }
    setSalvando(true);
    try { await callRpc(pairing, 'habitos.save', { id: base.id, nome, dias, horaLembrete: hora || undefined }); haptica.sucesso(); aoTerminar(); }
    catch (e) { Alert.alert('Não deu para salvar', errMessage(e)); }
    finally { setSalvando(false); }
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
      <View style={styles.linha}>
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
      <TextInput value={hora} onChangeText={setHora} placeholder="Lembrar às (HH:MM) — opcional" placeholderTextColor={palette.textMuted} maxLength={5} keyboardType="numbers-and-punctuation" style={campo} />
      <Button title={salvando ? 'Salvando…' : base.id ? 'Salvar' : 'Criar hábito'} onPress={salvar} disabled={salvando || !nome.trim()} />
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
  diaBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
