import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Keyboard, PanResponder, Pressable, StyleSheet, TextInput, ToastAndroid, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { useTheme } from '../theme';
import { Text } from './ui';
import { svgDaEsfera } from '../lib/esferaLogica';
import { openVoiceConnection, type VoiceConnection } from '../lib/stream';
import { callRpc } from '../lib/rpc';
import { falar } from '../lib/falar';
import { haptica } from '../lib/haptica';
import { liberarMicrofone, ocuparMicrofone } from '../lib/microfone';
import type { Pairing } from '../lib/pairing';
import { ehMarcaNoPc, limparResposta } from '../lib/bolotaDoApp';

/**
 * A bolota no celular (14/11 — o dono: "coloca essa função do Roamies no mobile também, nem que seja
 * mais simples"). A esfera da Ely flutua por cima das abas (menos o Chat, que já tem a dele):
 *  - toque = ela ouve; toque de novo = manda o que ele falou;
 *  - segurar = escrever o pedido;
 *  - arrastar = mudar de lugar;
 *  - a resposta sai num balão colado nela, aos poucos, e some sozinha;
 *  - "circula o YouTube no PC" = a bolota do PC marca na tela dele (RPC `bolota.marcar`).
 * Tudo em JS (sai por atualização, sem APK novo).
 */

type Fase = 'parada' | 'ouvindo' | 'pensando' | 'respondendo';
const TAM = 58;
const SOME_MS = 9000;

export function BolotaDoApp({ pairing, onAbrirChat }: { pairing: Pairing | null; onAbrirChat: () => void }) {
  const { palette, tokens } = useTheme();
  const { width, height } = useWindowDimensions();
  const [fase, setFase] = useState<Fase>('parada');
  const [fala, setFala] = useState('');
  const [resposta, setResposta] = useState('');
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState('');
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const conexao = useRef<VoiceConnection | null>(null);
  const timerSome = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pos = useRef(new RNAnimated.ValueXY({ x: width - TAM - 18, y: height - TAM - 170 })).current;
  const ultimo = useRef({ x: width - TAM - 18, y: height - TAM - 170 });
  const esfera = useMemo(() => svgDaEsfera(palette.primary, 160), [palette.primary]);

  useEffect(() => () => { conexao.current?.close(); if (timerSome.current) clearTimeout(timerSome.current); }, []);

  const limparDepois = () => {
    if (timerSome.current) clearTimeout(timerSome.current);
    timerSome.current = setTimeout(() => { setResposta(''); setFala(''); setFase('parada'); }, SOME_MS);
  };

  function abrirConexao(): VoiceConnection | null {
    if (!pairing) return null;
    if (!conexao.current || !conexao.current.viva()) {
      conexao.current?.close();
      conexao.current = openVoiceConnection(pairing, () => { conexao.current = null; });
    }
    return conexao.current;
  }

  async function pedir(textoPedido: string) {
    const t = textoPedido.trim();
    if (!t) return;
    setFala(t); setResposta(''); setFase('pensando');
    if (timerSome.current) clearTimeout(timerSome.current);
    try {
      // Marcar na tela do PC: vai direto à bolota de lá.
      if (ehMarcaNoPc(t) && pairing) {
        const r = await callRpc(pairing, 'bolota.marcar', { texto: t }, { timeoutMs: 20000 });
        setResposta(r?.fala || 'Marquei na tela do PC.');
      } else {
        const c = abrirConexao();
        if (!c) { setResposta('Pareie o celular com o PC primeiro.'); return; }
        await c.ready;
        setFase('respondendo');
        const r = await c.sendText(t, (parcial) => setResposta(limparResposta(parcial)), { canal: 'voz' });
        const final = limparResposta(r.reply);
        setResposta(final);
        void falar(final, pairing).catch(() => {});
      }
    } catch {
      setResposta('Não consegui falar com o PC agora.');
    } finally {
      setFase('respondendo');
      limparDepois();
    }
  }

  async function comecarAOuvir() {
    if (!pairing) { ToastAndroid.show('Pareie o celular com o PC primeiro.', ToastAndroid.SHORT); return; }
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) { ToastAndroid.show('Preciso do microfone para ouvir.', ToastAndroid.SHORT); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    ocuparMicrofone('bolota');
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptica.medio();
      if (timerSome.current) clearTimeout(timerSome.current);
      setFala(''); setResposta(''); setFase('ouvindo');
    } catch {
      liberarMicrofone('bolota');
      ToastAndroid.show('Não consegui abrir o microfone.', ToastAndroid.SHORT);
    }
  }

  async function terminarDeOuvir() {
    haptica.leve();
    try { await recorder.stop(); } catch { /* nada gravado */ } finally { liberarMicrofone('bolota'); }
    const uri = recorder.uri;
    if (!uri) { setFase('parada'); return; }
    const c = abrirConexao();
    if (!c) { setFase('parada'); return; }
    setFase('pensando');
    try {
      await c.ready;
      const r = await c.sendAudio(uri, (parcial) => { setFase('respondendo'); setResposta(limparResposta(parcial)); }, (transcricao) => setFala(transcricao));
      const final = limparResposta(r.reply);
      setResposta(final);
      void falar(final, pairing).catch(() => {});
    } catch {
      setResposta('Não consegui falar com o PC agora.');
    } finally {
      setFase('respondendo');
      limparDepois();
    }
  }

  const tocar = () => {
    if (fase === 'ouvindo') void terminarDeOuvir();
    else if (fase !== 'pensando') void comecarAOuvir();
  };

  // Arrastar: só depois de mexer uns pixels (um toque continua sendo toque).
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => Math.hypot(g.dx, g.dy) > 6,
    onPanResponderGrant: () => { pos.setOffset({ ...ultimo.current }); pos.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: RNAnimated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_e, g) => {
      pos.flattenOffset();
      const x = Math.max(8, Math.min(width - TAM - 8, ultimo.current.x + g.dx));
      const y = Math.max(60, Math.min(height - TAM - 110, ultimo.current.y + g.dy));
      ultimo.current = { x, y };
      RNAnimated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 7 }).start();
    },
  }), [pos, width, height]);

  const naEsquerda = ultimo.current.x > width / 2;
  const temBalao = escrevendo || !!fala || !!resposta || fase === 'ouvindo' || fase === 'pensando';
  const rotulo = fase === 'ouvindo' ? 'Ouvindo… toque para mandar' : fase === 'pensando' ? 'Pensando…' : '';

  return (
    <RNAnimated.View pointerEvents="box-none" style={[styles.camada, { transform: pos.getTranslateTransform() }]} {...pan.panHandlers}>
      {temBalao ? (
        <Animated.View
          entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.balao,
            naEsquerda ? { right: TAM + 8 } : { left: TAM + 8 },
            { backgroundColor: palette.surfaceRaised, borderColor: palette.border, borderRadius: tokens.radii.lg, maxWidth: Math.min(300, width - TAM - 40) },
          ]}
        >
          {rotulo ? <Text variant="caption" color={palette.primary}>{rotulo}</Text> : null}
          {fala ? <Text variant="caption" color={palette.textMuted} numberOfLines={2}>{fala}</Text> : null}
          {escrevendo ? (
            <TextInput
              autoFocus
              value={texto}
              onChangeText={setTexto}
              placeholder="Pergunte à Ely…"
              placeholderTextColor={palette.textMuted}
              returnKeyType="send"
              onSubmitEditing={() => { const t = texto; setTexto(''); setEscrevendo(false); Keyboard.dismiss(); void pedir(t); }}
              onBlur={() => { if (!texto.trim()) setEscrevendo(false); }}
              style={[styles.campo, { color: palette.text, borderColor: palette.border }]}
            />
          ) : null}
          {resposta ? <Text color={palette.text} numberOfLines={8}>{resposta}</Text> : null}
          {resposta && fase === 'respondendo' ? (
            <Pressable onPress={onAbrirChat} hitSlop={6}><Text variant="caption" color={palette.primary}>Abrir no chat</Text></Pressable>
          ) : null}
        </Animated.View>
      ) : null}
      <Pressable
        onPress={tocar}
        onLongPress={() => { haptica.leve(); if (timerSome.current) clearTimeout(timerSome.current); setEscrevendo(true); }}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={fase === 'ouvindo' ? 'Mandar o que falei' : 'Falar com a Ely (segure para escrever)'}
        style={[styles.bola, { borderColor: fase === 'ouvindo' ? palette.accent : 'transparent' }]}
      >
        <SvgXml xml={esfera} width={TAM} height={TAM} />
      </Pressable>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', left: 0, top: 0, zIndex: 40, flexDirection: 'row', alignItems: 'center' },
  bola: { width: TAM, height: TAM, borderRadius: TAM / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  balao: { position: 'absolute', bottom: 4, paddingHorizontal: 12, paddingVertical: 9, gap: 4, borderWidth: StyleSheet.hairlineWidth, minWidth: 150 },
  campo: { minWidth: 200, height: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10 },
});
