import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AnimatedReanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { comAlfa, useTheme } from '../theme';
import { Text } from './ui';
import { haptica } from '../lib/haptica';
import { reduzirUI } from '../lib/motion';
import { tamanhoLegivel } from '../lib/anexos';
import {
  Acao, acoesPara, aoMudarFolha, fecharFolha, folhaAtual, idDoYoutube, linkDoTexto, PedidoFolha, primeirasLinhas, resumoDoLink, tipoDaPrevia,
} from '../lib/folhaCompartilhar';

/** A mola da folha: assenta sem quicar (22/10). */
const MOLA = { damping: 20, stiffness: 220, mass: 1 } as const;

type Estado = { fase: 'escolhendo' } | { fase: 'enviando'; acao: Acao; progresso: number } | { fase: 'ok'; mensagem: string } | { fase: 'erro'; erro: string };

/**
 * A folha de compartilhar (22/10): sobe de baixo com mola, fundo escurece em fade, arrastar
 * para baixo / tocar fora / voltar fecham. Mostra a prévia do que chegou e só as ações que
 * valem para o tipo. O resultado aparece nela mesma e ela fecha sozinha.
 */
export function FolhaCompartilhar() {
  const [pedido, setPedido] = useState<PedidoFolha | null>(folhaAtual());
  useEffect(() => aoMudarFolha(setPedido), []);
  if (!pedido) return null;
  return <Folha key={String(pedido.item.texto) + String(pedido.item.arquivo?.uri)} pedido={pedido} />;
}

function Folha({ pedido }: { pedido: PedidoFolha }) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [estado, setEstado] = useState<Estado>({ fase: 'escolhendo' });
  const [pergunta, setPergunta] = useState('');
  const controle = useRef<AbortController | null>(null);
  const y = useSharedValue(height);
  const veu = useSharedValue(0);
  const { acoes, aviso } = acoesPara(pedido.item, pedido.modo);

  useEffect(() => {
    if (reduzirUI.value) { y.value = 0; veu.value = withTiming(1, { duration: 140 }); }
    else { y.value = withSpring(0, MOLA); veu.value = withTiming(1, { duration: 220 }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fechar() {
    controle.current?.abort();
    const dur = reduzirUI.value ? 140 : 220;
    veu.value = withTiming(0, { duration: dur });
    y.value = withTiming(height, { duration: dur }, (fim) => { if (fim) runOnJS(fecharFolha)(); });
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { fechar(); return true; });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function escolher(acao: Acao) {
    haptica.leve();
    const ctl = new AbortController();
    controle.current = ctl;
    setEstado({ fase: 'enviando', acao, progresso: 0 });
    const r = await pedido.aoEscolher(acao, {
      pergunta,
      progresso: (p) => setEstado((e) => (e.fase === 'enviando' ? { ...e, progresso: p } : e)),
      signal: ctl.signal,
    });
    controle.current = null;
    if (r.ok) { haptica.sucesso(); setEstado({ fase: 'ok', mensagem: r.mensagem ?? 'Pronto' }); setTimeout(fechar, 1000); }
    else { haptica.erro(); setEstado({ fase: 'erro', erro: r.erro }); setTimeout(fechar, 2600); }
  }

  const arrastar = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(fechar)();
      else y.value = withSpring(0, MOLA);
    });

  const estiloFolha = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const estiloVeu = useAnimatedStyle(() => ({ opacity: veu.value }));
  const ocupado = estado.fase === 'enviando';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedReanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, estiloVeu]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={ocupado ? undefined : fechar} accessibilityLabel="Fechar" />
      </AnimatedReanimated.View>
      <GestureDetector gesture={arrastar}>
        <AnimatedReanimated.View style={[styles.folha, {
          backgroundColor: palette.glassSheet, borderColor: palette.glassBorder, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingBottom: insets.bottom + tokens.spacing.lg, paddingHorizontal: tokens.spacing.lg,
        }, estiloFolha]}>
          <View style={[styles.alca, { backgroundColor: palette.textMuted }]} />
          <Text variant="subheading">{pedido.modo === 'confirmar' ? 'Mandar para o PC?' : 'Compartilhar com o Elysium'}</Text>
          <Previa pedido={pedido} />
          {aviso ? <Text variant="caption" color={pedido.modo === 'confirmar' ? palette.accent : palette.textMuted} style={{ marginTop: 8 }}>{aviso}</Text> : null}

          {estado.fase === 'escolhendo' && (
            <View style={{ gap: 10, marginTop: tokens.spacing.md }}>
              {acoes.includes('ely') && (
                <TextInput value={pergunta} onChangeText={setPergunta} placeholder="O que você quer saber? (opcional)"
                  placeholderTextColor={palette.textMuted} maxLength={300}
                  style={[styles.campo, { color: palette.text, borderColor: palette.border, borderRadius: tokens.radii.md }]} />
              )}
              {acoes.includes('ely') && <Cartao icone="message-circle" titulo="Perguntar à Ely" nota={pergunta.trim() ? 'Com a sua pergunta' : 'Ela lê e responde no chat'} onPress={() => escolher('ely')} />}
              {acoes.includes('pc') && <Cartao icone="monitor" titulo="Mandar para o PC" nota="Cai na Caixa do computador" onPress={() => escolher('pc')} />}
              <Pressable onPress={fechar} style={styles.cancelar} accessibilityRole="button">
                <Text variant="body" color={palette.textMuted}>Cancelar</Text>
              </Pressable>
            </View>
          )}

          {estado.fase === 'enviando' && (
            <View style={{ marginTop: tokens.spacing.lg, gap: 10 }}>
              <Text variant="body">{estado.acao === 'ely' ? 'Abrindo na Ely…' : `Enviando… ${Math.round(estado.progresso * 100)}%`}</Text>
              <View style={[styles.trilho, { backgroundColor: palette.border }]}>
                <View style={[styles.barra, { width: `${Math.max(3, estado.progresso * 100)}%`, backgroundColor: palette.primary }]} />
              </View>
              {pedido.item.arquivo ? (
                <Pressable onPress={() => controle.current?.abort()} style={styles.cancelar} accessibilityRole="button">
                  <Text variant="body" color={palette.textMuted}>Cancelar envio</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {(estado.fase === 'ok' || estado.fase === 'erro') && (
            <View style={[styles.resultado, { marginTop: tokens.spacing.lg }]}>
              <View style={[styles.selo, { backgroundColor: comAlfa(estado.fase === 'ok' ? palette.success : palette.error, 0.16) }]}>
                <Feather name={estado.fase === 'ok' ? 'check' : 'x'} size={22} color={estado.fase === 'ok' ? palette.success : palette.error} />
              </View>
              <Text variant="body">{estado.fase === 'ok' ? estado.mensagem : estado.erro}</Text>
            </View>
          )}
        </AnimatedReanimated.View>
      </GestureDetector>
    </View>
  );
}

function Cartao({ icone, titulo, nota, onPress }: { icone: 'message-circle' | 'monitor'; titulo: string; nota: string; onPress: () => void }) {
  const { palette, tokens } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={titulo}
      style={({ pressed }) => [styles.cartao, {
        borderRadius: tokens.radii.lg, borderColor: comAlfa(palette.primary, 0.35), backgroundColor: palette.primarySoft,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      }]}>
      <View style={[styles.icone, { backgroundColor: comAlfa(palette.primary, 0.18) }]}>
        <Feather name={icone} size={20} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body">{titulo}</Text>
        <Text variant="caption" color={palette.textMuted}>{nota}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.textMuted} />
    </Pressable>
  );
}

/** A prévia: miniatura do YouTube (+ título pelo oEmbed), link, imagem, arquivo ou texto. */
function Previa({ pedido }: { pedido: PedidoFolha }) {
  const { palette, tokens } = useTheme();
  const { item } = pedido;
  const tipo = tipoDaPrevia(item);
  const [titulo, setTitulo] = useState<string | null>(null);
  const idYt = tipo === 'youtube' ? idDoYoutube(item.texto) : null;

  useEffect(() => {
    if (!idYt) return;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${idYt}`)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { title?: unknown } | null) => { if (typeof j?.title === 'string') setTitulo(j.title.slice(0, 120)); })
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctl.abort(); };
  }, [idYt]);

  const caixa = [styles.previa, { borderColor: palette.border, borderRadius: tokens.radii.md, marginTop: tokens.spacing.md }];
  if (idYt) {
    const link = linkDoTexto(item.texto) ?? '';
    return (
      <View style={caixa}>
        <Image source={{ uri: `https://i.ytimg.com/vi/${idYt}/hqdefault.jpg` }} style={[styles.miniatura, { borderRadius: tokens.radii.sm }]} resizeMode="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" numberOfLines={2}>{titulo ?? 'Vídeo do YouTube'}</Text>
          <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{resumoDoLink(link).dominio}</Text>
        </View>
      </View>
    );
  }
  if (tipo === 'link') {
    const r = resumoDoLink(item.texto!.trim());
    return (
      <View style={caixa}>
        <Feather name="link" size={20} color={palette.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>{r.dominio}</Text>
          {r.caminho ? <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{r.caminho}</Text> : null}
        </View>
      </View>
    );
  }
  if (tipo === 'imagem' && item.arquivo) {
    return (
      <View style={caixa}>
        <Image source={{ uri: item.arquivo.uri }} style={[styles.miniatura, { borderRadius: tokens.radii.sm }]} resizeMode="cover" />
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>{item.arquivo.nome}</Text>
          {item.arquivo.bytes ? <Text variant="caption" color={palette.textMuted}>{tamanhoLegivel(item.arquivo.bytes)}</Text> : null}
        </View>
      </View>
    );
  }
  if (tipo === 'arquivo' && item.arquivo) {
    return (
      <View style={caixa}>
        <Feather name={/^video\//.test(item.arquivo.mimeType) ? 'film' : /^audio\//.test(item.arquivo.mimeType) ? 'music' : 'file'} size={22} color={palette.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>{item.arquivo.nome}</Text>
          {item.arquivo.bytes ? <Text variant="caption" color={palette.textMuted}>{tamanhoLegivel(item.arquivo.bytes)}</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={caixa}>
      <Text variant="body" numberOfLines={5} style={{ flex: 1 }}>{primeirasLinhas(item.texto ?? '')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  folha: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
  alca: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, opacity: 0.5, marginBottom: 14 },
  previa: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  miniatura: { width: 96, height: 54 },
  campo: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  cartao: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, minHeight: 64 },
  icone: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cancelar: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  trilho: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barra: { height: 6, borderRadius: 3 },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
