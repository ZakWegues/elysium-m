import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Text } from './ui';
import { Reator } from './Reator';
import { pararDeFalar, pausarFala, retomarFala, useFala } from '../lib/falar';
import { haptica } from '../lib/haptica';

const RECOLHER_MS = 5000;

/**
 * "Ely falando" — a pílula que segue a fala por todas as abas (08/10, substitui o
 * `BotaoInterromper` de 02/10).
 *
 * O Zak pôs a Ely para ler o resumo e trocou de aba: a tela desmontava, a fala parava, e o
 * resumo não servia para nada. Agora a fala não depende de tela nenhuma e esta pílula mora no
 * App, por cima de tudo. Fechada é discreta (o reator girando + "Falando"); um toque abre,
 * com uma mola na largura, e mostra o trecho atual, Pausar ⇄ Retomar e Parar. Recolhe sozinha
 * depois de 5 s sem toque, ou com um toque fora.
 *
 * Fica a 64 px do topo pelo mesmo motivo da pílula antiga: embaixo cobriria o campo de texto
 * e a barra de abas, e colada no topo tapava o switch IA/PC do Chat.
 */
export function FalaFlutuante() {
  const fala = useFala();
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [aberta, setAberta] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adiarRecolher = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberta(false), RECOLHER_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // A fala acabou: a pílula some fechada, para a próxima nascer fechada também.
  useEffect(() => { if (!fala.falando) setAberta(false); }, [fala.falando]);

  if (!fala.falando) return null;

  const abrir = () => { haptica.leve(); setAberta(true); adiarRecolher(); };
  const alternar = () => {
    haptica.leve();
    if (fala.pausada) retomarFala(); else pausarFala();
    adiarRecolher();
  };
  const parar = () => { haptica.medio(); pararDeFalar(); };

  return (
    <>
      {/* Toque fora recolhe. Só existe aberta — fechada, a pílula não rouba toque de ninguém. */}
      {aberta && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 49 }]} onPress={() => setAberta(false)} accessible={false} />}
      <View pointerEvents="box-none" style={[styles.camada, { top: insets.top + 64 }]}>
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          layout={LinearTransition.springify().damping(18).stiffness(220)}
          style={[
            styles.pilula,
            {
              backgroundColor: palette.surface,
              borderColor: palette.primary,
              borderRadius: aberta ? tokens.radii.xl : 24,
              width: aberta ? 320 : undefined,
              maxWidth: '92%',
            },
          ]}
        >
          {!aberta ? (
            <Pressable
              onPress={abrir}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={fala.pausada ? 'Fala da Ely pausada. Abrir controles' : 'Ely falando. Abrir controles'}
              style={styles.fechada}
            >
              <Reator tamanho={26} fracao={fala.total > 1 ? fala.parte / fala.total : 1} vivo={!fala.pausada} />
              <Text variant="caption" color={palette.primary}>{fala.pausada ? 'Pausada' : 'Falando'}</Text>
              <Feather name="chevron-down" size={14} color={palette.primary} />
            </Pressable>
          ) : (
            <Animated.View entering={FadeIn.duration(180).delay(60)} style={styles.aberta}>
              <View style={styles.topo}>
                <Reator tamanho={34} fracao={fala.total > 1 ? fala.parte / fala.total : 1} vivo={!fala.pausada} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" color={palette.primary}>
                    {fala.pausada ? 'ELY · PAUSADA' : 'ELY · FALANDO'}{fala.total > 1 ? `  ${fala.parte}/${fala.total}` : ''}
                  </Text>
                  <Text variant="caption" color={palette.textMuted} numberOfLines={2}>{fala.trecho}</Text>
                </View>
              </View>
              <View style={styles.botoes}>
                <Pressable
                  onPress={alternar}
                  accessibilityRole="button"
                  accessibilityLabel={fala.pausada ? 'Retomar a fala' : 'Pausar a fala'}
                  style={({ pressed }) => [styles.botao, { backgroundColor: palette.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  {/* A troca do ícone é uma animação curta: o botão "vira" play, não pisca. */}
                  <Animated.View key={fala.pausada ? 'play' : 'pause'} entering={ZoomIn.duration(160)} exiting={ZoomOut.duration(120)}>
                    <Feather name={fala.pausada ? 'play' : 'pause'} size={18} color={palette.background} />
                  </Animated.View>
                  <Text variant="label" color={palette.background}>{fala.pausada ? 'Retomar' : 'Pausar'}</Text>
                </Pressable>
                <Pressable
                  onPress={parar}
                  accessibilityRole="button"
                  accessibilityLabel="Parar a fala"
                  style={({ pressed }) => [styles.botao, { borderWidth: 1, borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Feather name="square" size={16} color={palette.text} />
                  <Text variant="label">Parar</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50, elevation: 50 },
  pilula: { borderWidth: 1, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  fechada: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 10, paddingRight: 14 },
  aberta: { padding: 14, gap: 12 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  botoes: { flexDirection: 'row', gap: 10 },
  botao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 22 },
});
