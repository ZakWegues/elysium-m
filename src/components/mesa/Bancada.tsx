import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, ToastAndroid, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { haptica } from '../../lib/haptica';
import { callRpc, type Janela } from '../../lib/rpc';
import { sendCommand } from '../../lib/api';
import type { Pairing } from '../../lib/pairing';
import { CanalInput } from '../../lib/inputCanal';
import { acelerar, SENSIBILIDADE_PADRAO } from '../../lib/trackpad';
import { guardarRecente, lerRecentes } from '../../lib/mesa';

export type AbaBancada = 'mouse' | 'teclado' | 'janelas';

/**
 * A parte de baixo do Modo Mesa: o mouse, o teclado e as janelas do PC, numa aba cada. O canal do
 * mouse abre no primeiro toque e fecha 30 s depois do último.
 */
export function Bancada({ pairing, aba, setAba, aoErro }: { pairing: Pairing; aba: AbaBancada; setAba: (a: AbaBancada) => void; aoErro: (e: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const abas: { id: AbaBancada; rotulo: string; icone: keyof typeof Feather.glyphMap }[] = [
    { id: 'mouse', rotulo: 'Mouse', icone: 'mouse-pointer' },
    { id: 'teclado', rotulo: 'Teclado', icone: 'type' },
    { id: 'janelas', rotulo: 'Janelas', icone: 'layers' },
  ];
  return (
    <View style={{ gap: 10, flex: 1 }}>
      <View style={[styles.abas, { borderRadius: tokens.radii.full, backgroundColor: 'rgba(255,255,255,0.05)' }]}>
        {abas.map((a) => (
          <Pressable key={a.id} onPress={() => { void haptica.tique(); setAba(a.id); }} accessibilityRole="tab" accessibilityState={{ selected: aba === a.id }}
            style={[styles.aba, { borderRadius: tokens.radii.full, backgroundColor: aba === a.id ? palette.primarySoft : 'transparent' }]}>
            <Feather name={a.icone} size={14} color={aba === a.id ? palette.primary : palette.textMuted} />
            <Text variant="caption" color={aba === a.id ? palette.primary : palette.textMuted}>{a.rotulo}</Text>
          </Pressable>
        ))}
      </View>
      {aba === 'mouse' && <Mouse pairing={pairing} />}
      {aba === 'teclado' && <Teclado pairing={pairing} aoErro={aoErro} />}
      {aba === 'janelas' && <Janelas pairing={pairing} aoErro={aoErro} />}
    </View>
  );
}

function useCanal(pairing: Pairing) {
  const canal = useRef<CanalInput | null>(null);
  const ocioso = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (ocioso.current) clearTimeout(ocioso.current); canal.current?.fechar(); canal.current = null; }, [pairing]);
  return () => {
    if (!canal.current) { canal.current = new CanalInput(pairing); canal.current.abrir(); }
    if (ocioso.current) clearTimeout(ocioso.current);
    ocioso.current = setTimeout(() => { canal.current?.fechar(); canal.current = null; }, 30_000);
    return canal.current;
  };
}

/** Arrastar move, toque clica, segurar = botão direito, dois dedos rolam (a faixa da direita também). */
function Mouse({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const canal = useCanal(pairing);
  const ultimo = useRef(0);
  const mover = Gesture.Pan().runOnJS(true).maxPointers(1).minDistance(3)
    .onBegin(() => { canal(); ultimo.current = 0; })
    .onChange((e) => {
      const agora = Date.now();
      const dt = ultimo.current ? Math.min(100, agora - ultimo.current) : 16;
      ultimo.current = agora;
      const [x, y] = acelerar(e.changeX, e.changeY, dt, SENSIBILIDADE_PADRAO);
      canal().enviar(['m', x, y]);
    });
  const rolarDois = Gesture.Pan().runOnJS(true).minPointers(2).onChange((e) => canal().enviar(['w', 0, Math.round(-e.changeY * 1.5)]));
  const clicar = Gesture.Tap().runOnJS(true).maxDuration(250).maxDistance(10).onEnd((_e, ok) => { if (ok) { void haptica.leve(); canal().enviar(['c', 'left']); } });
  const direito = Gesture.LongPress().runOnJS(true).minDuration(450).maxDistance(10).onStart(() => { void haptica.medio(); canal().enviar(['c', 'right']); });
  const roda = Gesture.Pan().runOnJS(true).minDistance(2).onChange((e) => canal().enviar(['w', 0, Math.round(-e.changeY * 2)]));
  return (
    <View style={styles.linhaMouse}>
      <GestureDetector gesture={Gesture.Race(rolarDois, mover, Gesture.Exclusive(direito, clicar))}>
        <View style={[styles.area, { borderColor: palette.glassBorder, borderRadius: tokens.radii.lg }]} accessible accessibilityLabel="Área do mouse do PC">
          <Text variant="caption" color={palette.textFaint ?? palette.textMuted} style={{ textAlign: 'center' }} pointerEvents="none">
            arraste para mover · toque para clicar{'\n'}segure: botão direito · dois dedos: rolar
          </Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={roda}>
        <View style={[styles.roda, { borderColor: palette.glassBorder, borderRadius: tokens.radii.lg }]} accessible accessibilityLabel="Rolar a página do PC">
          <Feather name="chevrons-up" size={14} color={palette.textMuted} />
          <Feather name="chevrons-down" size={14} color={palette.textMuted} />
        </View>
      </GestureDetector>
    </View>
  );
}

const TECLAS: { rotulo: string; icone?: keyof typeof Feather.glyphMap; keys: string[] }[] = [
  { rotulo: 'Enter', icone: 'corner-down-left', keys: ['enter'] },
  { rotulo: 'Apagar', icone: 'delete', keys: ['backspace'] },
  { rotulo: 'Esc', keys: ['esc'] },
  { rotulo: 'Tab', keys: ['tab'] },
  { rotulo: 'Alt+Tab', keys: ['alt', 'tab'] },
  { rotulo: 'Esquerda', icone: 'arrow-left', keys: ['left'] },
  { rotulo: 'Cima', icone: 'arrow-up', keys: ['up'] },
  { rotulo: 'Baixo', icone: 'arrow-down', keys: ['down'] },
  { rotulo: 'Direita', icone: 'arrow-right', keys: ['right'] },
  { rotulo: 'Espaço', keys: ['space'] },
  { rotulo: 'F11', keys: ['f11'] },
  { rotulo: 'Copiar', icone: 'copy', keys: ['ctrl', 'c'] },
  { rotulo: 'Colar', icone: 'clipboard', keys: ['ctrl', 'v'] },
];

function Teclado({ pairing, aoErro }: { pairing: Pairing; aoErro: (e: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const [texto, setTexto] = useState('');
  async function mandar() {
    const t = texto;
    if (!t) return;
    setTexto('');
    void haptica.leve();
    try { await callRpc(pairing, 'input.type', { text: t }); } catch (e) { aoErro(e); }
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.linha}>
        <TextInput value={texto} onChangeText={setTexto} onSubmitEditing={mandar} placeholder="Digite e mande para o PC" placeholderTextColor={palette.textMuted}
          returnKeyType="send" blurOnSubmit={false}
          style={[styles.campo, { flex: 1, borderColor: palette.glassBorder, borderRadius: tokens.radii.md, color: palette.text }]} />
        <Pressable onPress={mandar} accessibilityLabel="Mandar o texto" style={[styles.enviar, { backgroundColor: palette.primary, borderRadius: tokens.radii.md }]}>
          <Feather name="send" size={18} color={palette.onPrimary} />
        </Pressable>
      </View>
      <View style={styles.teclas}>
        {TECLAS.map((k) => (
          <Pressable key={k.rotulo} accessibilityRole="button" accessibilityLabel={k.rotulo}
            onPress={() => { void haptica.leve(); callRpc(pairing, 'input.combo', { keys: k.keys }).catch(aoErro); }}
            style={({ pressed }) => [styles.tecla, { borderRadius: tokens.radii.sm, backgroundColor: pressed ? palette.primarySoft : 'rgba(255,255,255,0.06)' }]}>
            {k.icone ? <Feather name={k.icone} size={15} color={palette.text} /> : <Text variant="caption">{k.rotulo}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Janelas({ pairing, aoErro }: { pairing: Pairing; aoErro: (e: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const [lista, setLista] = useState<Janela[] | null>(null);
  const carregar = () => { callRpc(pairing, 'window.list', {}, { timeoutMs: 10000 }).then((r) => setLista(r.janelas)).catch((e) => { setLista([]); aoErro(e); }); };
  useEffect(carregar, [pairing]); // eslint-disable-line react-hooks/exhaustive-deps
  async function agir(j: Janela, operacao: 'focar' | 'minimizar' | 'fechar') {
    void haptica.medio();
    try { await callRpc(pairing, 'window.control', { hwnd: j.hwnd, operacao }, { timeoutMs: 15000 }); } catch (e) { aoErro(e); }
    setTimeout(carregar, 400);
  }
  if (lista === null) return <ActivityIndicator color={palette.primary} />;
  if (!lista.length) return <Text variant="caption" color={palette.textMuted}>Nenhuma janela aberta.</Text>;
  return (
    <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 6 }}>
      {lista.map((j) => (
        <Animated.View key={j.hwnd} entering={FadeIn.duration(160)} style={[styles.janela, { borderRadius: tokens.radii.md, backgroundColor: 'rgba(255,255,255,0.05)' }]}>
          <Pressable onPress={() => agir(j, 'focar')} style={{ flex: 1, gap: 1 }} accessibilityRole="button" accessibilityLabel={`Trazer ${j.titulo} para a frente`}>
            <Text variant="body" numberOfLines={1}>{j.titulo}</Text>
            <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{j.processo}{j.minimizada ? ' · minimizada' : ''}</Text>
          </Pressable>
          <Pressable onPress={() => agir(j, 'minimizar')} hitSlop={6} accessibilityLabel="Minimizar" style={styles.mini}><Feather name="minus" size={16} color={palette.textMuted} /></Pressable>
          <Pressable onPress={() => agir(j, 'fechar')} hitSlop={6} accessibilityLabel="Fechar a janela" style={styles.mini}><Feather name="x" size={16} color={palette.error} /></Pressable>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

type Destino = 'spotify' | 'youtube' | 'ely';

/** "Pôr no PC": música no Spotify, vídeo no YouTube ou um pedido para a Ely. Os últimos ficam à mão. */
export function PorNoPc({ pairing, aoErro }: { pairing: Pairing; aoErro: (e: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState<Destino>('spotify');
  const [ocupado, setOcupado] = useState(false);
  const [recentes, setRecentes] = useState<string[]>([]);
  const [resposta, setResposta] = useState<string | null>(null);
  useEffect(() => { void lerRecentes().then(setRecentes); }, []);
  async function mandar(t = texto) {
    const pedido = t.trim();
    if (!pedido || ocupado) return;
    Keyboard.dismiss();
    setOcupado(true);
    void haptica.medio();
    try {
      const fala = destino === 'ely'
        ? await sendCommand(pairing, pedido, 'texto', false)
        : (await callRpc(pairing, 'mesa.por', { texto: pedido, onde: destino }, { timeoutMs: 45000 })).fala;
      setTexto('');
      if (destino === 'ely') setResposta(fala); else ToastAndroid.show(fala, ToastAndroid.SHORT);
      if (destino !== 'ely') setRecentes(await guardarRecente(pedido));
    } catch (e) { aoErro(e); } finally { setOcupado(false); }
  }
  const destinos: { id: Destino; icone: keyof typeof Feather.glyphMap; dica: string }[] = [
    { id: 'spotify', icone: 'music', dica: 'Música no Spotify do PC' },
    { id: 'youtube', icone: 'youtube', dica: 'Vídeo no YouTube do PC' },
    { id: 'ely', icone: 'message-circle', dica: 'Pedir para a Ely' },
  ];
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.campoPor, { borderColor: palette.glassBorder, borderRadius: tokens.radii.lg, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
        {destinos.map((d) => (
          <Pressable key={d.id} onPress={() => { void haptica.tique(); setDestino(d.id); }} accessibilityLabel={d.dica} accessibilityState={{ selected: destino === d.id }} hitSlop={4}
            style={[styles.destino, { backgroundColor: destino === d.id ? palette.primarySoft : 'transparent' }]}>
            <Feather name={d.icone} size={16} color={destino === d.id ? palette.primary : palette.textMuted} />
          </Pressable>
        ))}
        <TextInput value={texto} onChangeText={setTexto} onSubmitEditing={() => mandar()} returnKeyType="send"
          placeholder={destino === 'ely' ? 'Pedir para a Ely…' : destino === 'youtube' ? 'Pôr um vídeo no PC…' : 'Pôr uma música no PC…'}
          placeholderTextColor={palette.textMuted} style={[styles.campoTexto, { color: palette.text }]} />
        <Pressable onPress={() => mandar()} disabled={!texto.trim() || ocupado} accessibilityLabel="Mandar" hitSlop={6}
          style={[styles.destino, { backgroundColor: texto.trim() ? palette.primary : 'transparent' }]}>
          {ocupado ? <ActivityIndicator size="small" color={palette.onPrimary} /> : <Feather name="arrow-up" size={18} color={texto.trim() ? palette.onPrimary : palette.textMuted} />}
        </Pressable>
      </View>
      {resposta ? (
        <Animated.View entering={FadeIn.duration(180)} style={[styles.resposta, { borderRadius: tokens.radii.md, backgroundColor: palette.bolhaEla ?? 'rgba(255,255,255,0.06)' }]}>
          <Text variant="body" style={{ flex: 1 }}>{resposta}</Text>
          <Pressable onPress={() => setResposta(null)} hitSlop={8} accessibilityLabel="Fechar a resposta"><Feather name="x" size={16} color={palette.textMuted} /></Pressable>
        </Animated.View>
      ) : null}
      {recentes.length && destino !== 'ely' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
          {recentes.map((r) => (
            <Pressable key={r} onPress={() => mandar(r)} accessibilityLabel={`Pôr ${r} de novo`}
              style={[styles.recente, { borderRadius: tokens.radii.full, backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Feather name="rotate-ccw" size={11} color={palette.textMuted} />
              <Text variant="caption" numberOfLines={1} style={{ maxWidth: 160 }}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abas: { flexDirection: 'row', padding: 3, alignSelf: 'stretch' },
  aba: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  linhaMouse: { flexDirection: 'row', gap: 8, flex: 1, minHeight: 180 },
  area: { flex: 1, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  roda: { width: 44, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.03)' },
  linha: { flexDirection: 'row', gap: 8 },
  campo: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  enviar: { width: 48, alignItems: 'center', justifyContent: 'center' },
  teclas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tecla: { minWidth: 52, height: 40, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  janela: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 4, minHeight: 52 },
  mini: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  campoPor: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, padding: 5, gap: 2 },
  destino: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  campoTexto: { flex: 1, fontSize: 15, paddingHorizontal: 8, paddingVertical: 6 },
  resposta: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'flex-start' },
  recente: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
});
