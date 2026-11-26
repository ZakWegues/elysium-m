import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, ToastAndroid, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { haptica } from '../../lib/haptica';
import { callRpc } from '../../lib/rpc';
import type { Pairing } from '../../lib/pairing';
import { ACOES, coresDosGrupos, executarAtalho, ICONES, POR_PAGINA, teclaQueCabe, type Atalho, type SomMesa, type TipoAtalho } from '../../lib/mesa';

const TIPOS: { tipo: TipoAtalho; rotulo: string; dica: string }[] = [
  { tipo: 'acao', rotulo: 'Ação', dica: '' },
  { tipo: 'app', rotulo: 'Programa', dica: 'O nome do programa, como no "abre o…" (chrome, discord, steam)' },
  { tipo: 'teclas', rotulo: 'Teclas', dica: 'Com +, como ctrl+shift+esc ou alt+tab' },
  { tipo: 'link', rotulo: 'Link', dica: 'https://…' },
];

/** A última lista vista: girar o celular (o layout troca de árvore) ou reabrir o modo não pisca. */
let ultimaLista: Atalho[] | null = null;
/** Ações cujo aviso diz algo (o nome do print, área de transferência vazia); as outras só ganham o ✓. */
const COM_AVISO = new Set(['print', 'copiar', 'colar']);

/**
 * Os atalhos do Modo Mesa, tipo Stream Deck: páginas de 4 × 4 que enchem o espaço (nada pela metade),
 * uma fileira por grupo (sistema, copiar e colar, programas, funções) com a cor do grupo no ícone.
 * Toque faz; segurar edita; o "+" das abas cria. Guardados no PC (mesa.atalhos): valem para
 * qualquer celular pareado. Mais de 16, desliza para a próxima página.
 */
export function GradeAtalhos({ pairing, som, acento, pedirNovo, aoAbrirJanelas, aoErro }: {
  pairing: Pairing; som: SomMesa | null; acento: string;
  /** Muda (+1) quando o "+" das abas é tocado. */
  pedirNovo: number;
  aoAbrirJanelas: () => void; aoErro: (e: unknown) => void;
}) {
  const { palette, tokens } = useTheme();
  const [lista, setListaCrua] = useState<Atalho[] | null>(ultimaLista);
  const setLista = (l: Atalho[] | null) => { ultimaLista = l; setListaCrua(l); };
  const [fazendo, setFazendo] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [editando, setEditando] = useState<Atalho | 'novo' | null>(null);
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  const [pagina, setPagina] = useState(0);
  const cores = coresDosGrupos(acento, palette.accent);

  useEffect(() => {
    callRpc(pairing, 'mesa.atalhos', {}, { timeoutMs: 8000 }).then((r) => setLista(r.atalhos)).catch(() => { if (!ultimaLista) setLista([]); });
  }, [pairing]);
  useEffect(() => { if (pedirNovo > 0 && lista && lista.length < 24) setEditando('novo'); }, [pedirNovo]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Feito: um ✓ na própria tecla; aviso embaixo só quando ele diz alguma coisa.
      setFeito(a.id);
      setTimeout(() => setFeito((f) => (f === a.id ? null : f)), 900);
      if (a.tipo === 'acao' && COM_AVISO.has(a.valor)) ToastAndroid.show(frase, ToastAndroid.SHORT);
    } catch (e) { aoErro(e); } finally { setFazendo(null); }
  }

  const gap = 8;
  const paginas = lista ? Math.max(1, Math.ceil(lista.length / POR_PAGINA)) : 1;
  const pontos = paginas > 1 ? 14 : 0;
  const { lado, alto } = teclaQueCabe(caixa.w, Math.max(0, caixa.h - pontos), gap);
  const tecla = (a: Atalho, i: number) => {
    const ativo = a.tipo === 'acao' && a.valor === 'microfone' && som?.micMudo === true;
    const cor = cores[Math.floor((i % POR_PAGINA) / 4)];
    return (
      <Animated.View key={a.id} entering={FadeInDown.delay((i % POR_PAGINA) * 20).duration(200)} style={{ width: lado, height: alto }}>
        <Pressable onPress={() => tocar(a)} onLongPress={() => { void haptica.medio(); setEditando(a); }} delayLongPress={380}
          accessibilityRole="button" accessibilityLabel={a.rotulo} accessibilityHint="Segure para editar"
          style={({ pressed }) => [styles.tecla, {
            flex: 1, borderRadius: tokens.radii.md, gap: alto < 64 ? 3 : 6,
            backgroundColor: ativo ? palette.errorSoft : feito === a.id ? `${cor}2e` : pressed ? palette.primarySoft : 'rgba(255,255,255,0.06)',
            borderColor: ativo ? palette.error : feito === a.id ? `${cor}88` : 'rgba(255,255,255,0.08)', transform: [{ scale: pressed ? 0.95 : 1 }],
          }]}>
          {fazendo === a.id
            ? <ActivityIndicator color={cor} />
            : feito === a.id
            ? <Animated.View entering={ZoomIn.springify().damping(14)}><Feather name="check" size={alto < 64 ? 19 : 22} color={cor} /></Animated.View>
            : <Feather name={(ativo ? 'mic-off' : a.icone) as keyof typeof Feather.glyphMap} size={alto < 64 ? 19 : 22} color={ativo ? palette.error : cor} />}
          <Text variant="caption" numberOfLines={alto < 64 ? 1 : 2} color={palette.text} style={[styles.rotulo, alto < 64 && { fontSize: 11, lineHeight: 13 }]}>{a.rotulo}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; setCaixa((c) => (c.w === w && c.h === h ? c : { w, h })); }}>
      {lista === null ? <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} /> : null}
      {lado > 0 && lista ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={paginas > 1}
          onMomentumScrollEnd={(e) => setPagina(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, caixa.w)))}>
          {Array.from({ length: paginas }, (_, p) => (
            <View key={p} style={[styles.grade, { width: caixa.w, gap }]}>
              {lista.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA).map((a, k) => tecla(a, p * POR_PAGINA + k))}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {paginas > 1 ? (
        <View style={styles.pontos}>
          {Array.from({ length: paginas }, (_, p) => <View key={p} style={[styles.ponto, { backgroundColor: p === pagina ? palette.text : 'rgba(255,255,255,0.25)' }]} />)}
        </View>
      ) : null}
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
  grade: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 6, height: 14, alignItems: 'flex-end' },
  ponto: { width: 6, height: 6, borderRadius: 3 },
  tecla: { alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6 },
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

