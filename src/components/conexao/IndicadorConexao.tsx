import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Feather from '@expo/vector-icons/Feather';
import Animated, { Easing, FadeInDown, FadeInUp, FadeOut, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { GlassFill, Text, Toque } from '../ui';
import { MOV, reduzirUI } from '../../lib/motion';
import type { EstadoConexao } from '../../lib/conexao/maquina';
import type { Descricao } from '../../lib/estadoPc';

/**
 * O estado da conexão com o PC, no lugar da antiga faixa vermelha (26/10, pedido do Zak).
 *
 * - Reconectando (abriu o app, voltou do fundo): uma pílula de vidro com uma aura que respira, sem
 *   texto nos primeiros 2 s — a maioria das voltas termina antes disso e a pílula só pisca.
 * - Procurando: a mesma pílula com "Reconectando ao PC…".
 * - Offline de verdade, token recusado ou PC pausando o celular: um CARTÃO com o motivo e só
 *   botões que existem e fazem algo. "Trabalhar offline" o recolhe para uma pílula discreta.
 */
export function IndicadorConexao({
  estado, queued, scanning, scanProgress, hasTunnel, motivo, bloqueadoAte, ultimoContato,
  onTentar, onProcurar, onLerQr,
}: {
  estado: EstadoConexao;
  queued: number;
  scanning: boolean;
  scanProgress: number;
  hasTunnel: boolean | null;
  motivo: Descricao | null;
  bloqueadoAte: number | null;
  ultimoContato: number | null;
  onTentar: () => void;
  onProcurar: () => void;
  onLerQr: () => void;
}) {
  const [recolhido, setRecolhido] = useState(false);
  const [mostrarTexto, setMostrarTexto] = useState(false);
  const serio = estado === 'offline' || estado === 'token' || estado === 'bloqueado';

  // O cartão volta a aparecer se o estado piorar depois de recolhido.
  useEffect(() => { if (!serio) setRecolhido(false); }, [serio]);
  // A pílula só ganha texto se a reconexão passar de 2 s.
  useEffect(() => {
    setMostrarTexto(false);
    if (estado !== 'reconectando' && estado !== 'procurando') return;
    const t = setTimeout(() => setMostrarTexto(true), estado === 'procurando' ? 0 : 2000);
    return () => clearTimeout(t);
  }, [estado]);

  if (scanning) return <Pilula texto={`Procurando o PC na rede… ${scanProgress}%`} />;
  if (serio && !recolhido) {
    return (
      <CartaoConexao estado={estado} motivo={motivo} hasTunnel={hasTunnel} queued={queued} bloqueadoAte={bloqueadoAte}
        ultimoContato={ultimoContato} onTentar={onTentar} onProcurar={onProcurar} onLerQr={onLerQr} onRecolher={() => setRecolhido(true)} />
    );
  }
  if (serio) return <Pilula texto={queued > 0 ? `Offline · ${queued} na fila` : 'Offline'} icone="wifi-off" onPress={() => setRecolhido(false)} />;
  if (estado === 'reconectando' || estado === 'procurando') return <Pilula texto={mostrarTexto ? 'Reconectando ao PC…' : null} />;
  if (queued > 0) return <Pilula texto={`Reenviando ${queued} comando${queued > 1 ? 's' : ''}…`} icone="upload-cloud" />;
  return null;
}

/** A aura: um anel que respira na cor do tema. Para com "reduzir movimento". */
function Aura({ cor }: { cor: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const anel = useAnimatedStyle(() => ({
    opacity: reduzirUI.value ? 0.6 : 0.25 + p.value * 0.5,
    transform: [{ scale: reduzirUI.value ? 1 : 0.8 + p.value * 0.45 }],
  }));
  return (
    <View style={styles.aura}>
      <Animated.View style={[styles.auraAnel, { borderColor: cor }, anel]} />
      <View style={[styles.auraNucleo, { backgroundColor: cor }]} />
    </View>
  );
}

function Pilula({ texto, icone, onPress }: { texto: string | null; icone?: keyof typeof Feather.glyphMap; onPress?: () => void }) {
  const { palette, tokens } = useTheme();
  const corpo = (
    <View style={[styles.pilula, { borderRadius: tokens.radii.full, paddingHorizontal: texto ? 14 : 10, borderColor: palette.border }]}>
      <GlassFill intensity={35} edge={false} blur={false} />
      {icone ? <Feather name={icone} size={13} color={palette.textMuted} /> : <Aura cor={palette.primary} />}
      {texto ? <Text variant="caption" color={palette.textMuted} style={{ fontSize: 12.5 }}>{texto}</Text> : null}
    </View>
  );
  return (
    <Animated.View
      entering={FadeInDown.withInitialValues({ transform: [{ translateY: 6 }] }).duration(MOV.base).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System)}
      style={styles.pilulaLinha}
      pointerEvents={onPress ? 'auto' : 'none'}
    >
      {onPress ? <Toque onPress={onPress} haptico="tique">{corpo}</Toque> : corpo}
    </Animated.View>
  );
}

function CartaoConexao({
  estado, motivo, hasTunnel, queued, bloqueadoAte, ultimoContato, onTentar, onProcurar, onLerQr, onRecolher,
}: {
  estado: EstadoConexao; motivo: Descricao | null; hasTunnel: boolean | null; queued: number; bloqueadoAte: number | null;
  ultimoContato: number | null; onTentar: () => void; onProcurar: () => void; onLerQr: () => void; onRecolher: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (estado !== 'bloqueado') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [estado]);

  const sabido = motivo && motivo.titulo !== 'PC sem resposta' ? motivo : null;
  let icone: keyof typeof Feather.glyphMap = 'wifi-off';
  let titulo = 'Sem contato com o PC';
  let detalhe = hasTunnel === false
    ? 'Sem acesso remoto: fora de casa ele não alcança o PC.'
    : hasTunnel ? 'Fora de casa? O Tailscale do celular pode ter caído.' : 'O PC pode estar desligado ou fora desta rede.';
  if (estado === 'token') { icone = 'key'; titulo = 'O PC recusou este celular'; detalhe = 'O QR foi gerado de novo no ELYSIUM. Leia o QR novo para voltar.'; }
  else if (estado === 'bloqueado') {
    const s = Math.max(0, Math.ceil(((bloqueadoAte ?? agora) - agora) / 1000));
    icone = 'pause-circle'; titulo = 'O PC pausou este celular';
    detalhe = `Foram tentativas demais. Volta sozinho em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`;
  } else if (sabido) { icone = 'power'; titulo = sabido.titulo; detalhe = sabido.detalhe || detalhe; }
  const visto = ultimoContato ? `Último contato ${haQuanto(ultimoContato)}.` : null;

  const botoes: { rotulo: string; acao: () => void; principal?: boolean }[] = [];
  if (estado === 'token') botoes.push({ rotulo: 'Ler QR', acao: onLerQr, principal: true });
  else if (estado !== 'bloqueado') {
    botoes.push({ rotulo: 'Tentar agora', acao: onTentar, principal: true });
    if (hasTunnel) botoes.push({ rotulo: 'Abrir Tailscale', acao: abrirTailscale });
    else botoes.push({ rotulo: 'Procurar na rede', acao: onProcurar });
  }
  botoes.push({ rotulo: 'Trabalhar offline', acao: onRecolher });

  return (
    <Animated.View
      entering={FadeInUp.withInitialValues({ transform: [{ translateY: 16 }] }).duration(MOV.base).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System)}
      style={[styles.cartao, { marginHorizontal: tokens.spacing.md, borderRadius: tokens.radii.lg, borderColor: palette.border, padding: tokens.spacing.md }]}
    >
      <GlassFill intensity={45} strong />
      <View style={styles.cartaoTopo}>
        <View style={[styles.placa, { backgroundColor: estado === 'token' ? palette.errorSoft : palette.primarySoft }]}>
          <Feather name={icone} size={18} color={estado === 'token' ? palette.error : palette.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{titulo}</Text>
          <Text variant="caption" color={palette.textMuted}>{detalhe}</Text>
          {(visto || queued > 0) && (
            <Text variant="caption" color={palette.textMuted} style={{ fontSize: 12 }}>
              {[visto, queued > 0 ? `${queued} comando${queued > 1 ? 's' : ''} na fila, mando quando ele voltar.` : null].filter(Boolean).join(' ')}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.botoes}>
        {botoes.map((b) => (
          <Toque key={b.rotulo} onPress={b.acao} haptico="leve"
            style={[styles.botao, { borderRadius: tokens.radii.full, backgroundColor: b.principal ? palette.primary : 'transparent', borderColor: b.principal ? palette.primary : palette.border }]}>
            <Text variant="label" color={b.principal ? palette.onPrimary : palette.text} style={{ fontSize: 13 }}>{b.rotulo}</Text>
          </Toque>
        ))}
      </View>
    </Animated.View>
  );
}

/** "há 3 min", "há 2 h". Pura. */
export function haQuanto(em: number, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - em) / 1000));
  if (s < 60) return 'agora há pouco';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

/** Abre o app do Tailscale; sem ele instalado, a página dele na loja. */
function abrirTailscale(): void {
  try { IntentLauncher.openApplication('com.tailscale.ipn'); }
  catch { Linking.openURL('market://details?id=com.tailscale.ipn').catch(() => {}); }
}

const styles = StyleSheet.create({
  pilulaLinha: { alignItems: 'center', paddingVertical: 6 },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  aura: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  auraAnel: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  auraNucleo: { width: 5, height: 5, borderRadius: 3 },
  cartao: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, gap: 12 },
  cartaoTopo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  placa: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botao: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
});
