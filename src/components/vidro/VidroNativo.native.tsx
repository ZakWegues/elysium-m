import { useEffect, useState } from 'react';
import { findNodeHandle, StyleSheet } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { diagTela } from '../../lib/telaDiag';
import type { PropsVidroNativo } from './VidroNativo';

/**
 * 31/10 (APK 2.7.0): o vidro líquido nativo (modules/vidro) — a barra desenha o que está ATRÁS
 * dela (telas e fundo) através de uma lente AGSL. Só no Android 13+; antes disso `VIDRO_NATIVO`
 * é false e a TabBar fica com o desfoque de sempre.
 */
const modulo = requireOptionalNativeModule<{ suporte(): string }>('Vidro');
export const suporteDoVidro = (): string => modulo?.suporte() ?? 'sem módulo';
export const VIDRO_NATIVO = suporteDoVidro().startsWith('nativo');

type PropsNativas = {
  alvo: number | null;
  lente: number;
  desfoque: number;
  tinta: number[];
  seletor: number[];
  style: object;
  pointerEvents: 'none';
};
const VidroLiquidoView = VIDRO_NATIVO ? requireNativeView<PropsNativas>('Vidro') : null;

let avisou = false;

export function VidroNativo({ alvo, lente, seletor }: PropsVidroNativo) {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    // O alvo é montado antes da barra (App.tsx); o id do nó nativo dele só existe depois do 1º quadro.
    const t = setTimeout(() => setId(alvo?.current ? findNodeHandle(alvo.current) : null), 0);
    if (!avisou) { avisou = true; diagTela(`vidro: ${suporteDoVidro()}`); }
    return () => clearTimeout(t);
  }, [alvo]);
  if (!VidroLiquidoView) return null;
  return (
    <VidroLiquidoView
      alvo={id}
      lente={lente}
      desfoque={7}
      tinta={[0.086, 0.086, 0.1, 0.3]}
      seletor={seletor}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
