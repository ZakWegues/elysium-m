import { createContext, ReactNode, useContext } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { GlassCircle, GlassFill } from './GlassSurface';
import { Text } from './Text';

/**
 * Quem abre a gaveta de Ajustes.
 *
 * 🔴 AJUSTES SAIU DA BARRA DE ABAS. Ele ocupava um dos quatro lugares da navegação
 * inferior sem ser um destino: abre uma gaveta por cima da tela, e voltar dela não é
 * navegar. A barra de baixo ficou só com destinos reais (Início, Chat, PC) e o acionador
 * foi para o canto superior direito — a mesma solução que o desktop tomou no bloco 36.
 *
 * O acionador mora no `ScreenHeader` porque toda tela já tem um, e um contexto evita
 * passar a mesma função por cinco telas que não têm nada a ver com Ajustes.
 */
const AjustesContext = createContext<(() => void) | null>(null);

export function AjustesProvider({ abrir, children }: { abrir: () => void; children: ReactNode }) {
  return <AjustesContext.Provider value={abrir}>{children}</AjustesContext.Provider>;
}

export function ScreenHeader({
  title,
  left,
  center,
  right,
  semAjustes = false,
  style,
  ...rest
}: ViewProps & {
  title?: string;
  /** Telas empilhadas (Conversas, Histórico) não repetem a engrenagem. */
  semAjustes?: boolean;
  /** Ocupa o lugar do título — usado pelo switch IA ↔ PC no Chat. */
  center?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const abrirAjustes = useContext(AjustesContext);

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Um dos dois únicos desfoques REAIS que rolam junto com o conteúdo (o outro é a
          TabBar). Sobe menos que os painéis de texto: o cabeçalho nunca esteve ilegível,
          e é a superfície mais cara do app por acompanhar a rolagem. */}
      <GlassFill intensity={45} strong edge={false} />
      <View
        style={[
          styles.row,
          {
            paddingTop: insets.top + tokens.spacing.sm,
            paddingHorizontal: tokens.spacing.lg,
            paddingBottom: tokens.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: palette.glassBorder,
          },
          style,
        ]}
        {...rest}
      >
        {left}
        {center ?? <Text variant="heading">{title}</Text>}
        <View style={styles.direita}>
          {right}
          {!semAjustes && abrirAjustes && (
            <GlassCircle size={32} onPress={abrirAjustes}>
              <Feather name="settings" size={17} color={palette.textMuted} />
            </GlassCircle>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  direita: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
