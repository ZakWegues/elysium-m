import { Platform, processColor, StyleSheet } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useReducedMotion } from 'react-native-reanimated';
import { useMemo } from 'react';
import type { TemaDoFundo } from './FundoVivo';

/** 25/11 (APK 2.15.0): o fundo animado nativo — ver modules/vidro/FundoVivoView.kt. */
export const FUNDO_VIVO = Platform.OS === 'android' && Number(Platform.Version) >= 33 && !!requireOptionalNativeModule('FundoVivo');

type Props = { cores: number[]; tema: TemaDoFundo; vivo: boolean; reduzir: boolean; style: object; pointerEvents: 'none' };
const Nativo = FUNDO_VIVO ? requireNativeView<Props>('FundoVivo') : null;

/** ARGB com sinal: o Int do Kotlin. */
const cor = (c: string) => Number(processColor(c) ?? 0) | 0;

export function FundoVivo({ cores, tema, vivo }: { cores: readonly string[]; tema: TemaDoFundo; vivo: boolean }) {
  const reduzir = useReducedMotion();
  const chave = cores.join();
  const argb = useMemo(() => chave.split(/,(?![^(]*\))/).map(cor), [chave]);
  if (!Nativo) return null;
  return <Nativo cores={argb} tema={tema} vivo={vivo} reduzir={reduzir} style={StyleSheet.absoluteFill} pointerEvents="none" />;
}
