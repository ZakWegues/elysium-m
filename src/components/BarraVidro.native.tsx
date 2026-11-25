import { useEffect, useMemo, useState } from 'react';
import { findNodeHandle, Platform, processColor, StyleSheet, View } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { PropsBarraVidro } from './BarraVidro';
import { Text } from './ui';

/**
 * A barra com liquid glass (25/11, APK 2.14.0), como a do Nuvio Enhanced: tudo nativo em
 * modules/vidro/barra — o toque, a mola, os ícones e a lente são o mesmo desenho. O JS só diz quais
 * são as abas e recebe qual foi tocada.
 */
export const BARRA_VIDRO = Platform.OS === 'android' && Number(Platform.Version) >= 33 && !!requireOptionalNativeModule('BarraVidro');

type Nativa = {
  alvo: number | null;
  tabs: object[];
  selectedIndex: number;
  palette: Record<string, number>;
  layerOpacity: Record<string, number>;
  metrics: Record<string, number>;
  motion: object;
  touchFeedback: object;
  onTabPress: (e: { nativeEvent: { index: number } }) => void;
  style: object;
};
const Nativa = BARRA_VIDRO ? requireNativeView<Nativa>('BarraVidro') : null;

const cor = (c: string) => Number(processColor(c) ?? 0);

/** As medidas do Nuvio: trilho de 64, seletor de 56, sem sobra entre as abas. */
const ENTRE = 4;
const METRICAS = { trackHeight: 64, itemHeight: 56, trackInset: ENTRE, iconSize: 24, labelPadding: 4, iconLabelGap: 1, pillOverhang: 0 };
const OPACIDADE = { surface: 1, selectedSurface: 1, activeContent: 1, inactiveContent: 1 };
const MOVIMENTO = {
  pillPressedScale: 1.3, snapOnPointerDown: true, releaseDistanceFraction: 0.025,
  springs: {
    panel: { stiffness: 300, dampingRatio: 1 }, press: { stiffness: 1000, dampingRatio: 1 },
    scaleX: { stiffness: 250, dampingRatio: 0.6 }, scaleY: { stiffness: 250, dampingRatio: 0.7 },
    value: { stiffness: 1000, dampingRatio: 1 }, velocity: { stiffness: 300, dampingRatio: 0.5 },
  },
  barPressedScale: 1.025, barSpring: { stiffness: 240, damping: 18, mass: 0.9 },
  verticalDistortion: 0.08, verticalDistortionDistance: 700, verticalFollow: 0.25, verticalRubberBand: 0.14, panelOffset: 4,
};

export function BarraVidro({ abas, ativa, aoTocar, alvo, cores, fonte }: PropsBarraVidro) {
  const [id, setId] = useState<number | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    // O alvo é montado antes da barra; o nó nativo dele só existe depois do 1º quadro.
    const t = setTimeout(() => setId(alvo?.current ? findNodeHandle(alvo.current) : null), 0);
    return () => clearTimeout(t);
  }, [alvo]);

  const tabs = useMemo(() => abas.map((a) => {
    const rotulo = { color: null, fontFamily: fonte ?? null, fontSize: 11, fontWeight: fonte ? 400 : 600, italic: false, letterSpacing: 0 };
    return { label: a.rotulo, activeIcon: { kind: 'path', path: a.cheio, viewBox: 24 }, inactiveIcon: { kind: 'path', path: a.contorno, viewBox: 24 }, activeLabel: rotulo, inactiveLabel: rotulo };
  }), [abas, fonte]);
  const paleta = useMemo(() => ({ surface: cor(cores.superficie), selectedSurface: cor(cores.destaque), activeContent: cor(cores.aceso), inactiveContent: cor(cores.apagado) }),
    [cores.superficie, cores.destaque, cores.aceso, cores.apagado]);
  const toque = useMemo(() => ({ enabled: true, color: cor(cores.toque), centerOpacity: 0.15, middleOpacity: 0.0645, radius: 300 }), [cores.toque]);

  if (!Nativa) return null;
  const passo = (largura - ENTRE * 2) / Math.max(1, abas.length);
  return (
    <View style={styles.caixa} onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      <Nativa style={StyleSheet.absoluteFill} alvo={id} tabs={tabs} selectedIndex={ativa} palette={paleta} layerOpacity={OPACIDADE}
        metrics={METRICAS} motion={MOVIMENTO} touchFeedback={toque} onTabPress={(e) => aoTocar(e.nativeEvent.index)} />
      {/* Só para o leitor de tela e os avisos: os toques passam direto para a barra nativa. */}
      {largura > 0 ? abas.map((a, i) => (
        <View key={a.rotulo} pointerEvents="none" accessible accessibilityRole="tab" accessibilityLabel={a.acessivel} accessibilityState={{ selected: i === ativa }}
          accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => aoTocar(i)}
          style={[styles.aba, { left: ENTRE + passo * i, width: passo }]}>
          {a.aviso ? (
            <View style={[styles.aviso, { backgroundColor: cores.aviso }]}><Text variant="caption" color="#fff" style={styles.avisoTexto}>{a.aviso}</Text></View>
          ) : null}
        </View>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { width: '100%', maxWidth: 400, height: 64 },
  aba: { position: 'absolute', top: ENTRE, height: 56 },
  aviso: { position: 'absolute', top: 3, left: '50%', marginLeft: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  avisoTexto: { fontSize: 10, lineHeight: 13 },
});
