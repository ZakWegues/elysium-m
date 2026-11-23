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
import { mudarBolota, useAjusteDaBolota } from '../lib/bolotaAjuste';
import { dentroDaTela, dentroDoCanto, ehMarcaNoPc, limparResposta } from '../lib/bolotaDoApp';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A bolota no celular (14/11 — o dono: "coloca essa função do Roamies no mobile também, nem que seja
 * mais simples"). A esfera da Ely flutua por cima das abas (menos o Chat, que já tem a dele):
 *  - toque = ela ouve; toque de novo = manda o que ele falou;
 *  - segurar = escrever o pedido; segurar de novo = fechar o campo;
 *  - arrastar = mudar de lugar; no canto superior esquerdo ela fica guardada num containerzinho, e
 *    segurar o containerzinho solta (23/11); nos Ajustes dá para desligar de vez;
 *  - a resposta sai num balão colado nela, aos poucos, e some sozinha;
 *  - "circula o YouTube no PC" = a bolota do PC marca na tela dele (RPC `bolota.marcar`).
 * Tudo em JS (sai por atualização, sem APK novo).
 */

type Fase = 'parada' | 'ouvindo' | 'pensando' | 'respondendo';
const TAM = 58;
const SOME_MS = 9000;
/** O containerzinho do canto e a esfera dentro dele. */
const CANTO = 44, MINI = 30;

export function BolotaDoApp({ pairing, visivel, onAbrirChat }: { pairing: Pairing | null; visivel: boolean; onAbrirChat: () => void }) {
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
  const insets = useSafeAreaInsets();
  const { estado, pos: guardado } = useAjusteDaBolota();
  const padrao = { x: width - TAM - 18, y: height - TAM - 170 };
  const lugar = dentroDaTela(guardado ?? padrao, width, height, TAM);
  const pos = useRef(new RNAnimated.ValueXY(lugar)).current;
  const ultimo = useRef(lugar);
  /** Na linha dos botões do topo, no lado que fica livre (no Chat, onde há botão, ela não aparece). */
  const canto = { x: 10, y: insets.top + 6, lado: CANTO };
  const cantoRef = useRef(canto);
  cantoRef.current = canto;
  const [arrastando, setArrastando] = useState(false);
  const [noCanto, setNoCanto] = useState(false);
  const noCantoRef = useRef(false);
  const escala = useRef(new RNAnimated.Value(1)).current;
  const estavaEscrevendo = useRef(false);
  const geracao = useRef(0);
  const ouvindoRef = useRef(false);
  ouvindoRef.current = fase === 'ouvindo';
  const esfera = useMemo(() => svgDaEsfera(palette.primary, 160), [palette.primary]);

  useEffect(() => () => {
    geracao.current++;
    if (ouvindoRef.current) liberarMicrofone('bolota');
    conexao.current?.close();
    if (timerSome.current) clearTimeout(timerSome.current);
  }, []);

  // A posição guardada chega depois da montagem, a tela gira: acompanha (menos no meio do arrasto).
  useEffect(() => {
    if (arrastando || (ultimo.current.x === lugar.x && ultimo.current.y === lugar.y)) return;
    ultimo.current = lugar;
    pos.setValue(lugar);
  }, [lugar.x, lugar.y]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Para a escuta sem mandar (guardou, desligou ou saiu para o Chat no meio da fala). */
  const cancelarEscuta = () => {
    geracao.current++;
    if (!ouvindoRef.current) return;
    setFase('parada');
    recorder.stop().catch(() => {}).finally(() => liberarMicrofone('bolota'));
  };
  useEffect(() => {
    if (visivel && estado === 'solta') return;
    cancelarEscuta();
    if (escrevendo) { setEscrevendo(false); Keyboard.dismiss(); }
  }, [visivel, estado]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const minha = ++geracao.current;
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) { ToastAndroid.show('Preciso do microfone para ouvir.', ToastAndroid.SHORT); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    ocuparMicrofone('bolota');
    try {
      await recorder.prepareToRecordAsync();
      // Guardou ou saiu enquanto o microfone abria: não grava.
      if (geracao.current !== minha) { liberarMicrofone('bolota'); return; }
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
  const pan = useMemo(() => {
    const soltar = (g: { dx: number; dy: number }, guardar: boolean) => {
      setArrastando(false); setNoCanto(false);
      const prende = guardar && noCantoRef.current;
      noCantoRef.current = false;
      if (prende) {
        haptica.medio();
        const c = cantoRef.current;
        const para = { x: c.x + (CANTO - TAM) / 2, y: c.y + (CANTO - TAM) / 2 };
        RNAnimated.parallel([
          RNAnimated.spring(pos, { toValue: para, useNativeDriver: false, friction: 8, tension: 90 }),
          RNAnimated.spring(escala, { toValue: MINI / TAM, useNativeDriver: false, friction: 8, tension: 90 }),
        ]).start(({ finished }) => {
          if (!finished) return;
          // Volta a valer o lugar de antes do arrasto, para quando soltar.
          escala.setValue(1);
          pos.setValue(ultimo.current);
        });
        setTimeout(() => mudarBolota({ estado: 'guardada', pos: ultimo.current }), 220);
        return;
      }
      const alvo = dentroDaTela({ x: ultimo.current.x + g.dx, y: ultimo.current.y + g.dy }, width, height, TAM);
      ultimo.current = alvo;
      RNAnimated.spring(pos, { toValue: alvo, useNativeDriver: false, friction: 7 }).start();
      mudarBolota({ pos: alvo });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.hypot(g.dx, g.dy) > 6,
      onPanResponderGrant: () => { pos.stopAnimation(); setArrastando(true); },
      onPanResponderMove: (_e, g) => {
        const x = ultimo.current.x + g.dx, y = ultimo.current.y + g.dy;
        pos.setValue({ x, y });
        const dentro = dentroDoCanto({ x: x + TAM / 2, y: y + TAM / 2 }, cantoRef.current);
        if (dentro !== noCantoRef.current) { noCantoRef.current = dentro; setNoCanto(dentro); if (dentro) haptica.tique(); }
      },
      onPanResponderRelease: (_e, g) => soltar(g, true),
      onPanResponderTerminate: (_e, g) => soltar(g, false),
    });
  }, [pos, escala, width, height]);

  const soltarDoCanto = () => {
    haptica.medio();
    const c = cantoRef.current;
    pos.setValue({ x: c.x + (CANTO - TAM) / 2, y: c.y + (CANTO - TAM) / 2 });
    escala.setValue(MINI / TAM);
    mudarBolota({ estado: 'solta' });
    RNAnimated.parallel([
      RNAnimated.spring(pos, { toValue: ultimo.current, useNativeDriver: false, friction: 8 }),
      RNAnimated.spring(escala, { toValue: 1, useNativeDriver: false, friction: 7 }),
    ]).start();
  };

  const alternarCampo = () => {
    haptica.leve();
    if (estavaEscrevendo.current) { setEscrevendo(false); Keyboard.dismiss(); if (resposta || fala) limparDepois(); return; }
    if (timerSome.current) clearTimeout(timerSome.current);
    setEscrevendo(true);
  };

  if (!visivel || estado === 'desligada') return null;
  if (estado === 'guardada') {
    return (
      <Pressable
        onLongPress={soltarDoCanto}
        delayLongPress={350}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Bolota guardada. Segure para soltar"
        accessibilityActions={[{ name: 'activate', label: 'Soltar a bolota' }]}
        onAccessibilityAction={soltarDoCanto}
        style={[styles.canto, { left: canto.x, top: canto.y, backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}
      >
        <SvgXml xml={esfera} width={MINI} height={MINI} />
      </Pressable>
    );
  }

  // Do lado que tem espaço (o `lugar` é estado: depois de arrastar, o balão troca de lado).
  const naEsquerda = lugar.x > width / 2;
  const temBalao = escrevendo || !!fala || !!resposta || fase === 'ouvindo' || fase === 'pensando';
  const rotulo = fase === 'ouvindo' ? 'Ouvindo… toque para mandar' : fase === 'pensando' ? 'Pensando…' : '';

  return (
    <>
    {arrastando ? (
      <Animated.View
        pointerEvents="none"
        entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)}
        style={[styles.canto, styles.vaga, { left: canto.x, top: canto.y, borderColor: noCanto ? palette.primary : palette.textMuted, backgroundColor: noCanto ? palette.primarySoft : 'transparent' }]}
      />
    ) : null}
    <RNAnimated.View pointerEvents="box-none" style={[styles.camada, { transform: [...pos.getTranslateTransform(), { scale: escala }] }]} {...pan.panHandlers}>
      {temBalao && !arrastando ? (
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
        onPressIn={() => { estavaEscrevendo.current = escrevendo; }}
        onLongPress={alternarCampo}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={fase === 'ouvindo' ? 'Mandar o que falei' : 'Falar com a Ely (segure para escrever)'}
        style={[styles.bola, { borderColor: fase === 'ouvindo' ? palette.accent : 'transparent' }]}
      >
        <SvgXml xml={esfera} width={TAM} height={TAM} />
      </Pressable>
    </RNAnimated.View>
    </>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', left: 0, top: 0, zIndex: 40, flexDirection: 'row', alignItems: 'center' },
  bola: { width: TAM, height: TAM, borderRadius: TAM / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  canto: { position: 'absolute', zIndex: 40, width: CANTO, height: CANTO, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  vaga: { borderStyle: 'dashed', borderWidth: 1.5 },
  balao: { position: 'absolute', bottom: 4, paddingHorizontal: 12, paddingVertical: 9, gap: 4, borderWidth: StyleSheet.hairlineWidth, minWidth: 150 },
  campo: { minWidth: 200, height: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10 },
});
