import { ReactNode, useEffect, useState } from 'react';
import { findNodeHandle, StyleSheet } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { diagTela } from '../../lib/telaDiag';
import type { PropsVidroNativo } from './VidroNativo';

/**
 * 31/10 (APK 2.7.0): o vidro líquido nativo (modules/vidro) — a barra desenha o que está ATRÁS
 * dela (telas e fundo) através de uma lente AGSL. Só no Android 13+; antes disso `VIDRO_NATIVO`
 * é false e a TabBar fica com o desfoque de sempre.
 *
 * 01/11: a `reserva` (o desfoque de sempre) fica por baixo até o nativo dizer que está desenhando —
 * na 2.7.0 a view nativa não achou o alvo no aparelho do Zak e a barra ficou transparente. Assim a
 * barra nunca fica sem vidro, e o estado vai para o log do PC.
 */
const modulo = requireOptionalNativeModule<{ suporte(): string; estado?(): string }>('Vidro');
export const suporteDoVidro = (): string => modulo?.suporte() ?? 'sem módulo';
export const VIDRO_NATIVO = suporteDoVidro().startsWith('nativo');

type PropsNativas = {
  alvo: number | null;
  lente: number;
  desfoque: number;
  tinta: number[];
  seletor: number[];
  raio: number;
  brilho: number;
  perfil: number;
  style: object;
  pointerEvents: 'none';
};
const VidroLiquidoView = VIDRO_NATIVO ? requireNativeView<PropsNativas>('Vidro') : null;

let avisou = false;
/** Vale para o app inteiro: confirmado uma vez, a barra não volta para a reserva. */
let confirmado = false;

export function VidroNativo({ alvo, lente, seletor = [0, 0, 0], raio = 0, brilho = 1, perfil = 0, tinta = [0.086, 0.086, 0.1, 0.3], reserva }: PropsVidroNativo & { reserva?: ReactNode }) {
  const [id, setId] = useState<number | null>(null);
  const [desenhando, setDesenhando] = useState(confirmado);
  useEffect(() => {
    // O alvo é montado antes da barra (App.tsx); o id do nó nativo dele só existe depois do 1º quadro.
    const t = setTimeout(() => setId(alvo?.current ? findNodeHandle(alvo.current) : null), 0);
    if (!avisou) { avisou = true; diagTela(`vidro: ${suporteDoVidro()}`); }
    return () => clearTimeout(t);
  }, [alvo]);
  useEffect(() => {
    if (confirmado || !modulo?.estado) return;
    let vezes = 0;
    const timer = setInterval(() => {
      const e = modulo.estado?.() ?? '?';
      vezes++;
      if (e.startsWith('desenhando')) {
        confirmado = true;
        setDesenhando(true);
        diagTela(`vidro estado: ${e}`);
        clearInterval(timer);
      } else if (vezes === 6) {
        diagTela(`vidro estado: ${e} (id do alvo ${id ?? 'nenhum'})`);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [id]);
  if (!VidroLiquidoView) return <>{reserva}</>;
  return (
    <>
      {!desenhando && reserva}
      <VidroLiquidoView
        alvo={id}
        lente={lente}
        desfoque={7}
        tinta={tinta}
        raio={raio}
        brilho={brilho}
        perfil={perfil}
        seletor={seletor}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </>
  );
}
