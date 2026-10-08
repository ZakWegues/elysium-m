import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Pairing } from '../../lib/pairing';
import { callRpc, PainelCorpo, PainelHoje } from '../../lib/rpc';
import { errMessage } from '../../lib/errors';
import { haptica } from '../../lib/haptica';
import { falar, pararDeFalar, useFala } from '../../lib/falar';
import { useTheme } from '../../theme';
import { Card, Text } from '../../components/ui';

/**
 * Os cards da fase 18 (08/10) no Hoje do celular — o Zak pediu o resumo "com tudo que já tá
 * e mais um pouco": ouvir o resumo inteiro (a fala segue ao trocar de aba e com o app
 * minimizado), treino da vez, nutrição com a dica que se renova num toque, a corrida, as
 * rotinas de hoje, uma ideia para o dia e o card ELYSIUM (versões, o que veio, o que testar).
 *
 * Tudo opcional: PC anterior à 2.2 não manda esses campos e os cards simplesmente não aparecem.
 */

const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "Ouvir o resumo": o mesmo texto que a Ely fala no PC, com a fala global do app. */
export function OuvirResumo({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const fala = useFala();
  const [meu, setMeu] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const falando = meu && fala.falando;
  async function ouvir() {
    haptica.leve();
    if (falando) { pararDeFalar(); return; }
    setBuscando(true);
    try {
      const { texto } = await callRpc(pairing, 'resumo.dia', {}, { timeoutMs: 20000 });
      setBuscando(false);
      setMeu(true);
      await falar(texto, pairing);
    } catch (e) {
      Alert.alert('Resumo', errMessage(e));
    } finally {
      setBuscando(false);
      setMeu(false);
    }
  }
  return (
    <Pressable
      onPress={ouvir}
      accessibilityRole="button"
      accessibilityLabel={falando ? 'Parar o resumo' : 'Ouvir o resumo do dia'}
      style={({ pressed }) => [styles.ouvir, { borderColor: palette.primary, backgroundColor: palette.primarySoft, borderRadius: tokens.radii.lg, opacity: pressed ? 0.8 : 1 }]}
    >
      {buscando ? <ActivityIndicator color={palette.primary} size="small" /> : <Feather name={falando ? 'square' : 'volume-2'} size={18} color={palette.primary} />}
      <View style={{ flex: 1 }}>
        <Text variant="label" color={palette.primary}>{falando ? 'Parar o resumo' : buscando ? 'Preparando o resumo…' : 'Ouvir o resumo do dia'}</Text>
        <Text variant="caption" color={palette.textMuted}>{falando ? 'Pode trocar de aba ou minimizar — ela continua.' : 'Clima, tarefas, rotinas, treino, dica, novidades e uma ideia.'}</Text>
      </View>
    </Pressable>
  );
}

export function CardTreino({ corpo, pairing, aoAbrir, aoMudar }: { corpo: PainelCorpo; pairing: Pairing; aoAbrir: () => void; aoMudar: (c: PainelCorpo) => void }) {
  const { palette, tokens } = useTheme();
  const [ocupado, setOcupado] = useState(false);
  const th = corpo.treinoHoje;
  async function concluir() {
    if (!th) return;
    haptica.medio();
    setOcupado(true);
    try {
      const r = await callRpc(pairing, 'treinos.marcar', { feito: !th.feitoHoje });
      if (!th.feitoHoje) haptica.sucesso();
      aoMudar(r.painel);
    } catch (e) { Alert.alert('Treino', errMessage(e)); }
    finally { setOcupado(false); }
  }
  if (!th) {
    return (
      <Card glass style={{ gap: 8 }}>
        <Text variant="caption" color={palette.textMuted}>Nenhum treino cadastrado ainda.</Text>
        <Pressable onPress={aoAbrir} style={[styles.botao, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}><Text variant="label" color={palette.primary}>Cadastrar treinos</Text></Pressable>
      </Card>
    );
  }
  return (
    <Card glass style={{ gap: 10 }}>
      <Pressable onPress={aoAbrir} accessibilityRole="button" accessibilityLabel={`Abrir ${th.treino.nome}`} style={{ gap: 6 }}>
        <View style={styles.linha}>
          <View style={{ flex: 1 }}>
            <Text variant="subheading" color={th.feitoHoje ? palette.primary : palette.text}>{th.treino.nome}{th.feitoHoje ? ' ✓' : ''}</Text>
            <Text variant="caption" color={palette.textMuted}>{th.feitoHoje ? 'Feito hoje' : 'O da vez'}{th.proximo ? ` · depois: ${th.proximo}` : ''} · {corpo.treinosNoMes} no mês</Text>
          </View>
          <Feather name="chevron-right" size={18} color={palette.textMuted} />
        </View>
        <Text variant="caption" color={palette.text} numberOfLines={2}>{th.treino.exercicios.map(e => e.nome).join(' · ')}</Text>
      </Pressable>
      <Pressable
        onPress={concluir}
        disabled={ocupado}
        accessibilityRole="button"
        style={[styles.botao, { backgroundColor: th.feitoHoje ? 'transparent' : palette.primary, borderWidth: th.feitoHoje ? 1 : 0, borderColor: palette.border, borderRadius: tokens.radii.md, opacity: ocupado ? 0.6 : 1 }]}
      >
        <Feather name={th.feitoHoje ? 'rotate-ccw' : 'check'} size={16} color={th.feitoHoje ? palette.textMuted : palette.background} />
        <Text variant="label" color={th.feitoHoje ? palette.textMuted : palette.background}>{th.feitoHoje ? 'Desmarcar' : 'Concluir treino'}</Text>
      </Pressable>
    </Card>
  );
}

export function CardNutricao({ corpo, dica: dicaInicial, pairing, aoAbrir }: { corpo: PainelCorpo; dica: { texto: string } | null; pairing: Pairing; aoAbrir: () => void }) {
  const { palette, tokens } = useTheme();
  const [dica, setDica] = useState(dicaInicial?.texto ?? null);
  const [trocando, setTrocando] = useState(false);
  // Dica nova do painel (outra hora) substitui a local.
  const [vista, setVista] = useState(dicaInicial?.texto);
  if (dicaInicial?.texto !== vista) { setVista(dicaInicial?.texto); setDica(dicaInicial?.texto ?? null); }
  async function outra() {
    haptica.leve();
    setTrocando(true);
    try { setDica((await callRpc(pairing, 'corpo.dica', { nova: true }, { timeoutMs: 15000 })).dica.texto); }
    catch (e) { Alert.alert('Dica', errMessage(e)); }
    finally { setTrocando(false); }
  }
  const m = corpo.meta;
  return (
    <Card glass style={{ gap: 10 }}>
      {m ? (
        <Pressable onPress={aoAbrir} accessibilityRole="button" accessibilityLabel={`Meta de ${m.kcal} calorias. Abrir`} style={{ gap: 4 }}>
          <View style={[styles.linha, { alignItems: 'baseline' }]}>
            <Text variant="heading" color={palette.primary}>{m.kcal}</Text>
            <Text variant="caption" color={palette.textMuted}>kcal hoje{m.corrida ? ` (com ${m.corrida} da corrida)` : ''}</Text>
          </View>
          <Text variant="caption" color={palette.text}>{m.proteinaG} g proteína · {m.carboG} g carbo · {m.gorduraG} g gordura</Text>
        </Pressable>
      ) : (
        <Pressable onPress={aoAbrir} style={{ gap: 4 }}>
          <Text variant="caption" color={palette.textMuted}>Para a meta faltam: {corpo.faltaPerfil.join(', ')}.</Text>
          <Text variant="label" color={palette.primary}>Completar o perfil</Text>
        </Pressable>
      )}
      {corpo.sugestao ? <Text variant="caption" color={palette.accent}>{corpo.sugestao}</Text> : null}
      {dica ? (
        <Pressable
          onPress={outra}
          disabled={trocando}
          accessibilityRole="button"
          accessibilityLabel={`Dica: ${dica}. Toque para outra`}
          style={[styles.dica, { borderColor: palette.primary, backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}
        >
          <Feather name="zap" size={15} color={palette.primary} style={{ marginTop: 2 }} />
          {/* A troca é uma animação: a dica velha some, a nova entra — o toque "gera" algo. */}
          <Animated.View key={dica} entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} style={{ flex: 1, opacity: trocando ? 0.35 : 1 }}>
            <Text variant="caption" color={palette.text}>{dica}</Text>
          </Animated.View>
        </Pressable>
      ) : null}
      <Text variant="caption" color={palette.textMuted} style={{ fontSize: 10 }}>Orientação geral — não substitui nutricionista.</Text>
    </Card>
  );
}

export function CardCorrida({ corpo, aoAbrir }: { corpo: PainelCorpo; aoAbrir: () => void }) {
  const { palette } = useTheme();
  const c = corpo.corrida;
  return (
    <Card glass style={{ gap: 4 }}>
      <Pressable onPress={aoAbrir} accessibilityRole="button" accessibilityLabel="Abrir a corrida" style={{ gap: 4 }}>
        <View style={styles.linha}>
          <Text variant="label" color={palette.accent} style={{ flex: 1, letterSpacing: 1.2 }}>{c.concluido ? 'PLANO CONCLUÍDO' : `SEMANA ${c.semana} · SESSÃO ${c.sessao}/3`}</Text>
          {c.feitaHoje && <Text variant="caption" color={palette.primary}>✓ hoje</Text>}
        </View>
        <Text variant="body">{c.texto}</Text>
        <Text variant="caption" color={palette.textMuted}>~{c.minutos} min · toque para anotar</Text>
      </Pressable>
    </Card>
  );
}

export function CardRotinasHoje({ painel }: { painel: PainelHoje }) {
  const { palette } = useTheme();
  const prox = painel.rotinasHoje ?? [];
  const foram = painel.rotinasRodaram ?? [];
  return (
    <Card glass style={{ gap: 8 }}>
      {!prox.length && !foram.length && <Text variant="caption" color={palette.textMuted}>Nenhuma rotina hoje.</Text>}
      {prox.map(r => (
        <View key={`p-${r.id}`} style={styles.linha}>
          <Text variant="label" color={palette.primary} style={{ minWidth: 44, fontVariant: ['tabular-nums'] }}>{hora(r.em)}</Text>
          <Feather name="zap" size={14} color={palette.textMuted} />
          <Text variant="body" style={{ flex: 1 }}>{r.nome}</Text>
        </View>
      ))}
      {foram.map((r, i) => (
        <View key={`f-${r.id}-${i}`} style={styles.linha}>
          <Text variant="label" color={palette.textMuted} style={{ minWidth: 44, fontVariant: ['tabular-nums'] }}>{hora(r.em)}</Text>
          <Feather name={r.ok ? 'check-circle' : 'alert-triangle'} size={14} color={r.ok ? palette.primary : palette.error} />
          <Text variant="body" color={palette.textMuted} style={{ flex: 1 }} numberOfLines={1}>{r.nome} · {r.resultado}</Text>
        </View>
      ))}
    </Card>
  );
}

export function CardIdeia({ ideia: inicial, pairing }: { ideia: string; pairing: Pairing }) {
  const { palette } = useTheme();
  const [ideia, setIdeia] = useState(inicial);
  const [trocando, setTrocando] = useState(false);
  const [vista, setVista] = useState(inicial);
  if (inicial !== vista) { setVista(inicial); setIdeia(inicial); }
  async function outra() {
    haptica.leve();
    setTrocando(true);
    try { setIdeia((await callRpc(pairing, 'hoje.ideia', {}, { timeoutMs: 25000 })).ideia); }
    catch (e) { Alert.alert('Ideia', errMessage(e)); }
    finally { setTrocando(false); }
  }
  return (
    <Card glass style={{ gap: 8 }}>
      <Animated.View key={ideia} entering={FadeIn.duration(260)} style={{ opacity: trocando ? 0.35 : 1 }}>
        <Text variant="body">{ideia}</Text>
      </Animated.View>
      <Pressable onPress={outra} disabled={trocando} hitSlop={10} accessibilityRole="button" style={[styles.linha, { alignSelf: 'flex-start', minHeight: 36 }]}>
        {trocando ? <ActivityIndicator size="small" color={palette.primary} /> : <Feather name="refresh-cw" size={14} color={palette.primary} />}
        <Text variant="label" color={palette.primary}>Outra ideia</Text>
      </Pressable>
    </Card>
  );
}

export function CardElysium({ e, pairing }: { e: NonNullable<PainelHoje['elysium']>; pairing: Pairing }) {
  const { palette } = useTheme();
  const [itens, setItens] = useState(e.paraTestar);
  const [vista, setVista] = useState(e);
  if (e !== vista) { setVista(e); setItens(e.paraTestar); }
  async function marcar(item: string, feito: boolean) {
    haptica.leve();
    setItens(l => l.map(x => (x.item === item ? { ...x, feito } : x)));
    try {
      const r = await callRpc(pairing, 'hoje.testar', { item, feito });
      setItens(l => l.map(x => ({ ...x, feito: r.feitos.includes(x.item) })));
    } catch (err) {
      setItens(l => l.map(x => (x.item === item ? { ...x, feito: !feito } : x)));
      Alert.alert('Não deu para marcar', errMessage(err));
    }
  }
  const ota = Updates.updateId && Updates.createdAt ? ` · atualizado ${Updates.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : '';
  return (
    <Card glass style={{ gap: 8 }}>
      <Text variant="caption" color={palette.textMuted}>PC v{e.versao} · celular v{Application.nativeApplicationVersion ?? '?'}{ota}</Text>
      {e.atualizacaoPronta && <Text variant="caption" color={palette.accent}>A versão {e.atualizacaoPronta} do PC está pronta para instalar.</Text>}
      {e.novidades.length > 0 && (
        <>
          <Text variant="label" color={palette.accent} style={{ letterSpacing: 1.2 }}>O QUE VEIO</Text>
          {e.novidades.slice(0, 5).map((n, i) => <Text key={i} variant="caption" color={palette.text}>• {n}</Text>)}
        </>
      )}
      {itens.length > 0 && (
        <>
          <Text variant="label" color={palette.accent} style={{ letterSpacing: 1.2, marginTop: 4 }}>PARA TESTAR {itens.filter(x => x.feito).length}/{itens.length}</Text>
          {itens.map(t => (
            <Pressable key={t.item} onPress={() => marcar(t.item, !t.feito)} accessibilityRole="checkbox" accessibilityState={{ checked: t.feito }} style={[styles.linha, { minHeight: 40 }]}>
              <View style={[styles.checkMini, { borderColor: palette.primary, backgroundColor: t.feito ? palette.primary : 'transparent' }]}>
                {t.feito && <Feather name="check" size={12} color={palette.background} />}
              </View>
              <Text variant="caption" color={t.feito ? palette.textMuted : palette.text} style={[{ flex: 1 }, t.feito && { textDecorationLine: 'line-through' }]}>{t.item}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ouvir: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, minHeight: 56 },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14 },
  dica: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1, borderStyle: 'dashed' },
  checkMini: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
