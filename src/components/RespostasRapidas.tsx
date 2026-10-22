import { Pressable, StyleSheet, View } from 'react-native';
import AnimatedReanimated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { comAlfa, useTheme } from '../theme';
import { Text } from './ui';
import { haptica } from '../lib/haptica';
import type { BotaoRapido } from '../lib/respostasRapidas';

/**
 * Respostas rápidas (22/10): a linha de botões embaixo da última resposta da Ely. Entram em
 * cascata de 30 ms e somem quando ele responde. Toque grande (44 px de altura útil).
 */
export function RespostasRapidas({ botoes, onEscolher, onOutra }: { botoes: BotaoRapido[]; onEscolher: (texto: string) => void; onOutra: () => void }) {
  const { palette, tokens } = useTheme();
  if (!botoes.length) return null;
  return (
    <View style={styles.linha}>
      {botoes.map((b, i) => {
        const forte = b.tipo === 'forte' || b.tipo === 'sugestao';
        return (
          <AnimatedReanimated.View key={`${b.tipo}-${b.rotulo}`}
            entering={FadeInDown.duration(220).delay(i * 30).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}>
            <Pressable
              onPress={() => { haptica.leve(); if (b.tipo === 'outra') onOutra(); else onEscolher(b.valor); }}
              accessibilityRole="button" accessibilityLabel={b.tipo === 'outra' ? 'Escrever outra resposta' : `Responder: ${b.rotulo}`}
              hitSlop={6}
              style={({ pressed }) => [styles.botao, {
                borderRadius: tokens.radii.lg,
                borderColor: forte ? comAlfa(palette.primary, 0.4) : palette.border,
                borderStyle: b.tipo === 'outra' ? 'dashed' : 'solid',
                backgroundColor: forte ? palette.primarySoft : 'transparent',
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}>
              <Text variant="caption" color={forte ? palette.text : palette.textMuted} numberOfLines={1}>{b.rotulo}</Text>
            </Pressable>
          </AnimatedReanimated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'flex-start', maxWidth: '92%', marginTop: -2, marginBottom: 6 },
  botao: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, maxWidth: 260 },
});
