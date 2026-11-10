import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View, RefreshControl } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { MOV } from '../lib/motion';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import { callRpc, Entrega, Reminder, Rotina } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { useTheme } from '../theme';
import { Button, Card, GlassCircle, GlassModal, ScreenHeader, Text, Toque, useFolgaDoTopo, VidroSwitch, FundoVidro } from '../components/ui';
import { notificacoesAtivas, definirNotificacoesAtivas, pedirPermissao, sincronizarNotificacoes } from '../lib/notificacoes';
import { useAoReativar } from '../components/AbaViva';
import { comConfirmacao } from '../lib/confirm';
import { avisarTokenRecusado } from '../lib/erroRpc';

/**
 * Aba Rotinas (bloco 72) — a mesma aba do desktop (bloco 68), no celular: as rotinas do
 * PC (criar, pausar, rodar agora, apagar), os lembretes, e o que já foi entregue a este
 * aparelho. É a resposta ao pedido "todo dia me mandar tal coisa": a rotina roda no PC na
 * hora marcada e a resposta cai aqui como notificação, com o app fechado (ver
 * `notificacoes.ts`).
 */

const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_LONGOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const EXEMPLOS: Partial<Rotina>[] = [
  { nome: 'Bom dia', texto: 'como está o tempo hoje?', hora: '07:30', dias: [1, 2, 3, 4, 5], entregar: ['pc', 'celular'], falar: true },
  { nome: 'Lembretes do dia', texto: 'quais são os meus lembretes de hoje?', hora: '08:00', dias: [], entregar: ['celular'] },
  { nome: 'Estado do PC', texto: 'como está o PC?', hora: '18:00', dias: [], entregar: ['celular'] },
];

/**
 * Modelos prontos (fase 16), os mesmos do desktop: as rotinas que mais se elogiam em
 * assistentes. Um toque abre o formulário preenchido; nada é criado sem salvar.
 */
const MODELOS: Partial<Rotina>[] = [
  { nome: 'Briefing da manhã', texto: 'me dá o resumo do dia', hora: '07:30', dias: [1, 2, 3, 4, 5], entregar: ['pc', 'celular'], falar: true },
  { nome: 'Fim do expediente', texto: 'como foi meu dia? o que ficou pendente nas listas e nos hábitos?', hora: '18:30', dias: [1, 2, 3, 4, 5], entregar: ['pc', 'celular'] },
  { nome: 'Hora de dormir', texto: 'abaixa o volume para 15', hora: '23:00', dias: [], entregar: ['pc'] },
  { nome: 'Pausa para água', texto: 'me lembra, numa frase curta, de beber um copo de água agora', hora: '15:00', dias: [1, 2, 3, 4, 5], entregar: ['celular'] },
  { nome: 'Revisão da semana', texto: 'como estão meus hábitos e minhas metas esta semana?', hora: '18:00', dias: [5], entregar: ['pc', 'celular'], falar: true },
];

function diasTexto(dias: number[]): string {
  if (!dias.length || dias.length === 7) return 'todos os dias';
  if (dias.length === 5 && [1, 2, 3, 4, 5].every(d => dias.includes(d))) return 'dias úteis';
  if (dias.length === 2 && dias.includes(0) && dias.includes(6)) return 'fins de semana';
  return dias.map(d => DIAS_LONGOS[d]).join(', ');
}

function quando(epoch: number): string {
  const d = new Date(epoch);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 86400000);
  if (d.toDateString() === hoje.toDateString()) return `hoje ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `amanhã ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

/**
 * Fase 22: Rotinas saiu das abas (o celular ficou com Início, Chat, PC e Hoje) e abre como
 * gaveta a partir do Hoje e do card de atalhos. `naGaveta` tira o cabeçalho — a gaveta tem o dela.
 */
export default function RotinasScreen({ pairing, onUnpair, naGaveta }: { pairing: Pairing; onUnpair: () => void; naGaveta?: boolean }) {
  const { palette, tokens } = useTheme();
  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [eventos, setEventos] = useState<{ id: string; rotulo: string }[]>([]);
  const [lembretes, setLembretes] = useState<Reminder[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Rotina> | null>(null);
  const [avisos, setAvisos] = useState(true);

  const falha = useCallback((err: unknown, contexto: string) => {
    if (err instanceof AuthError) {
      // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
      avisarTokenRecusado();
      return;
    }
    haptica.erro();
    setErro(`${contexto}: ${errMessage(err)}`);
  }, [onUnpair]);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [r, l, e] = await Promise.all([
        callRpc(pairing, 'rotinas.list'),
        callRpc(pairing, 'reminders.list'),
        callRpc(pairing, 'notify.history'),
      ]);
      setRotinas(r.rotinas);
      if (r.eventos?.length) setEventos(r.eventos);
      setLembretes(l.reminders.filter(x => !x.firedAt));
      setEntregas(e.entregas);
    } catch (err) {
      falha(err, 'Não consegui ler as rotinas');
    } finally {
      setCarregando(false);
    }
  }, [pairing, falha]);

  useEffect(() => { carregar(); }, [carregar]);
  useAoReativar(() => { void carregar(); });
  useEffect(() => { notificacoesAtivas().then(setAvisos); }, []);

  async function alternar(r: Rotina, ativa: boolean) {
    setRotinas(prev => prev.map(x => (x.id === r.id ? { ...x, ativa } : x)));
    try { await callRpc(pairing, 'rotinas.toggle', { id: r.id, ativa }); haptica.leve(); carregar(); }
    catch (err) { falha(err, 'Não consegui alterar'); carregar(); }
  }

  async function rodar(r: Rotina) {
    haptica.medio();
    try {
      const { resultado } = await callRpc(pairing, 'rotinas.run', { id: r.id }, { timeoutMs: 90_000 });
      Alert.alert(r.nome, resultado);
      carregar();
    } catch (err) { falha(err, 'Não consegui rodar'); }
  }

  function apagar(r: Rotina) {
    Alert.alert('Apagar rotina', `“${r.nome}” deixa de rodar. Continuar?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try { await callRpc(pairing, 'rotinas.delete', { id: r.id }, { confirmed: true }); haptica.sucesso(); carregar(); }
        catch (err) { falha(err, 'Não consegui apagar'); }
      } },
    ]);
  }

  /** Cancelar pergunta antes (08/10): o X ficava colado no texto e cancelava num toque. */
  function cancelarLembrete(l: Reminder) {
    Alert.alert('Cancelar o lembrete?', `"${l.text}" não vai mais tocar.`, [
      { text: 'Manter', style: 'cancel' },
      { text: 'Cancelar lembrete', style: 'destructive', onPress: async () => {
        try { await callRpc(pairing, 'reminders.cancel', { id: l.id }); haptica.medio(); carregar(); }
        catch (err) { falha(err, 'Não consegui cancelar'); }
      } },
    ]);
  }
  const [atualizando, setAtualizando] = useState(false);
  async function puxar() { setAtualizando(true); try { await carregar(); } finally { setAtualizando(false); } }

  async function mudarAvisos(v: boolean) {
    setAvisos(v);
    await definirNotificacoesAtivas(v);
    if (v) {
      const ok = await pedirPermissao();
      if (!ok) Alert.alert('Sem permissão', 'O Android não deixou o ELYSIUM-M notificar. Libere em Configurações → Apps → ELYSIUM-M → Notificações.');
      sincronizarNotificacoes(pairing).catch(() => {});
    }
  }

  const folgaTopo = useFolgaDoTopo();
  return (
    <View style={{ flex: 1 }}>
      {naGaveta ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: tokens.spacing.lg }}>
          <Pressable onPress={() => setEditando({})} hitSlop={12} accessibilityRole="button" accessibilityLabel="Nova rotina" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="plus-circle" size={20} color={palette.primary} />
            <Text variant="label" color={palette.primary}>Nova rotina</Text>
          </Pressable>
        </View>
      ) : (
      <ScreenHeader
        title="Rotinas"
        flutuante
        right={(
          <GlassCircle size={40} onPress={() => setEditando({})} accessibilityLabel="Nova rotina">
            <Feather name="plus" size={20} color={palette.primary} />
          </GlassCircle>
        )}
      />
      )}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingTop: naGaveta ? tokens.spacing.lg : folgaTopo, gap: tokens.spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxar} tintColor={palette.primary} colors={[palette.primary]} />}
      >
        {erro && (
          <View style={{ gap: 8 }}>
            <Text variant="caption" color={palette.error}>{erro}</Text>
            <Button title="Tentar de novo" variant="secondary" onPress={() => void carregar()} />
          </View>
        )}
        {carregando && <ActivityIndicator color={palette.primary} />}

        {/* Avisos neste celular */}
        <Card glass>
          <View style={styles.linha}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Avisar neste celular</Text>
              <Text variant="caption" color={palette.textMuted}>
                Rotinas e lembretes viram notificação — com o app fechado, pelo menos a cada 15 min.
              </Text>
            </View>
            <VidroSwitch value={avisos} onValueChange={mudarAvisos} accessibilityLabel="Avisar neste celular" />
          </View>
        </Card>

        {/* Modelos prontos (fase 16): somem os que já viraram rotina, pelo nome. */}
        {(() => {
          const nomes = new Set(rotinas.map(x => x.nome.toLowerCase()));
          const livres = MODELOS.filter(m => !nomes.has((m.nome ?? '').toLowerCase()));
          if (carregando || !livres.length) return null;
          return (
            <>
              <Text variant="label" color={palette.textMuted} style={styles.secao}>MODELOS PRONTOS</Text>
              <View style={styles.chips}>
                {livres.map((m, i) => (
                  <Toque key={i} onPress={() => setEditando(m)} hitSlop={{ top: 4, bottom: 4 }} accessibilityRole="button" style={[styles.chip, { backgroundColor: palette.primarySoft }]}>
                <FundoVidro cor={palette.primarySoft} />
                    <Text variant="caption" color={palette.primary}>+ {m.nome} · {m.hora}</Text>
                  </Toque>
                ))}
              </View>
            </>
          );
        })()}

        {/* Rotinas */}
        <Text variant="label" color={palette.textMuted} style={styles.secao}>ROTINAS</Text>
        {!carregando && rotinas.length === 0 && (
          <Card glass>
            <Text variant="body">Nenhuma rotina ainda.</Text>
            <Text variant="caption" color={palette.textMuted} style={{ marginTop: 4 }}>
              Uma rotina é um pedido que o ELYSIUM faz sozinho, na hora marcada. A resposta chega aqui.
            </Text>
            <View style={[styles.chips, { marginTop: tokens.spacing.md }]}>
              {EXEMPLOS.map((ex, i) => (
                <Toque key={i} onPress={() => setEditando(ex)} style={[styles.chip, { backgroundColor: palette.primarySoft }]}>
                <FundoVidro cor={palette.primarySoft} />
                  <Text variant="caption" color={palette.primary}>{ex.nome} · {ex.hora}</Text>
                </Toque>
              ))}
            </View>
          </Card>
        )}
        {rotinas.map((r, i) => (
          <Animated.View key={r.id} entering={FadeInDown.delay(i * 30).duration(MOV.base).reduceMotion(ReduceMotion.System)}>
          <Card glass style={{ opacity: r.ativa ? 1 : 0.7 }}>
            <View style={styles.linha}>
              <View style={{ width: 64 }}>
                {r.gatilho?.tipo === 'evento'
                  ? <Feather name="zap" size={26} color={palette.primary} />
                  : <Text variant="heading" color={palette.primary}>{r.hora}</Text>}
                <Text variant="caption" color={palette.textMuted}>
                  {!r.ativa ? 'pausada' : r.gatilho?.tipo === 'evento' ? (r.quando ?? 'por evento') : r.proxima ? quando(r.proxima) : ''}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{r.nome}</Text>
                <Text variant="caption" color={palette.textMuted} numberOfLines={1}>“{r.texto}”</Text>
                {!!r.condicao && <Text variant="caption" color={palette.textMuted} numberOfLines={1}>só {r.condicao}</Text>}
                {r.gatilho?.tipo !== 'evento' && <View style={styles.dias}>
                  {DIAS_CURTOS.map((d, i) => {
                    const on = !r.dias.length || r.dias.includes(i);
                    return (
                      <View key={i} style={[styles.dia, { backgroundColor: on ? palette.primarySoft : 'transparent' }]}>
                        <Text variant="caption" color={on ? palette.primary : palette.textMuted} style={{ fontSize: 10, fontWeight: '700' }}>{d}</Text>
                      </View>
                    );
                  })}
                  <View style={{ flexDirection: 'row', gap: 4, marginLeft: 6 }}>
                    {r.entregar.includes('pc') && <Feather name="monitor" size={12} color={palette.textMuted} />}
                    {r.entregar.includes('celular') && <Feather name="smartphone" size={12} color={palette.textMuted} />}
                    {r.falar && <Feather name="mic" size={12} color={palette.textMuted} />}
                  </View>
                </View>}
              </View>
              <VidroSwitch value={r.ativa} onValueChange={(v) => alternar(r, v)} accessibilityLabel={`Rotina ${r.nome} ligada`} />
            </View>
            {!!r.ultimoResultado && (
              <View style={[styles.resultado, { borderLeftColor: palette.primary, backgroundColor: palette.primarySoft }]}>
                <Text variant="caption" color={palette.textMuted}>última vez, {r.ultimaExecucao ? quando(r.ultimaExecucao) : ''}</Text>
                <Text variant="caption" color={palette.text}>{r.ultimoResultado}</Text>
              </View>
            )}
            <View style={[styles.acoes, { marginTop: tokens.spacing.sm }]}>
              <Button title="Rodar agora" variant="secondary" onPress={() => rodar(r)} />
              <Button title="Editar" variant="ghost" onPress={() => setEditando(r)} />
              <Button title="Apagar" variant="ghost" onPress={() => apagar(r)} />
            </View>
          </Card>
          </Animated.View>
        ))}

        {/* Lembretes */}
        <Text variant="label" color={palette.textMuted} style={styles.secao}>LEMBRETES</Text>
        <Card glass>
          {lembretes.length === 0 && <Text variant="caption" color={palette.textMuted}>Nada agendado. Diga “me lembra às 15h de…” no Chat.</Text>}
          {lembretes.map(l => (
            <View key={l.id} style={[styles.linha, { paddingVertical: 6 }]}>
              <Feather name={l.kind === 'weekly' ? 'repeat' : 'bell'} size={16} color={palette.textMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="body">{l.text}</Text>
                <Text variant="caption" color={palette.textMuted}>{quando(l.dueAt)}{l.kind === 'weekly' ? ' · toda semana' : ''}</Text>
              </View>
              <Pressable onPress={() => cancelarLembrete(l)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Cancelar o lembrete ${l.text}`} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x-circle" size={20} color={palette.error} />
              </Pressable>
            </View>
          ))}
        </Card>

        {/* Entregas */}
        <Text variant="label" color={palette.textMuted} style={styles.secao}>ENTREGUES A ESTE CELULAR</Text>
        <Card glass>
          {entregas.length === 0 && <Text variant="caption" color={palette.textMuted}>Nada ainda. Rotinas com destino “celular” e lembretes aparecem aqui.</Text>}
          {entregas.slice(0, 12).map(e => (
            <View key={e.id} style={[styles.linha, { paddingVertical: 6, alignItems: 'flex-start' }]}>
              <Feather name={e.tipo === 'lembrete' ? 'bell' : e.tipo === 'rotina' ? 'calendar' : 'info'} size={16} color={palette.textMuted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{e.titulo}</Text>
                <Text variant="caption" color={palette.text} numberOfLines={3}>{e.corpo}</Text>
                <Text variant="caption" color={e.entregueEm ? palette.success : palette.textMuted}>
                  {quando(e.em)} · {e.entregueEm ? 'recebida' : 'aguardando'}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      <GlassModal visible={editando !== null} onClose={() => setEditando(null)} title={editando?.id ? 'Editar rotina' : 'Nova rotina'}>
        {editando && (
          <FormRotina
            base={editando}
            eventos={eventos}
            onCancelar={() => setEditando(null)}
            onSalvar={async (dados) => {
              try {
                // Rotina que desliga, reinicia ou apaga: o PC pede confirmação (08/10).
                const r = await comConfirmacao(confirmed => callRpc(pairing, 'rotinas.save', dados, { confirmed }), 'Gravar a rotina', 'Ela vai desligar, reiniciar ou apagar algo sozinha, sem perguntar de novo.');
                if (r === null) return;
                haptica.sucesso();
                setEditando(null);
                carregar();
              } catch (err) { falha(err, 'Não consegui salvar'); }
            }}
          />
        )}
      </GlassModal>
    </View>
  );
}

function FormRotina({ base, eventos, onSalvar, onCancelar }: {
  base: Partial<Rotina>;
  eventos: { id: string; rotulo: string }[];
  onSalvar: (dados: Record<string, unknown>) => Promise<void>;
  onCancelar: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [nome, setNome] = useState(base.nome ?? '');
  const [texto, setTexto] = useState(base.texto ?? '');
  const [hora, setHora] = useState(base.hora ?? '08:00');
  const [dias, setDias] = useState<number[]>(base.dias ?? []);
  const [pc, setPc] = useState((base.entregar ?? ['pc', 'celular']).includes('pc'));
  const [celular, setCelular] = useState((base.entregar ?? ['pc', 'celular']).includes('celular'));
  const [falar, setFalar] = useState(Boolean(base.falar));
  const [salvando, setSalvando] = useState(false);
  // Gatilho por evento (bloco 79): substitui hora e dias.
  const g0 = base.gatilho?.tipo === 'evento' ? base.gatilho : null;
  const [porEvento, setPorEvento] = useState(Boolean(g0));
  const [evento, setEvento] = useState(g0?.evento ?? eventos[0]?.id ?? 'celular.conectou');
  const [app, setApp] = useState(g0?.app ?? '');
  const [minutos, setMinutos] = useState(String(g0?.minutos ?? 30));
  const [limite, setLimite] = useState(String(g0?.limite ?? 90));
  const [cada, setCada] = useState(String(g0?.cada ?? 60));
  const [condicao, setCondicao] = useState(base.condicao ?? '');

  const horaOk = porEvento || /^\d{1,2}:\d{2}$/.test(hora.trim());
  const campo = { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text };

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View>
        <Text variant="label">Nome</Text>
        <TextInput value={nome} onChangeText={setNome} placeholder="Ex.: Bom dia" placeholderTextColor={palette.textMuted} style={[styles.campo, campo]} />
      </View>
      <View>
        <Text variant="label">O que o ELYSIUM faz</Text>
        <Text variant="caption" color={palette.textMuted}>Escreva como falaria: uma pergunta, um comando, um preset.</Text>
        <TextInput value={texto} onChangeText={setTexto} placeholder="Ex.: como está o tempo hoje?" placeholderTextColor={palette.textMuted} multiline style={[styles.campo, campo, { minHeight: 72, textAlignVertical: 'top' }]} />
        <View style={[styles.chips, { marginTop: 8 }]}>
          {EXEMPLOS.map((ex, i) => (
            <Toque key={i} onPress={() => setTexto(ex.texto ?? '')} style={[styles.chip, { backgroundColor: palette.primarySoft }]}>
                <FundoVidro cor={palette.primarySoft} />
              <Text variant="caption" color={palette.primary}>{ex.texto}</Text>
            </Toque>
          ))}
        </View>
      </View>
      <View>
        <Text variant="label">Quando</Text>
        <View style={[styles.chips, { marginTop: 8 }]}>
          {[['hora', 'Numa hora'], ['evento', 'Num evento']].map(([id, rotulo]) => (
            <Toque key={id} onPress={() => setPorEvento(id === 'evento')} style={[styles.chip, { backgroundColor: (id === 'evento') === porEvento ? palette.primarySoft : palette.surface }]}>
                <FundoVidro cor={(id === 'evento') === porEvento ? palette.primarySoft : undefined} />
              <Text variant="caption" color={(id === 'evento') === porEvento ? palette.primary : palette.textMuted}>{rotulo}</Text>
            </Toque>
          ))}
        </View>
      </View>
      {porEvento && (
        <View style={{ gap: 10 }}>
          <Text variant="label">Evento</Text>
          <View style={styles.chips}>
            {eventos.map(e => (
              <Toque key={e.id} onPress={() => setEvento(e.id)} style={[styles.chip, { backgroundColor: evento === e.id ? palette.primarySoft : palette.surface }]}>
                <FundoVidro cor={evento === e.id ? palette.primarySoft : undefined} />
                <Text variant="caption" color={evento === e.id ? palette.primary : palette.textMuted}>{e.rotulo}</Text>
              </Toque>
            ))}
          </View>
          {/^app\./.test(evento) && (
            <View><Text variant="label">Qual programa (vazio = qualquer)</Text>
              <TextInput value={app} onChangeText={setApp} placeholder="Ex.: chrome" placeholderTextColor={palette.textMuted} style={[styles.campo, campo]} /></View>
          )}
          {evento === 'pc.ocioso' && (
            <View><Text variant="label">Minutos parado</Text>
              <TextInput value={minutos} onChangeText={setMinutos} keyboardType="number-pad" placeholderTextColor={palette.textMuted} style={[styles.campo, campo, { width: 110 }]} /></View>
          )}
          {/\.alta$/.test(evento) && (
            <View><Text variant="label">Acima de (%)</Text>
              <TextInput value={limite} onChangeText={setLimite} keyboardType="number-pad" placeholderTextColor={palette.textMuted} style={[styles.campo, campo, { width: 110 }]} /></View>
          )}
          <View><Text variant="label">Intervalo mínimo entre disparos (min)</Text>
            <TextInput value={cada} onChangeText={setCada} keyboardType="number-pad" placeholderTextColor={palette.textMuted} style={[styles.campo, campo, { width: 110 }]} /></View>
        </View>
      )}
      {!porEvento && <View>
        <Text variant="label">Hora (HH:MM)</Text>
        <TextInput value={hora} onChangeText={setHora} placeholder="08:00" keyboardType="numbers-and-punctuation" placeholderTextColor={palette.textMuted} style={[styles.campo, campo, { width: 110 }, !horaOk && { borderColor: palette.error }]} />
      </View>}
      {!porEvento && <View>
        <Text variant="label">Dias</Text>
        <Text variant="caption" color={palette.textMuted}>Nenhum marcado = todos os dias.</Text>
        <View style={[styles.dias, { marginTop: 8, gap: 6 }]}>
          {DIAS_CURTOS.map((d, i) => {
            const on = dias.includes(i);
            return (
              <Toque key={i} onPress={() => setDias(on ? dias.filter(x => x !== i) : [...dias, i].sort())}
                style={[styles.diaGrande, { backgroundColor: on ? palette.primarySoft : palette.surface, borderColor: on ? palette.primary : palette.border }]}>
                <Text variant="label" color={on ? palette.primary : palette.textMuted}>{d}</Text>
              </Toque>
            );
          })}
        </View>
      </View>}
      <View>
        <Text variant="label">Só se…</Text>
        <Text variant="caption" color={palette.textMuted}>Condição em português; o PC olha antes de rodar. Vazio = sempre.</Text>
        <TextInput value={condicao} onChangeText={setCondicao} placeholder="Ex.: se o Spotify estiver aberto" placeholderTextColor={palette.textMuted} style={[styles.campo, campo]} />
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="label">Entregar</Text>
        <View style={styles.linha}><Feather name="monitor" size={16} color={palette.textMuted} /><Text variant="body" style={{ flex: 1 }}>No PC (notificação)</Text><VidroSwitch value={pc} onValueChange={setPc} accessibilityLabel="No PC (notificação)" /></View>
        <View style={styles.linha}><Feather name="smartphone" size={16} color={palette.textMuted} /><Text variant="body" style={{ flex: 1 }}>Neste celular</Text><VidroSwitch value={celular} onValueChange={setCelular} accessibilityLabel="Neste celular" /></View>
        <View style={styles.linha}><Feather name="mic" size={16} color={palette.textMuted} /><Text variant="body" style={{ flex: 1 }}>Falar no PC</Text><VidroSwitch value={falar} onValueChange={setFalar} accessibilityLabel="Falar no PC" /></View>
      </View>
      <View style={styles.acoes}>
        <Button
          title={base.id ? 'Salvar' : 'Criar rotina'}
          loading={salvando}
          disabled={!nome.trim() || !texto.trim() || !horaOk}
          onPress={async () => {
            setSalvando(true);
            const entregar = [pc ? 'pc' : null, celular ? 'celular' : null].filter(Boolean);
            await onSalvar({
              id: base.id, nome: nome.trim(), texto: texto.trim(), hora: porEvento ? '00:00' : hora.trim(), dias: porEvento ? [] : dias,
              entregar: entregar.length ? entregar : ['pc'], falar,
              condicao: condicao.trim() || undefined,
              gatilho: porEvento ? { tipo: 'evento', evento, app: app.trim() || undefined, minutos: Number(minutos) || undefined, limite: Number(limite) || undefined, cada: cada === '' ? undefined : Number(cada) } : undefined,
            });
            setSalvando(false);
          }}
        />
        <Button title="Cancelar" variant="ghost" onPress={onCancelar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  secao: { marginTop: 8, letterSpacing: 0.4, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  dias: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  dia: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  diaGrande: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resultado: { marginTop: 10, padding: 10, borderRadius: 10, borderLeftWidth: 2, gap: 2 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 6 },
});
