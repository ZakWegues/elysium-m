import { Platform, processColor, StyleSheet } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useReducedMotion } from 'react-native-reanimated';
import type { ModoDaEsfera } from './EsferaViva';

/** 25/11 (APK 2.15.0): a esfera nativa — ver modules/vidro/EsferaView.kt. */
export const ESFERA_VIVA = Platform.OS === 'android' && !!requireOptionalNativeModule('EsferaViva');

type Props = { modo: number; cor: number; opacidade: number; ativa: boolean; lento: boolean; noite: number[]; style: object; pointerEvents: 'none' };
const Nativa = ESFERA_VIVA ? requireNativeView<Props>('EsferaViva') : null;

export function EsferaViva({ modo, cor, opacidade, ativa, noite }: { modo: ModoDaEsfera; cor: string; opacidade: number; ativa: boolean; noite: [number, number, number] }) {
  const lento = useReducedMotion();
  if (!Nativa) return null;
  return <Nativa modo={modo} cor={Number(processColor(cor) ?? 0) | 0} opacidade={opacidade} ativa={ativa} lento={lento} noite={noite} style={StyleSheet.absoluteFill} pointerEvents="none" />;
}
