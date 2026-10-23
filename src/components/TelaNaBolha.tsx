import { createElement, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, ToastAndroid, View } from 'react-native';
import AnimatedReanimated, { Easing, FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { comAlfa, useTheme } from '../theme';
import { Text } from './ui';
import { MOV } from '../lib/motion';
import { haptica } from '../lib/haptica';
import { linkSeguro, mensagemDaTela, scriptParaTela, temaDaPaleta, type TelaDaMensagem } from '../lib/telas';

/**
 * Tela inteligente embaixo da resposta da Ely (Fase 4, 22/10). O renderer (assets/ui/render.html,
 * o mesmo do PC) roda numa WebView sem acesso a arquivo, sem janela nova e sem navegar: só o
 * HTML carregado como texto. Conversa por mensagens validadas (lib/telas.ts). Na prévia web, um
 * <iframe sandbox="allow-scripts"> no lugar da WebView.
 *
 * Enquanto a tela é gerada: esqueleto com brilho suave. Pronta: cross-fade do esqueleto para a
 * tela, com a altura animada até o tamanho que ela pede.
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

const ALTURA_ESQUELETO = 168;

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
};

export function TelaNaBolha({ tela, onPerguntar, onEstado, onPedido, onFalhou, onCresceu }: Props) {
  const { palette, tokens } = useTheme();
  const reduzir = useReducedMotion();
  const [html, setHtml] = useState<string | null>(null);
  const [mostrou, setMostrou] = useState(false);
  const altura = useSharedValue(ALTURA_ESQUELETO);
  const enviarRef = useRef<(m: unknown) => void>(() => {});
  const iniciouRef = useRef(false);

  useEffect(() => {
    if (!tela.programa) return;
    let vivo = true;
    carregarRenderer().then((h) => { if (vivo) setHtml(h); }).catch(() => { if (vivo) onFalhou(); });
    return () => { vivo = false; };
  }, [tela.programa]);

  const tema = temaDaPaleta(palette, reduzir);
  // Trocou o tema do app com a tela aberta: ela acompanha.
  useEffect(() => { if (iniciouRef.current) enviarRef.current({ tipo: 'tema', tema }); }, [palette]);

  function iniciar() {
    if (!tela.programa) return;
    iniciouRef.current = true;
    enviarRef.current({ tipo: 'config', internet: tela.internet !== false });
    enviarRef.current({ tipo: 'programa', texto: tela.programa, tema, ...(tela.estado ? { estado: tela.estado } : {}) });
  }

  async function receber(bruto: unknown) {
    const m = mensagemDaTela(bruto);
    if (!m) return;
    if (m.tipo === 'pronta') iniciar();
    else if (m.tipo === 'altura') {
      if (m.px <= 40 && !mostrou) return;
      altura.value = withTiming(Math.min(m.px, 4000), { duration: reduzir ? 0 : MOV.base, easing: Easing.out(Easing.cubic) });
      if (!mostrou) setMostrou(true);
      setTimeout(() => onCresceu?.(), (reduzir ? 0 : MOV.base) + 40);
    } else if (m.tipo === 'acao') {
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
      if (!mostrou) onFalhou();
    }
  }

  const estiloAltura = useAnimatedStyle(() => ({ height: altura.value }));
  const borda = { borderRadius: tokens.radii.lg + 4 };

  return (
    <AnimatedReanimated.View style={[styles.caixa, borda, estiloAltura]}
      entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)}>
      {html && tela.programa ? (
        <View style={[StyleSheet.absoluteFill, { opacity: mostrou ? 1 : 0 }]}>
          {Platform.OS === 'web'
            ? <QuadroWeb html={html} enviarRef={enviarRef} onMensagem={receber} onCarregou={iniciar} />
            : <QuadroNativo html={html} enviarRef={enviarRef} onMensagem={receber} onCarregou={iniciar} />}
        </View>
      ) : null}
      {!mostrou ? <Esqueleto cor={palette.primary} borda={palette.border} texto={palette.textMuted} raio={borda.borderRadius} parado={reduzir} /> : null}
    </AnimatedReanimated.View>
  );
}

function avisar(texto: string) {
  if (Platform.OS === 'android') ToastAndroid.show(texto, ToastAndroid.SHORT);
}

type Quadro = { html: string; enviarRef: React.MutableRefObject<(m: unknown) => void>; onMensagem: (m: unknown) => void; onCarregou: () => void };

function QuadroNativo({ html, enviarRef, onMensagem, onCarregou }: Quadro) {
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
      scrollEnabled={false}
      nestedScrollEnabled
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      webviewDebuggingEnabled={__DEV__}
      style={styles.web}
      containerStyle={styles.web}
    />
  );
}

function QuadroWeb({ html, enviarRef, onMensagem, onCarregou }: Quadro) {
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

/** Esqueleto enquanto a tela é gerada: um brilho que passa devagar (parado com "reduzir movimento"). */
function Esqueleto({ cor, borda, texto, raio, parado }: { cor: string; borda: string; texto: string; raio: number; parado: boolean }) {
  const brilho = useSharedValue(0.05);
  useEffect(() => {
    if (!parado) brilho.value = withRepeat(withTiming(0.13, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [parado]);
  const estilo = useAnimatedStyle(() => ({ backgroundColor: comAlfa(cor, brilho.value) }));
  return (
    <AnimatedReanimated.View style={[StyleSheet.absoluteFill, styles.esqueleto, { borderColor: borda, borderRadius: raio }, estilo]}
      accessibilityLabel="Montando a tela">
      <Text variant="caption" color={texto}>Montando a tela…</Text>
    </AnimatedReanimated.View>
  );
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
  web: { flex: 1, backgroundColor: 'transparent' },
  esqueleto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  escondida: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
