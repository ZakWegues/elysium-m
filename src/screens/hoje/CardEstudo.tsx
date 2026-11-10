import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { Pairing } from '../../lib/pairing';
import { callRpc, type Cartao, type ItemDespejo } from '../../lib/rpc';
import { acaoPomodoro, restaDoPomodoro, sincronizarPomodoro, usePomodoro } from '../../lib/pomodoro';
import { errMessage } from '../../lib/errors';
import { haptica } from '../../lib/haptica';
import { confirmDestructive } from '../../lib/confirm';
import { useAoReativar } from '../../components/AbaViva';
import { useTheme } from '../../theme';
import { Button, Card, Text, VidroSwitch } from '../../components/ui';

/**
 * Estudo no Hoje (fase 20): o pomodoro do PC com o relógio, os cartões de revisão do dia
 * (toque vira o cartão; "acertei"/"errei") e o plano de estudo para a prova. Tudo mora no PC.
 */

const NOME_FASE = { foco: 'Foco', pausa: 'Pausa', longa: 'Pausa longa' } as const;

function relogio(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * As gavetas (revisão e plano) moram na raiz do Hoje: o `GlassModal` é uma camada absoluta
 * DENTRO do pai, e dentro do card (overflow hidden) ela ficava cortada no tamanho do card.
 * `versao` muda quando uma delas fecha — o card relê os cartões.
 */
export function CardEstudo({ pairing, aoRevisar, aoPlanejar, versao = 0 }: { pairing: Pairing; aoRevisar: (fila: Cartao[]) => void; aoPlanejar: () => void; versao?: number }) {
  const { palette, tokens } = useTheme();
  const { estado, diferenca } = usePomodoro();
  const [, tique] = useState(0);
  const [cartoes, setCartoes] = useState<{ cartoes: Cartao[]; vencidos: string[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    void sincronizarPomodoro(pairing);
    callRpc(pairing, 'cartoes.list').then(setCartoes).catch(() => setCartoes(null));
  }, [pairing]);
  useEffect(() => { carregar(); }, [carregar, versao]);
  useAoReativar(carregar);
  // O relógio só anda com o pomodoro ligado. No Hoje o WebSocket pode estar fechado (só a
  // Início e o PC abrem a telemetria): chegando a zero, pergunta ao PC em que fase está —
  // senão o card parava em 0:00 e "Pular" pulava a fase seguinte, que ele queria.
  useEffect(() => {
    if (!estado?.ativo) return;
    let ultimaConsulta = 0;
    const t = setInterval(() => {
      tique(n => n + 1);
      const agora = Date.now();
      if (restaDoPomodoro(estado, diferenca, agora) <= 0 && agora - ultimaConsulta > 3000) {
        ultimaConsulta = agora;
        void sincronizarPomodoro(pairing);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [estado, diferenca, pairing]);

  async function pomo(op: 'start' | 'stop' | 'skip', params: Record<string, unknown> = {}) {
    // Relógio zerado: a fase na tela pode já ter passado no PC — pular agora pularia a errada.
    if (op === 'skip' && estado?.ativo && restaDoPomodoro(estado, diferenca) <= 0) { void sincronizarPomodoro(pairing); return; }
    setOcupado(true);
    try { await acaoPomodoro(pairing, op, params); haptica.leve(); }
    catch (e) { Alert.alert('Pomodoro', errMessage(e)); }
    finally { setOcupado(false); }
  }

  const venc = cartoes?.vencidos.length ?? 0;
  const botao = (rotulo: string, icone: keyof typeof Feather.glyphMap, onPress: () => void, principal = false) => (
    <Pressable key={rotulo} onPress={onPress} disabled={ocupado} accessibilityRole="button" accessibilityLabel={rotulo}
      style={[styles.botao, { borderColor: principal ? palette.primary : palette.border, backgroundColor: principal ? palette.primarySoft : 'transparent', borderRadius: tokens.radii.full }]}>
      <Feather name={icone} size={14} color={palette.primary} />
      <Text variant="caption" color={palette.text}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <Card glass style={{ gap: tokens.spacing.md }}>
      {estado?.ativo ? (
        <View style={{ gap: 8 }}>
          <View style={styles.linha}>
            <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>{NOME_FASE[estado.fase].toUpperCase()} · CICLO {estado.ciclo} DE {estado.de}</Text>
            <Text variant="heading" color={estado.fase === 'foco' ? palette.primary : palette.accent} style={{ fontVariant: ['tabular-nums'] }}>
              {relogio(restaDoPomodoro(estado, diferenca))}
            </Text>
          </View>
          <View style={styles.botoes}>
            {botao(estado.fase === 'foco' ? 'Pular para a pausa' : 'Pular a pausa', 'skip-forward', () => pomo('skip'))}
            {botao('Parar', 'x', () => pomo('stop'))}
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text variant="caption" color={palette.textMuted}>Pomodoro no PC: blocos de foco com pausa; o modo foco liga sozinho e a Ely avisa a troca.</Text>
          <View style={styles.botoes}>
            {botao('25 + 5', 'clock', () => pomo('start', { foco: 25, pausa: 5 }), true)}
            {botao('50 + 10', 'clock', () => pomo('start', { foco: 50, pausa: 10 }))}
          </View>
        </View>
      )}
      <View style={[styles.separador, { backgroundColor: palette.border }]} />
      <View style={styles.linha}>
        <Feather name="layers" size={15} color={palette.primary} />
        <Text variant="body" style={{ flex: 1 }}>
          {cartoes === null ? 'Cartões de revisão' : venc ? `${venc} ${venc === 1 ? 'cartão' : 'cartões'} para revisar hoje` : cartoes.cartoes.length ? 'Nenhum cartão para hoje' : 'Sem cartões ainda'}
        </Text>
      </View>
      <View style={styles.botoes}>
        {venc > 0 && cartoes && botao('Revisar', 'play', () => aoRevisar(cartoes.cartoes.filter(c => cartoes.vencidos.includes(c.id))), true)}
        {botao('Plano de estudo', 'calendar', aoPlanejar)}
      </View>
    </Card>
  );
}

export function Revisao({ pairing, fila: inicial, aoFechar }: { pairing: Pairing; fila: Cartao[]; aoFechar: () => void }) {
  const { palette, tokens } = useTheme();
  const [fila, setFila] = useState(inicial);
  const [i, setI] = useState(0);
  const [virado, setVirado] = useState(false);
  const [certos, setCertos] = useState(0);
  // Dois toques rápidos respondiam o mesmo cartão duas vezes e pulavam o seguinte.
  const [respondendo, setRespondendo] = useState(false);
  const c = fila[i];

  async function responder(acertou: boolean) {
    if (respondendo) return;
    setRespondendo(true);
    try {
      await callRpc(pairing, 'cartoes.responder', { id: c.id, acertou });
      if (acertou) { setCertos(n => n + 1); haptica.sucesso(); } else haptica.leve();
      setI(n => n + 1); setVirado(false);
    } catch (e) { Alert.alert('Revisão', errMessage(e)); }
    finally { setRespondendo(false); }
  }
  async function apagar() {
    if ((await confirmDestructive('Apagar este cartão?', c.frente)) !== 'confirmed') return;
    try {
      await callRpc(pairing, 'cartoes.delete', { id: c.id }, { confirmed: true });
      setFila(f => f.filter(x => x.id !== c.id)); setVirado(false);
    } catch (e) { Alert.alert('Revisão', errMessage(e)); }
  }

  if (!c) {
    return (
      <View style={{ gap: tokens.spacing.md, alignItems: 'center' }}>
        <Text variant="heading">{certos} de {fila.length}</Text>
        <Text variant="caption" color={palette.textMuted}>Revisão feita. Os cartões voltam no dia certo.</Text>
        <Button title="Fechar" onPress={aoFechar} />
      </View>
    );
  }
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Text variant="caption" color={palette.textMuted}>CARTÃO {i + 1} DE {fila.length} · CAIXA {c.caixa}</Text>
      <Pressable onPress={() => { if (!virado) { haptica.leve(); setVirado(true); } }} accessibilityRole="button" accessibilityLabel={virado ? `Resposta: ${c.verso}` : `${c.frente}. Toque para ver a resposta`}
        style={[styles.cartao, { borderColor: palette.border, backgroundColor: palette.primarySoft, borderRadius: tokens.radii.lg }]}>
        <Text variant="subheading" style={{ textAlign: 'center' }}>{c.frente}</Text>
        {virado
          ? <Text variant="body" color={palette.primary} style={{ textAlign: 'center' }}>{c.verso}</Text>
          : <Text variant="caption" color={palette.textMuted}>Toque para ver a resposta</Text>}
      </Pressable>
      {virado && (
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <View style={{ flex: 1 }}><Button title="Acertei" disabled={respondendo} onPress={() => responder(true)} /></View>
          <View style={{ flex: 1 }}><Button title="Errei" variant="secondary" disabled={respondendo} onPress={() => responder(false)} /></View>
        </View>
      )}
      <Pressable onPress={apagar} hitSlop={8} style={{ alignSelf: 'center' }} accessibilityRole="button" accessibilityLabel="Apagar este cartão">
        <Text variant="caption" color={palette.textMuted}>Apagar este cartão</Text>
      </Pressable>
    </View>
  );
}

/** A mesma prévia do despejo: a Ely monta, ele desmarca o que não quer, grava. */
export function PlanoDeEstudo({ pairing, aoTerminar }: { pairing: Pairing; aoTerminar: () => void }) {
  const { palette, tokens } = useTheme();
  const [materia, setMateria] = useState('');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('19:00');
  const [assuntos, setAssuntos] = useState('');
  const [montando, setMontando] = useState(false);
  const [plano, setPlano] = useState<{ itens: ItemDespejo[]; resumo: string } | null>(null);
  const [fora, setFora] = useState<Set<string>>(new Set());

  /** "20/10" → "2026-10-20" (o próximo 20/10). Vazio = a Ely procura nas tarefas. */
  function diaIso(): string | undefined | null {
    const t = dia.trim();
    if (!t) return undefined;
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
    if (!m) return null;
    const hoje = new Date();
    const d = new Date(hoje.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    // "15/13" virava 15 de janeiro do ano seguinte: o mês também tem que bater.
    if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
    if (d < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) d.setFullYear(d.getFullYear() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function montar() {
    const d = diaIso();
    if (d === null) { Alert.alert('Plano de estudo', 'Dia no formato 20/10.'); return; }
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { Alert.alert('Plano de estudo', 'Hora no formato 19:00.'); return; }
    setMontando(true);
    try {
      const r = await callRpc(pairing, 'estudo.planejar', {
        materia: materia.trim(), ...(d ? { dia: d } : {}), ...(hora ? { hora } : {}),
        assuntos: assuntos.split(',').map(s => s.trim()).filter(Boolean),
      }, { timeoutMs: 45_000 });
      setPlano(r); setFora(new Set());
    } catch (e) { Alert.alert('Plano de estudo', errMessage(e)); }
    finally { setMontando(false); }
  }
  async function salvar() {
    const escolhidos = (plano?.itens ?? []).filter(it => !fora.has(it.id));
    if (!escolhidos.length) return;
    try {
      const r = await callRpc(pairing, 'despejo.aplicar', { itens: escolhidos });
      haptica.sucesso();
      Alert.alert('Plano de estudo', r.mensagem);
      aoTerminar();
    } catch (e) { Alert.alert('Plano de estudo', errMessage(e)); }
  }

  const campo = { color: palette.text, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: tokens.radii.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 };
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <TextInput value={materia} onChangeText={setMateria} placeholder="Matéria da prova (ex.: física)" placeholderTextColor={palette.textMuted} maxLength={60} style={campo} />
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <TextInput value={dia} onChangeText={setDia} placeholder="Dia (20/10)" placeholderTextColor={palette.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} style={[campo, { flex: 1 }]} />
        <TextInput value={hora} onChangeText={setHora} placeholder="19:00" placeholderTextColor={palette.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} style={[campo, { width: 90 }]} />
      </View>
      <Text variant="caption" color={palette.textMuted}>Sem o dia, a Ely procura a prova nas suas tarefas.</Text>
      <TextInput value={assuntos} onChangeText={setAssuntos} placeholder="Assuntos, separados por vírgula (opcional)" placeholderTextColor={palette.textMuted} maxLength={400} style={campo} />
      <Button title={montando ? 'Montando…' : 'Montar'} disabled={montando || materia.trim().length < 2} onPress={montar} />
      {montando && <ActivityIndicator color={palette.primary} />}
      {plano && (
        <View style={{ gap: 6, marginTop: tokens.spacing.sm }}>
          <Text variant="caption" color={palette.textMuted}>{plano.resumo}</Text>
          {plano.itens.map(it => (
            <View key={it.id} style={styles.linha}>
              <VidroSwitch value={!fora.has(it.id)} onValueChange={(v) => setFora(f => { const n = new Set(f); if (v) n.delete(it.id); else n.add(it.id); return n; })} accessibilityLabel={it.texto} />
              <View style={{ flex: 1 }}>
                <Text variant="body">{it.texto}</Text>
                {it.rotulo ? <Text variant="caption" color={palette.textMuted}>{it.rotulo}</Text> : null}
              </View>
            </View>
          ))}
          {plano.itens.length > 0 && <Button title="Salvar as sessões marcadas" onPress={salvar} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, minHeight: 36 },
  separador: { height: StyleSheet.hairlineWidth },
  cartao: { padding: 22, gap: 14, alignItems: 'center', justifyContent: 'center', minHeight: 140, borderWidth: 1 },
});
