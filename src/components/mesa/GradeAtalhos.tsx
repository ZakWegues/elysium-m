import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, ToastAndroid, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { haptica } from '../../lib/haptica';
import { callRpc } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { ACOES, executarAtalho, ICONES, type Atalho, type SomMesa, type TipoAtalho } from '../../lib/mesa';

const TIPOS: { tipo: TipoAtalho; rotulo: string; dica: string }[] = [
  { tipo: 'acao', rotulo: 'Ação', dica: '' },
  { tipo: 'app', rotulo: 'Programa', dica: 'O nome do programa, como no "abre o…" (chrome, discord, steam)' },
  { tipo: 'teclas', rotulo: 'Teclas', dica: 'Com +, como ctrl+shift+esc ou alt+tab' },
  { tipo: 'link', rotulo: 'Link', dica: 'https://…' },
];

/**
 * Os atalhos do Modo Mesa, tipo Stream Deck. Toque faz; segurar edita; o "+" cria. Guardados no PC
 * (mesa.atalhos), então valem para qualquer celular pareado.
 */
export function GradeAtalhos({ pairing, colunas, som, acento, aoAbrirJanelas, aoErro }: {
  pairing: Pairing; colunas: number; som: SomMesa | null; acento: string;
  aoAbrirJanelas: () => void; aoErro: (e: unknown) => void;
}) {
  const { palette, tokens } = useTheme();
  const [lista, setLista] = useState<Atalho[] | null>(null);
  const [fazendo, setFazendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<Atalho | 'novo' | null>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    callRpc(pairing, 'mesa.atalhos', {}, { timeoutMs: 8000 }).then((r) => setLista(r.atalhos)).catch(() => setLista([]));
  }, [pairing]);

  async function salvar(nova: Atalho[]) {
    setLista(nova);
    try { setLista((await callRpc(pairing, 'mesa.atalhos.salvar', { atalhos: nova })).atalhos); } catch (e) { aoErro(e); }
  }

  async function tocar(a: Atalho) {
    if (a.tipo === 'acao' && a.valor === 'janelas') { void haptica.leve(); aoAbrirJanelas(); return; }
    void haptica.medio();
    setFazendo(a.id);
    try {
      const frase = await executarAtalho(pairing, a, som);
      void haptica.sucesso();
      ToastAndroid.show(frase, ToastAndroid.SHORT);
    } catch (e) { aoErro(e); } finally { setFazendo(null); }
  }

  const gap = 10;
  const lado = largura ? Math.floor((largura - gap * (colunas - 1)) / colunas) : 0;
  return (
    <View onLayout={(e) => setLargura(e.nativeEvent.layout.width)} style={[styles.grade, { gap }]}>
      {lista === null ? <ActivityIndicator color={palette.primary} /> : null}
      {lado > 0 && lista?.map((a, i) => {
        const ativo = a.tipo === 'acao' && a.valor === 'microfone' && som?.micMudo === true;
        return (
          <Animated.View key={a.id} entering={FadeInDown.delay(i * 25).duration(220)} layout={LinearTransition.duration(220)} style={{ width: lado }}>
            <Pressable onPress={() => tocar(a)} onLongPress={() => { void haptica.medio(); setEditando(a); }} delayLongPress={380}
              accessibilityRole="button" accessibilityLabel={a.rotulo} accessibilityHint="Segure para editar"
              style={({ pressed }) => [styles.tecla, {
                height: Math.min(96, lado * 0.92), borderRadius: tokens.radii.md,
                backgroundColor: ativo ? palette.errorSoft : pressed ? palette.primarySoft : 'rgba(255,255,255,0.06)',
                borderColor: ativo ? palette.error : 'rgba(255,255,255,0.08)', transform: [{ scale: pressed ? 0.95 : 1 }],
              }]}>
              {fazendo === a.id
                ? <ActivityIndicator color={acento} />
                : <Feather name={(ativo ? 'mic-off' : a.icone) as keyof typeof Feather.glyphMap} size={22} color={ativo ? palette.error : acento} />}
              <Text variant="caption" numberOfLines={2} color={palette.text} style={styles.rotulo}>{a.rotulo}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
      {lado > 0 && lista !== null && lista.length < 24 && (
        <Pressable onPress={() => { void haptica.leve(); setEditando('novo'); }} accessibilityRole="button" accessibilityLabel="Novo atalho"
          style={[styles.tecla, styles.mais, { width: lado, height: Math.min(96, lado * 0.92), borderRadius: tokens.radii.md, borderColor: 'rgba(255,255,255,0.16)' }]}>
          <Feather name="plus" size={22} color={palette.textMuted} />
          <Text variant="caption" color={palette.textMuted}>Novo</Text>
        </Pressable>
      )}
      {editando && lista && (
        <EditorDeAtalho pairing={pairing} atalho={editando === 'novo' ? null : editando} posicao={editando === 'novo' ? -1 : lista.findIndex((x) => x.id === editando.id)} total={lista.length}
          aoFechar={() => setEditando(null)}
          aoSalvar={(a) => { setEditando(null); void salvar(editando === 'novo' ? [...lista, a] : lista.map((x) => (x.id === a.id ? a : x))); }}
          aoApagar={() => { const id = (editando as Atalho).id; setEditando(null); void salvar(lista.filter((x) => x.id !== id)); }}
          aoMover={(d) => {
            const i = lista.findIndex((x) => x.id === (editando as Atalho).id);
            const j = i + d;
            if (i < 0 || j < 0 || j >= lista.length) return;
            const nova = lista.slice();
            [nova[i], nova[j]] = [nova[j], nova[i]];
            void haptica.tique();
            void salvar(nova);
          }} />
      )}
    </View>
  );
}

function EditorDeAtalho({ pairing, atalho, posicao, total, aoFechar, aoSalvar, aoApagar, aoMover }: {
  pairing: Pairing; atalho: Atalho | null; posicao: number; total: number;
  aoFechar: () => void; aoSalvar: (a: Atalho) => void; aoApagar: () => void; aoMover: (d: -1 | 1) => void;
}) {
  const { palette, tokens } = useTheme();
  const [tipo, setTipo] = useState<TipoAtalho>(atalho?.tipo ?? 'acao');
  const [rotulo, setRotulo] = useState(atalho?.rotulo ?? '');
  const [valor, setValor] = useState(atalho?.valor ?? '');
  const [icone, setIcone] = useState(atalho?.icone ?? 'zap');
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => {
    if (tipo !== 'app' || apps.length) return;
    callRpc(pairing, 'apps.list', {}, { timeoutMs: 8000 }).then((r) => setApps(r.apps.map((a) => a.key).slice(0, 30))).catch(() => {});
  }, [tipo, apps.length, pairing]);
  const pronto = rotulo.trim() && valor.trim() && (tipo !== 'link' || /^https?:\/\/\S+$/i.test(valor.trim()));
  const campo = [styles.campo, { borderColor: palette.glassBorder, borderRadius: tokens.radii.md, color: palette.text }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
      <Pressable style={styles.veu} onPress={aoFechar} accessibilityLabel="Fechar">
        <Pressable onPress={() => {}} style={[styles.folha, { backgroundColor: palette.surfaceRaised, borderColor: palette.glassBorder, borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radii.lg }]}>
          <ScrollView contentContainerStyle={{ gap: 14, padding: 18 }} keyboardShouldPersistTaps="handled">
            <View style={styles.cabeca}>
              <Text variant="subheading">{atalho ? 'Editar atalho' : 'Novo atalho'}</Text>
              {atalho ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable disabled={posicao <= 0} onPress={() => aoMover(-1)} accessibilityLabel="Mover para trás" hitSlop={8} style={[styles.seta, { opacity: posicao <= 0 ? 0.3 : 1 }]}><Feather name="chevron-left" size={18} color={palette.text} /></Pressable>
                  <Pressable disabled={posicao >= total - 1} onPress={() => aoMover(1)} accessibilityLabel="Mover para a frente" hitSlop={8} style={[styles.seta, { opacity: posicao >= total - 1 ? 0.3 : 1 }]}><Feather name="chevron-right" size={18} color={palette.text} /></Pressable>
                </View>
              ) : null}
            </View>
            <View style={styles.chips}>
              {TIPOS.map((t) => (
                <Pressable key={t.tipo} onPress={() => { setTipo(t.tipo); setValor(''); }} accessibilityRole="button" accessibilityState={{ selected: tipo === t.tipo }}
                  style={[styles.chip, { borderRadius: tokens.radii.full, backgroundColor: tipo === t.tipo ? palette.primary : 'rgba(255,255,255,0.06)' }]}>
                  <Text variant="caption" color={tipo === t.tipo ? palette.onPrimary : palette.text}>{t.rotulo}</Text>
                </Pressable>
              ))}
            </View>
            {tipo === 'acao' ? (
              <View style={styles.chips}>
                {ACOES.map((a) => (
                  <Pressable key={a.valor} onPress={() => { setValor(a.valor); setIcone(a.icone); if (!rotulo || ACOES.some((x) => x.rotulo === rotulo)) setRotulo(a.rotulo); }}
                    style={[styles.chip, { borderRadius: tokens.radii.full, backgroundColor: valor === a.valor ? palette.primarySoft : 'rgba(255,255,255,0.06)' }]}>
                    <Feather name={a.icone as keyof typeof Feather.glyphMap} size={13} color={valor === a.valor ? palette.primary : palette.textMuted} />
                    <Text variant="caption">{a.rotulo}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <TextInput value={valor} onChangeText={setValor} placeholder={TIPOS.find((t) => t.tipo === tipo)?.dica} placeholderTextColor={palette.textMuted}
                  autoCapitalize="none" autoCorrect={false} keyboardType={tipo === 'link' ? 'url' : 'default'} style={campo} />
                {tipo === 'app' && apps.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {apps.map((n) => (
                      <Pressable key={n} onPress={() => { setValor(n); if (!rotulo) setRotulo(n.charAt(0).toUpperCase() + n.slice(1)); }} style={[styles.chip, { borderRadius: tokens.radii.full, backgroundColor: valor === n ? palette.primarySoft : 'rgba(255,255,255,0.06)' }]}>
                        <Text variant="caption">{n}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            )}
            <TextInput value={rotulo} onChangeText={setRotulo} placeholder="Nome no botão" placeholderTextColor={palette.textMuted} maxLength={24} style={campo} />
            <View style={styles.chips}>
              {ICONES.map((n) => (
                <Pressable key={n} onPress={() => setIcone(n)} accessibilityLabel={`Ícone ${n}`} accessibilityState={{ selected: icone === n }}
                  style={[styles.icone, { borderRadius: tokens.radii.sm, backgroundColor: icone === n ? palette.primarySoft : 'transparent' }]}>
                  <Feather name={n} size={18} color={icone === n ? palette.primary : palette.textMuted} />
                </Pressable>
              ))}
            </View>
            <View style={styles.acoes}>
              {atalho ? (
                <Pressable onPress={aoApagar} style={[styles.botao, { borderRadius: tokens.radii.md }]} accessibilityRole="button">
                  <Feather name="trash-2" size={16} color={palette.error} />
                  <Text variant="label" color={palette.error}>Apagar</Text>
                </Pressable>
              ) : <View />}
              <Pressable disabled={!pronto} accessibilityRole="button"
                onPress={() => aoSalvar({ id: atalho?.id ?? `m${Date.now().toString(36)}`, tipo, rotulo: rotulo.trim(), valor: valor.trim(), icone })}
                style={[styles.botao, { borderRadius: tokens.radii.md, backgroundColor: palette.primary, opacity: pronto ? 1 : 0.4 }]}>
                <Feather name="check" size={16} color={palette.onPrimary} />
                <Text variant="label" color={palette.onPrimary}>Salvar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap' },
  tecla: { alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6 },
  mais: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  rotulo: { textAlign: 'center' },
  veu: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 },
  folha: { maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' },
  cabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seta: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  icone: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  campo: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  acoes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11 },
});

