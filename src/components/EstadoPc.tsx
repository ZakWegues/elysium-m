import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { cancelAnimation, FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { Text } from './ui';
import { avisoDeSomPc, descreverEstadoPc, detalhesEstadoPc, useEstadoPc, type Tom } from '../lib/estadoPc';
import { haptica } from '../lib/haptica';
import { MOV } from '../lib/motion';
import { useAbaAtiva } from './AbaViva';

/**
 * A linha "em que pé está o PC" da Início (08/10): ELYSIUM na tela, minimizado, na bandeja,
 * tela bloqueada, fechado, PC desligado ou dormindo — com há quanto tempo. Tocar abre os
 * detalhes (desde quando o app está no ar, PC ligado há, como terminou a sessão anterior).
 */
export function EstadoPcLinha({ extra }: { extra?: string }) {
  const { palette, tokens } = useTheme();
  const s = useEstadoPc();
  const [aberto, setAberto] = useState(false);
  // "há 5 min" envelhece sozinho: redesenha a cada 30 s.
  const [, setTique] = useState(0);
  useEffect(() => { const t = setInterval(() => setTique(n => n + 1), 30_000); return () => clearInterval(t); }, []);

  const d = descreverEstadoPc(s);
  const cor = corDoTom(d.tom, palette);
  const linhas = aberto ? detalhesEstadoPc(s) : [];
  const som = avisoDeSomPc(s);

  return (
    <Animated.View layout={LinearTransition.duration(MOV.base).reduceMotion(ReduceMotion.System)}>
      <Pressable
        onPress={() => { haptica.leve(); setAberto(v => !v); }}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        accessibilityLabel={`${d.titulo}${d.detalhe ? `, ${d.detalhe}` : ''}. Toque para ${aberto ? 'fechar' : 'ver'} os detalhes.`}
        style={[styles.linha, { paddingHorizontal: 4, minHeight: 32 }]}
        hitSlop={6}
      >
        <Ponto cor={cor} vivo={d.tom === 'ok'} />
        <Feather name={d.icone} size={13} color={cor} />
        <Text variant="caption" color={palette.text} numberOfLines={1} style={{ flexShrink: 1 }}>
          {d.titulo}
          <Text variant="caption" color={palette.textMuted}>{d.detalhe ? ` · ${d.detalhe}` : ''}{extra ?? ''}</Text>
        </Text>
        <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={13} color={palette.textMuted} style={{ marginLeft: 'auto' }} />
      </Pressable>
      {som && (
        <View style={[styles.linha, { paddingHorizontal: 4, minHeight: 24 }]} accessibilityRole="alert">
          <Feather name="volume-x" size={13} color={palette.accent} />
          <Text variant="caption" color={palette.accent} style={{ flexShrink: 1 }}>{som}</Text>
        </View>
      )}
      {aberto && linhas.length > 0 && (
        <Animated.View
          entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System)}
          style={[styles.detalhes, { borderColor: palette.glassBorder, backgroundColor: palette.glassSurface, borderRadius: tokens.radii.md }]}
        >
          {linhas.map(l => (
            <View key={l.rotulo} style={styles.par}>
              <Text variant="caption" color={palette.textMuted} style={{ width: 118 }}>{l.rotulo}</Text>
              <Text variant="caption" color={palette.text} style={{ flex: 1 }}>{l.valor}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function corDoTom(tom: Tom, palette: ReturnType<typeof useTheme>['palette']): string {
  return tom === 'ok' ? palette.success : tom === 'erro' ? palette.error : tom === 'aviso' ? palette.accent : tom === 'calmo' ? palette.primary : palette.textMuted;
}

/** O ponto colorido; "respira" quando o ELYSIUM está aberto e respondendo. */
function Ponto({ cor, vivo }: { cor: string; vivo: boolean }) {
  const a = useSharedValue(1);
  // 31/10: parado com a aba escondida.
  const ativa = useAbaAtiva();
  useEffect(() => {
    a.value = vivo && ativa
      ? withRepeat(withSequence(withTiming(0.35, { duration: 1100, reduceMotion: ReduceMotion.System }), withTiming(1, { duration: 1100, reduceMotion: ReduceMotion.System })), -1)
      : withTiming(1, { duration: 200 });
    return () => cancelAnimation(a);
  }, [vivo, a, ativa]);
  const st = useAnimatedStyle(() => ({ opacity: a.value }));
  return <Animated.View style={[styles.ponto, { backgroundColor: cor }, st]} />;
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  detalhes: { marginTop: 6, padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  par: { flexDirection: 'row', gap: 8 },
});
