import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Text } from './Text';

/**
 * "Feito · Desfazer" por 5 s (fase 18, 08/10) — o padrão do Gmail e do Todoist que a pesquisa
 * apontou como o que mais tira o medo de agir rápido. Em vez de "tem certeza?" antes de
 * concluir ou apagar, a ação acontece e dá para voltar.
 *
 * Uso: `const desfazer = useDesfazer()`; `desfazer.mostrar('Tarefa apagada', voltar, efetivar)`
 * e `<Snackbar estado={desfazer} />`. `efetivar` roda quando o tempo acaba sem desfazer
 * (é ali que o apagar vai de fato para o PC); `voltar` roda no toque em Desfazer.
 */
export type EstadoDesfazer = ReturnType<typeof useDesfazer>;

const DURACAO_MS = 5000;

export function useDesfazer() {
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null);
  const pendente = useRef<{ id: number; voltar: () => void; efetivar?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fechar = useCallback((efetivar: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pendente.current;
    pendente.current = null;
    setAviso(null);
    if (p && efetivar) p.efetivar?.();
  }, []);

  const mostrar = useCallback((texto: string, voltar: () => void, efetivar?: () => void) => {
    // Um aviso novo efetiva o anterior: dois "desfazer" ao mesmo tempo confundiriam.
    if (pendente.current) fechar(true);
    const id = Date.now();
    pendente.current = { id, voltar, efetivar };
    setAviso({ id, texto });
    timer.current = setTimeout(() => fechar(true), DURACAO_MS);
  }, [fechar]);

  const desfazer = useCallback(() => {
    const p = pendente.current;
    fechar(false);
    p?.voltar();
  }, [fechar]);

  // Saiu da tela com um apagar pendente: efetiva (não deixa o apagar perdido no ar).
  useEffect(() => () => { if (pendente.current) { pendente.current.efetivar?.(); pendente.current = null; } if (timer.current) clearTimeout(timer.current); }, []);

  return { aviso, mostrar, desfazer, fechar };
}

export function Snackbar({ estado }: { estado: EstadoDesfazer }) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  if (!estado.aviso) return null;
  return (
    <View pointerEvents="box-none" style={[styles.camada, { bottom: insets.bottom + 16 }]}>
      <Animated.View
        key={estado.aviso.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(140)}
        accessibilityLiveRegion="polite"
        style={[styles.barra, { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: tokens.radii.md }]}
      >
        <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>{estado.aviso.texto}</Text>
        <Pressable onPress={estado.desfazer} hitSlop={10} accessibilityRole="button" accessibilityLabel="Desfazer" style={styles.botao}>
          <Text variant="label" color={palette.primary}>DESFAZER</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', left: 16, right: 16, zIndex: 60, elevation: 60 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 6, minHeight: 52, borderWidth: 1, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  botao: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
