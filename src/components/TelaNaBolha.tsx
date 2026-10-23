import { createElement, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, ToastAndroid, useWindowDimensions, View } from 'react-native';
import AnimatedReanimated, { Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { comAlfa, useTheme } from '../theme';
import { Text } from './ui';
import { MOV } from '../lib/motion';
import { haptica } from '../lib/haptica';
import { linkSeguro, mensagemDaTela, scriptParaTela, temaDaPaleta, type TelaDaMensagem } from '../lib/telas';

/**
 * Tela inteligente embaixo da resposta da Ely (Fase 4, 22/10; prévia + tela cheia, 23/10). O
 * renderer (assets/ui/render.html, o mesmo do PC) roda numa WebView sem acesso a arquivo, sem
 * janela nova e sem navegar: só o HTML carregado como texto. Conversa por mensagens validadas
 * (lib/telas.ts). Na prévia web, um <iframe sandbox="allow-scripts"> no lugar da WebView.
 *
 * No chat ela é uma PRÉVIA de altura limitada (o resto esmaece e "Abrir tela inteira" abre um
 * Modal com a tela rolando sozinha). Enquanto é gerada: esqueleto vivo (blocos com brilho, barras
 * que respiram, frase que troca, segundos e Cancelar). Falhou: faixa com "Tentar de novo".
 */

let htmlDoRenderer: Promise<string> | null = null;

/** O HTML do renderer, lido uma vez (asset do APK/OTA). */
export function carregarRenderer(): Promise<string> {
  htmlDoRenderer ??= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = Asset.fromModule(require('../../assets/ui/render.html'));
    await asset.downloadAsync();
    if (Platform.OS === 'web') return (await fetch(asset.uri)).text();
    return new File(asset.localUri ?? asset.uri).text();
  })().catch((err) => { htmlDoRenderer = null; throw err; });
  return htmlDoRenderer;
}

const ALTURA_ESQUELETO = 236;
const FRASES = ['Escolhendo o layout…', 'Organizando as informações…', 'Fazendo as contas…', 'Desenhando a tela…', 'Ajustando os detalhes…', 'Quase lá…'];

type Props = {
  tela: TelaDaMensagem;
  /** Botão da tela que pergunta algo à Ely: vira mensagem no chat. */
  onPerguntar: (texto: string) => void;
  /** O que foi digitado na tela (para voltar ao reabrir a conversa). */
  onEstado: (vars: Record<string, unknown>) => void;
  /** Fotos e rotas: o PC busca. */
  onPedido: (rota: 'fotos' | 'rota', params: Record<string, string>) => Promise<{ dados?: unknown; erro?: string }>;
  /** A tela não montou: some, fica só o texto. */
  onFalhou: () => void;
  /** A tela mudou de altura (a animação terminou): o chat desce junto se estava no fim. */
  onCresceu?: () => void;
  /** O "Cancelar" do esqueleto. */
  onCancelar?: () => void;
  /** O "Tentar de novo" da faixa de falha. */
  onTentarDeNovo?: () => void;
  /** Prévia web: a roda do mouse em cima da tela rola o chat. */
  onRolar?: (dy: number) => void;
};

export function TelaNaBolha(props: Props) {
  const { tela } = props;
  const { palette, tokens } = useTheme();
  if (tela.falhou && !tela.programa) {
    return (
      <AnimatedReanimated.View entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)}
        style={[styles.falhou, { borderColor: palette.border, borderRadius: tokens.radii.lg }]}>
        <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>Não consegui montar a tela agora.</Text>
        <Pressable onPress={() => { haptica.leve(); props.onTentarDeNovo?.(); }} accessibilityRole="button" hitSlop={6}
          style={({ pressed }) => [styles.tentar, { borderColor: comAlfa(palette.primary, 0.45), backgroundColor: palette.primarySoft, opacity: pressed ? 0.8 : 1 }]}>
          <Text variant="caption" color={palette.text}>Tentar de novo</Text>
        </Pressable>
      </AnimatedReanimated.View>
    );
  }
  if (!tela.programa) return <EsqueletoVivo onCancelar={props.onCancelar} />;
  return <Previa {...props} />;
}

function Previa({ tela, onPerguntar, onEstado, onPedido, onFalhou, onCresceu, onRolar }: Props) {
  const { palette, tokens } = useTheme();
  const reduzir = useReducedMotion();
  const { height: alturaJanela } = useWindowDimensions();
  const maxPrevia = Math.min(460, Math.round(alturaJanela * 0.55));
  const [html, setHtml] = useState<string | null>(null);
  const [mostrou, setMostrou] = useState(false);
  const [conteudo, setConteudo] = useState(0);
  const [cheia, setCheia] = useState(false);
  /** Muda ao fechar a tela cheia: a prévia remonta com o que foi digitado lá. */
  const [versao, setVersao] = useState(0);
  const estadoRef = useRef(tela.estado);
  const altura = useSharedValue(ALTURA_ESQUELETO);

  useEffect(() => {
    if (!tela.programa) return;
    let vivo = true;
    carregarRenderer().then((h) => { if (vivo) setHtml(h); }).catch(() => { if (vivo) onFalhou(); });
    return () => { vivo = false; };
  }, [tela.programa]);

  const cortada = conteudo > maxPrevia + 24;

  function aoMedir(px: number) {
    if (px <= 40 && !mostrou) return;
    const c = Math.min(px, 4000);
    setConteudo(c);
    const alvo = c > maxPrevia + 24 ? maxPrevia : c;
    altura.value = withTiming(alvo, { duration: reduzir ? 0 : MOV.base, easing: Easing.out(Easing.cubic) });
    if (!mostrou) setMostrou(true);
    setTimeout(() => onCresceu?.(), (reduzir ? 0 : MOV.base) + 40);
  }

  function aoEstado(vars: Record<string, unknown>) {
    estadoRef.current = vars;
    onEstado(vars);
  }

  const estiloAltura = useAnimatedStyle(() => ({ height: altura.value }));
  const raio = tokens.radii.lg + 4;

  return (
    <View>
    <AnimatedReanimated.View style={[styles.caixa, { borderRadius: raio }, estiloAltura]}
      entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)}>
      {html ? (
        <View key={versao} style={[styles.quadroPrevia, { height: Math.max(conteudo, ALTURA_ESQUELETO), opacity: mostrou ? 1 : 0 }]}>
          <Quadro html={html} modo="previa" tela={{ ...tela, estado: estadoRef.current }} rolavel={false}
            onAltura={aoMedir} onEstado={aoEstado} onPerguntar={onPerguntar} onPedido={onPedido}
            onErro={() => { if (!mostrou) onFalhou(); }} onRolar={onRolar} />
        </View>
      ) : null}
      {!mostrou ? <View style={StyleSheet.absoluteFill}><EsqueletoVivo /></View> : null}
      {mostrou && cortada ? (
        <View style={styles.rodapeCortada} pointerEvents="box-none">
          <LinearGradient colors={[comAlfa(palette.surface, 0), comAlfa(palette.surface, 0.94)]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <BotaoAbrir rotulo="Abrir tela inteira" forte onPress={() => setCheia(true)} />
        </View>
      ) : null}
      {cheia && html ? (
        <TelaCheia html={html} tela={{ ...tela, estado: estadoRef.current }}
          onFechar={() => { setCheia(false); setVersao((v) => v + 1); }}
          onEstado={aoEstado} onPerguntar={(t) => { setCheia(false); onPerguntar(t); }} onPedido={onPedido} />
      ) : null}
    </AnimatedReanimated.View>
    {/* Inteira à vista: o "Tela cheia" fica embaixo, sem cobrir nada da tela. */}
    {mostrou && !cortada ? (
      <View style={styles.rodapeInteira}>
        <BotaoAbrir rotulo="Tela cheia" onPress={() => setCheia(true)} />
      </View>
    ) : null}
    </View>
  );
}

function BotaoAbrir({ rotulo, forte, onPress }: { rotulo: string; forte?: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable onPress={() => { haptica.leve(); onPress(); }} accessibilityRole="button" accessibilityLabel={rotulo} hitSlop={8}
      style={({ pressed }) => [styles.abrir, {
        borderColor: forte ? comAlfa(palette.primary, 0.5) : palette.border,
        backgroundColor: comAlfa(palette.surface, 0.92),
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }]}>
      <Feather name="maximize-2" size={13} color={forte ? palette.text : palette.textMuted} />
      <Text variant="caption" color={forte ? palette.text : palette.textMuted}>{rotulo}</Text>
    </Pressable>
  );
}

/** A tela inteira por cima do app: a mesma tela, rolando sozinha; ✕ ou "voltar" fecha. */
function TelaCheia({ html, tela, onFechar, onEstado, onPerguntar, onPedido }: {
  html: string; tela: TelaDaMensagem; onFechar: () => void;
  onEstado: (vars: Record<string, unknown>) => void; onPerguntar: (t: string) => void;
  onPedido: Props['onPedido'];
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade" onRequestClose={onFechar} statusBarTranslucent>
      <View style={[styles.cheia, { backgroundColor: palette.surface, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.cheiaTopo, { borderColor: palette.border }]}>
          <Text variant="label" color={palette.textMuted}>TELA DA ELY</Text>
          <Pressable onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar a tela" hitSlop={10}
            style={({ pressed }) => [styles.fechar, { backgroundColor: pressed ? palette.primarySoft : 'transparent' }]}>
            <Feather name="x" size={20} color={palette.text} />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Quadro html={html} modo="cheia" tela={tela} rolavel onEstado={onEstado} onPerguntar={onPerguntar} onPedido={onPedido} />
        </View>
      </View>
    </Modal>
  );
}

type QuadroProps = {
  html: string;
  modo: 'previa' | 'cheia';
  tela: TelaDaMensagem;
  rolavel: boolean;
  onAltura?: (px: number) => void;
  onEstado: (vars: Record<string, unknown>) => void;
  onPerguntar: (t: string) => void;
  onPedido: Props['onPedido'];
  onErro?: () => void;
  onRolar?: (dy: number) => void;
};

/** A ponte com o renderer (WebView ou iframe): manda config/programa/tema e trata o que volta. */
function Quadro({ html, modo, tela, rolavel, onAltura, onEstado, onPerguntar, onPedido, onErro, onRolar }: QuadroProps) {
  const { palette } = useTheme();
  const reduzir = useReducedMotion();
  const enviarRef = useRef<(m: unknown) => void>(() => {});
  const iniciouRef = useRef(false);
  const tema = temaDaPaleta(palette, reduzir);
  // Trocou o tema do app com a tela aberta: ela acompanha.
  useEffect(() => { if (iniciouRef.current) enviarRef.current({ tipo: 'tema', tema }); }, [palette]);

  function iniciar() {
    if (!tela.programa) return;
    iniciouRef.current = true;
    enviarRef.current({ tipo: 'config', internet: tela.internet !== false, modo });
    enviarRef.current({ tipo: 'programa', texto: tela.programa, tema, ...(tela.estado ? { estado: tela.estado } : {}) });
  }

  async function receber(bruto: unknown) {
    const m = mensagemDaTela(bruto);
    if (!m) return;
    if (m.tipo === 'pronta') iniciar();
    else if (m.tipo === 'altura') onAltura?.(m.px);
    else if (m.tipo === 'rolar') onRolar?.(m.dy);
    else if (m.tipo === 'acao') {
      if (m.acao === 'perguntar') {
        const t = m.valor.trim();
        if (t) { haptica.leve(); onPerguntar(t); }
      } else if (m.acao === 'abrirLink') {
        const url = linkSeguro(m.valor);
        if (!url) { avisar('Link recusado (só https).'); return; }
        // Quem abre é o celular: confirma antes, mostrando o endereço de verdade.
        const curto = url.length > 160 ? `${url.slice(0, 157)}…` : url;
        if (Platform.OS === 'web') { if (window.confirm(`Abrir no navegador?\n\n${curto}`)) Linking.openURL(url).catch(() => {}); }
        else Alert.alert('Abrir no navegador?', curto, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Abrir', onPress: () => { Linking.openURL(url).catch(() => {}); } }]);
      } else if (m.acao === 'copiar') {
        try { await Clipboard.setStringAsync(m.valor); haptica.leve(); avisar('Copiado.'); } catch { avisar('Não consegui copiar.'); }
      }
    } else if (m.tipo === 'estado') {
      onEstado(m.vars);
    } else if (m.tipo === 'pedido') {
      const r = await onPedido(m.rota, m.params);
      enviarRef.current(r.dados !== undefined ? { tipo: 'resposta', id: m.id, dados: r.dados } : { tipo: 'resposta', id: m.id, erro: String(r.erro ?? 'falhou').slice(0, 200) });
    } else if (m.tipo === 'erro') {
      console.warn('[tela]', m.mensagem);
      onErro?.();
    }
  }

  return Platform.OS === 'web'
    ? <QuadroWeb html={html} enviarRef={enviarRef} onMensagem={receber} onCarregou={iniciar} />
    : <QuadroNativo html={html} enviarRef={enviarRef} onMensagem={receber} onCarregou={iniciar} rolavel={rolavel} />;
}

function avisar(texto: string) {
  if (Platform.OS === 'android') ToastAndroid.show(texto, ToastAndroid.SHORT);
}

type Ponte = { html: string; enviarRef: React.MutableRefObject<(m: unknown) => void>; onMensagem: (m: unknown) => void; onCarregou: () => void };

function QuadroNativo({ html, enviarRef, onMensagem, onCarregou, rolavel }: Ponte & { rolavel: boolean }) {
  const ref = useRef<WebView>(null);
  enviarRef.current = (m) => ref.current?.injectJavaScript(scriptParaTela(m));
  return (
    <WebView
      ref={ref}
      source={{ html, baseUrl: 'about:blank' }}
      originWhitelist={['about:blank']}
      // Só o HTML da tela: nenhum link navega (os links passam pela ação abrirLink, com confirmação).
      onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('data:') || r.url.startsWith('blob:')}
      onMessage={(e: WebViewMessageEvent) => onMensagem(e.nativeEvent.data)}
      onLoadEnd={onCarregou}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      geolocationEnabled={false}
      mediaPlaybackRequiresUserAction
      // Prévia: quem rola é a lista do chat (arrastar em cima da tela rola a conversa). Tela cheia: rola sozinha.
      scrollEnabled={rolavel}
      nestedScrollEnabled={rolavel}
      overScrollMode="never"
      showsVerticalScrollIndicator={rolavel}
      webviewDebuggingEnabled={__DEV__}
      style={styles.web}
      containerStyle={styles.web}
    />
  );
}

function QuadroWeb({ html, enviarRef, onMensagem, onCarregou }: Ponte) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    enviarRef.current = (m) => ref.current?.contentWindow?.postMessage(m, '*');
    const ouvir = (e: MessageEvent) => { if (ref.current && e.source === ref.current.contentWindow) onMensagem(e.data); };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, [onMensagem]);
  // srcdoc + sandbox sem allow-same-origin: origem opaca, igual ao PC.
  return createElement('iframe', {
    ref, srcDoc: html, sandbox: 'allow-scripts', referrerPolicy: 'no-referrer', title: 'Tela da Ely',
    onLoad: onCarregou, style: { border: 0, width: '100%', height: '100%', background: 'transparent' },
  });
}

/**
 * Enquanto a tela é gerada: blocos-fantasma de uma tela (título, linha, 3 cartões, barras) com
 * brilho em cascata e barras que respiram; embaixo, os três pontos, a frase que troca a cada 4 s,
 * os segundos e o Cancelar. Com "reduzir movimento": parado, só o texto muda.
 */
function EsqueletoVivo({ onCancelar }: { onCancelar?: () => void }) {
  const { palette, tokens } = useTheme();
  const reduzir = useReducedMotion();
  const [segundos, setSegundos] = useState(0);
  const [cancelou, setCancelou] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const frase = FRASES[Math.min(Math.floor(segundos / 4), FRASES.length - 1)];
  const cor = palette.primary;
  return (
    <AnimatedReanimated.View entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(MOV.saida)}
      style={[styles.esqueleto, { height: ALTURA_ESQUELETO, borderColor: palette.border, borderRadius: tokens.radii.lg + 4, backgroundColor: comAlfa(palette.surface, 0.7) }]}
      accessibilityLabel={`Montando a tela. ${frase}`} accessibilityLiveRegion="polite">
      <View style={styles.esqFolha}>
        <Bloco cor={cor} atraso={0} parado={reduzir} style={{ width: '52%', height: 16 }} />
        <Bloco cor={cor} atraso={120} parado={reduzir} style={{ width: '78%', height: 9 }} />
        <View style={styles.esqCartoes}>
          {[0, 1, 2].map((i) => <Bloco key={i} cor={cor} atraso={160 * (i + 1)} parado={reduzir} style={{ flex: 1, height: 44, borderRadius: 12 }} />)}
        </View>
        <View style={styles.esqBarras}>
          {[0.55, 0.85, 0.4, 0.7, 0.3, 0.6].map((h, i) => <Barra key={i} cor={cor} h={h} atraso={i * 200} parado={reduzir} />)}
        </View>
      </View>
      <View style={[styles.esqRodape, { borderColor: palette.border }]}>
        <View style={styles.pontos}>{[0, 1, 2].map((i) => <Ponto key={i} cor={cor} atraso={i * 160} parado={reduzir} />)}</View>
        <AnimatedReanimated.View key={frase} entering={FadeIn.duration(200)} style={{ flex: 1 }}>
          <Text variant="caption" color={palette.text} numberOfLines={1}>{frase}</Text>
        </AnimatedReanimated.View>
        <Text variant="caption" color={palette.textMuted} style={{ fontVariant: ['tabular-nums'] }}>{segundos} s</Text>
        {onCancelar ? (
          <Pressable disabled={cancelou} onPress={() => { haptica.leve(); setCancelou(true); onCancelar(); }} accessibilityRole="button" accessibilityLabel="Cancelar a tela" hitSlop={8}
            style={({ pressed }) => [styles.cancelar, { borderColor: palette.border, opacity: cancelou ? 0.5 : pressed ? 0.7 : 1 }]}>
            <Text variant="caption" color={palette.textMuted}>Cancelar</Text>
          </Pressable>
        ) : null}
      </View>
    </AnimatedReanimated.View>
  );
}

function Bloco({ cor, atraso, parado, style }: { cor: string; atraso: number; parado: boolean; style: object }) {
  const a = useSharedValue(0.08);
  useEffect(() => {
    if (!parado) a.value = withDelay(atraso, withRepeat(withTiming(0.2, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [parado]);
  const estilo = useAnimatedStyle(() => ({ backgroundColor: comAlfa(cor, a.value) }));
  return <AnimatedReanimated.View style={[{ borderRadius: 8 }, style, estilo]} />;
}

function Barra({ cor, h, atraso, parado }: { cor: string; h: number; atraso: number; parado: boolean }) {
  const s = useSharedValue(h);
  useEffect(() => {
    if (!parado) s.value = withDelay(atraso, withRepeat(withTiming(h * 0.6 + 0.35, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [parado]);
  const estilo = useAnimatedStyle(() => ({ height: `${Math.round(s.value * 100)}%` as `${number}%` }));
  return <AnimatedReanimated.View style={[styles.barra, { backgroundColor: comAlfa(cor, 0.16) }, estilo]} />;
}

function Ponto({ cor, atraso, parado }: { cor: string; atraso: number; parado: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    // O ciclo do "pensando" da esfera (≈1,57 s), como os pontos do chat.
    if (!parado) y.value = withDelay(atraso, withRepeat(withSequence(withTiming(-3, { duration: 390 }), withTiming(0, { duration: 390 }), withTiming(0, { duration: 790 })), -1));
  }, [parado]);
  const estilo = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <AnimatedReanimated.View style={[styles.ponto, { backgroundColor: cor }, estilo]} />;
}

/** Uma WebView escondida, montada cedo: a 1ª tela não paga a subida do motor da WebView. */
export function PreAquecerTelas() {
  useEffect(() => { carregarRenderer().catch(() => {}); }, []);
  if (Platform.OS === 'web') return null;
  return (
    <View style={styles.escondida} pointerEvents="none">
      <WebView source={{ html: '<html></html>' }} javaScriptEnabled={false} allowFileAccess={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { alignSelf: 'stretch', overflow: 'hidden', marginTop: 4, marginBottom: 6 },
  quadroPrevia: { position: 'absolute', left: 0, right: 0, top: 0 },
  web: { flex: 1, backgroundColor: 'transparent' },
  rodapeCortada: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 88, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 },
  rodapeInteira: { alignItems: 'flex-end', marginTop: -2, marginBottom: 4 },
  abrir: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  cheia: { flex: 1 },
  cheiaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingLeft: 18, paddingRight: 8, borderBottomWidth: 1 },
  fechar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  esqueleto: { alignSelf: 'stretch', borderWidth: 1, overflow: 'hidden', marginTop: 4, marginBottom: 6 },
  esqFolha: { flex: 1, gap: 10, padding: 16, paddingBottom: 0 },
  esqCartoes: { flexDirection: 'row', gap: 8 },
  esqBarras: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barra: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  esqRodape: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1 },
  pontos: { flexDirection: 'row', gap: 4 },
  ponto: { width: 5, height: 5, borderRadius: 3 },
  cancelar: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  falhou: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 10, borderWidth: 1, borderStyle: 'dashed', marginTop: 4, marginBottom: 6 },
  tentar: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  escondida: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
