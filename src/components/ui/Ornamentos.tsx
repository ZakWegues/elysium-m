import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Os ornamentos do tema Renascença (13/10) — os mesmos desenhos do desktop
 * (`css/renascenca.css`), em SVG nativo.
 *
 *  - `CantosOrnamentados`: os quatro cantos em voluta de uma moldura dourada, mais o filete
 *    interno — por cima de um card, sem pegar toque;
 *  - `FundoRenascenca`: nogueira com damasco em folha de ouro, o estudo de geometria
 *    vitruviana e a espiral áurea apagados, e a vinheta.
 */

const VOLUTA = 'M3 37V9a6 6 0 0 1 6-6h28 M9 20c0-7 4-11 11-11 M13 24c0-5 3-8 8-8 3 0 4 2 4 3.5S24 22 22.5 22 20 21 20 20';

function Canto({ cor, transform }: { cor: string; transform: string }) {
  return (
    <G transform={transform}>
      <Path d={VOLUTA} stroke={cor} strokeWidth={1.2} fill="none" />
      <Circle cx={8} cy={8} r={2} fill={cor} />
    </G>
  );
}

/**
 * Fase 23.1: as cantoneiras HUD do Stark — os oito traços de 12×1,5 px nos quatro cantos
 * que o `stark.css` do desktop desenha em todo painel.
 */
export function CantosHud({ cor }: { cor: string }) {
  const t = (s: object) => <View style={[{ position: 'absolute', backgroundColor: cor }, s]} />;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {t({ top: 4, left: 4, width: 12, height: 1.5 })}{t({ top: 4, left: 4, width: 1.5, height: 12 })}
      {t({ top: 4, right: 4, width: 12, height: 1.5 })}{t({ top: 4, right: 4, width: 1.5, height: 12 })}
      {t({ bottom: 4, left: 4, width: 12, height: 1.5 })}{t({ bottom: 4, left: 4, width: 1.5, height: 12 })}
      {t({ bottom: 4, right: 4, width: 12, height: 1.5 })}{t({ bottom: 4, right: 4, width: 1.5, height: 12 })}
    </View>
  );
}

export function CantosOrnamentados({ cor, tamanho = 22 }: { cor: string; tamanho?: number }) {
  const s = tamanho / 40;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Filete interno: a segunda linha da moldura dupla. */}
      <View style={[styles.filete, { borderColor: cor }]} />
      <Svg style={[styles.canto, { top: 2, left: 2 }]} width={tamanho} height={tamanho}><Canto cor={cor} transform={`scale(${s})`} /></Svg>
      <Svg style={[styles.canto, { top: 2, right: 2 }]} width={tamanho} height={tamanho}><Canto cor={cor} transform={`scale(${s}) matrix(-1 0 0 1 40 0)`} /></Svg>
      <Svg style={[styles.canto, { bottom: 2, left: 2 }]} width={tamanho} height={tamanho}><Canto cor={cor} transform={`scale(${s}) matrix(1 0 0 -1 0 40)`} /></Svg>
      <Svg style={[styles.canto, { bottom: 2, right: 2 }]} width={tamanho} height={tamanho}><Canto cor={cor} transform={`scale(${s}) matrix(-1 0 0 -1 40 40)`} /></Svg>
    </View>
  );
}

export function FundoRenascenca({ fundo, ouro, pigmento }: { fundo: string; ouro: string; pigmento: string }) {
  const { width, height } = useWindowDimensions();
  const estudo = Math.min(width, height) * 1.25;
  const espiral = width * 0.95;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[fundo, mais(fundo), fundo]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {/* Damasco: um lírio estilizado repetido em folha de ouro, quase sumindo. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="damasco" width={72} height={72} patternUnits="userSpaceOnUse">
            <Path d="M36 10c-5 6-5 12 0 17 5-5 5-11 0-17zM36 27c-8-2-12 3-12 9 6 0 10-3 12-9zM36 27c8-2 12 3 12 9-6 0-10-3-12-9zM36 27v18M31 45h10M30 50c3-3 9-3 12 0M0 0c6 5 6 11 0 15M72 0c-6 5-6 11 0 15M0 72c6-5 6-11 0-15M72 72c-6-5-6-11 0-15" stroke={ouro} strokeWidth={0.8} fill="none" />
          </Pattern>
          <RadialGradient id="luz" cx="50%" cy="30%" r="60%">
            <Stop offset="0" stopColor={pigmento} stopOpacity={0.12} />
            <Stop offset="1" stopColor={pigmento} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#luz)" />
        <Rect width={width} height={height} fill="url(#damasco)" opacity={0.07} />
      </Svg>
      {/* Estudo vitruviano: círculo, quadrado, triângulos, compasso. */}
      <Svg width={estudo} height={estudo} viewBox="0 0 600 600" style={{ position: 'absolute', right: -estudo * 0.32, top: height * 0.18, opacity: 0.09 }}>
        <G stroke={ouro} strokeWidth={1.2} fill="none">
          <Circle cx={300} cy={300} r={238} />
          <Circle cx={300} cy={300} r={150} />
          <Rect x={90} y={132} width={420} height={420} />
          <Path d="M90 132 510 552M510 132 90 552M300 62v476M62 300h476M300 62 506 419H94ZM300 538 94 181h412Z" />
          <Path d="M300 300 538 300A238 238 0 0 0 300 62" strokeDasharray="3 7" />
          <Circle cx={300} cy={300} r={4} fill={ouro} />
        </G>
      </Svg>
      {/* Espiral áurea com os quadrados de Fibonacci. */}
      <Svg width={espiral} height={espiral * 0.625} viewBox="0 0 240 150" style={{ position: 'absolute', left: -espiral * 0.12, bottom: height * 0.06, opacity: 0.12 }}>
        <G stroke={ouro} fill="none">
          <Path strokeWidth={1} d="M1 145A144 144 0 0 1 145 1A89 89 0 0 1 234 90A55 55 0 0 1 179 145A34 34 0 0 1 145 111A21 21 0 0 1 166 90A13 13 0 0 1 179 103A8 8 0 0 1 171 111A5 5 0 0 1 166 106" />
          <Path strokeWidth={0.5} d="M1 1h233v144H1zM145 1v144M145 90h89M179 90v55M145 111h34M166 90v21M166 103h13" />
        </G>
      </Svg>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
            <RadialGradient id="vinheta" cx="50%" cy="42%" r="75%">
              <Stop offset="0.45" stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.6} />
            </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#vinheta)" />
      </Svg>
    </View>
  );
}

/** Um tom um pouco mais claro do fundo, para o meio do gradiente. */
function mais(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.min(255, v + 10).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

const styles = StyleSheet.create({
  canto: { position: 'absolute' },
  filete: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: StyleSheet.hairlineWidth, borderRadius: 3, opacity: 0.55 },
});
