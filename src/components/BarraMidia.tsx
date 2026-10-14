import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, MediaOperation } from '../lib/rpc';
import { haptica } from '../lib/haptica';
import { useTheme } from '../theme';
import SliderVolume from './SliderVolume';
import { Card, GlassCircle, Text } from './ui';

/** Fase 22: saiu da aba PC para servir também ao trackpad (aba Mídia). */
type ErrorHandler = (err: unknown, context: string) => void;

// ── Teclas de mídia e volume ──────────────────────────────────────────────────

const TECLAS_MIDIA: { op: MediaOperation; icone: keyof typeof Feather.glyphMap; rotulo: string }[] = [
  { op: 'previous', icone: 'skip-back', rotulo: 'Anterior' },
  { op: 'play', icone: 'play', rotulo: 'Tocar' },
  { op: 'pause', icone: 'pause', rotulo: 'Pausar' },
  { op: 'skip', icone: 'skip-forward', rotulo: 'Próxima' },
];

/**
 * Sempre à vista, sem gaveta: é o que mais se aperta num controle remoto. Funciona com
 * qualquer player — são as teclas de mídia do Windows, não o Spotify (que tem a barra
 * dele logo acima quando está tocando).
 */
export function BarraMidia({ pairing, onError, semCartao }: { pairing: Pairing; onError: ErrorHandler; /** Dentro do trackpad: sem o cartão de vidro em volta. */ semCartao?: boolean }) {
  const { palette, tokens } = useTheme();
  // Leitura real (bloco 86): o número no meio e o mudo que de fato está valendo. PC antigo
  // sem `volume.get` devolve 404 — aí fica sem número, como antes.
  const [vol, setVol] = useState<{ nivel: number; mudo: boolean } | null>(null);
  const lerVolume = useCallback(async () => {
    try { setVol(await callRpc(pairing, 'volume.get')); } catch { setVol(null); }
  }, [pairing]);
  useEffect(() => { lerVolume(); }, [lerVolume]);

  async function media(op: MediaOperation) {
    try {
      await callRpc(pairing, 'media.control', { operation: op });
    } catch (err) {
      onError(err, 'Falha no controle de mídia');
    }
  }

  async function volume(level: 'up' | 'down' | 'mute' | 'unmute' | number) {
    try {
      await callRpc(pairing, 'volume.set', { level });
    } catch (err) {
      onError(err, 'Falha ao ajustar o volume');
    }
    lerVolume();
  }

  // Durante o arrasto só manda (o slider já limita a um envio a cada 150 ms); a leitura de
  // volta vem ao soltar — reler a cada envio faria o polegar pular para trás no meio do gesto.
  async function arrastou(nivel: number, final: boolean) {
    try { await callRpc(pairing, 'volume.set', { level: nivel }); }
    catch (err) { if (final) onError(err, 'Falha ao ajustar o volume'); }
    if (final) lerVolume();
  }

  return (
    <Card glass={!semCartao} style={[{ paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md, gap: tokens.spacing.xs }, semCartao && { backgroundColor: 'transparent', borderWidth: 0 }]}>
      <View style={styles.barraMidia}>
        <View style={styles.grupoMidia}>
          {TECLAS_MIDIA.map(t => (
            <GlassCircle key={t.op} size={38} onPress={() => { haptica.leve(); media(t.op); }}>
              <Feather name={t.icone} size={17} color={palette.primary} />
            </GlassCircle>
          ))}
        </View>
        <View style={[styles.divisor, { backgroundColor: palette.glassBorder }]} />
        <GlassCircle accessibilityLabel="Silenciar" size={38} onPress={() => { haptica.leve(); volume(vol?.mudo ? 'unmute' : 'mute'); }}>
          <Feather name="volume-x" size={16} color={vol?.mudo ? palette.error : palette.textMuted} />
        </GlassCircle>
      </View>
      {/* O slider (fase 12) precisa da leitura real do volume; PC antigo sem `volume.get`
          fica com os botões de passo, como antes. */}
      {vol ? (
        <View style={styles.grupoMidia}>
          <Feather name="volume-1" size={15} color={palette.textMuted} />
          <SliderVolume nivel={vol.nivel} mudo={vol.mudo} aoMudar={arrastou} />
          <Text variant="caption" color={vol.mudo ? palette.error : palette.textMuted} style={{ minWidth: 38, textAlign: 'right' }}>
            {vol.mudo ? 'mudo' : `${vol.nivel}%`}
          </Text>
        </View>
      ) : (
        <View style={[styles.grupoMidia, { justifyContent: 'center' }]}>
          <GlassCircle accessibilityLabel="Abaixar o volume" size={38} onPress={() => { haptica.leve(); volume('down'); }}>
            <Feather name="volume-1" size={16} color={palette.primary} />
          </GlassCircle>
          <GlassCircle accessibilityLabel="Aumentar o volume" size={38} onPress={() => { haptica.leve(); volume('up'); }}>
            <Feather name="volume-2" size={16} color={palette.primary} />
          </GlassCircle>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  barraMidia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grupoMidia: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divisor: { width: 1, height: 22 },
});
