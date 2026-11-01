import { createContext, ReactNode, useContext, useEffect, useId, useLayoutEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../theme';
import { useAbaAtiva } from '../AbaViva';
import { GlassCircle } from './GlassSurface';

/**
 * Quem abre a gaveta de Ajustes.
 *
 * 🔴 AJUSTES SAIU DA BARRA DE ABAS. Ele ocupava um dos quatro lugares da navegação
 * inferior sem ser um destino: abre uma gaveta por cima da tela, e voltar dela não é
 * navegar. A barra de baixo ficou só com destinos reais (Início, Chat, PC) e o acionador
 * foi para o canto superior direito — a mesma solução que o desktop tomou no bloco 36.
 *
 * O acionador mora no topo flutuante porque toda tela tem um, e um contexto evita
 * passar a mesma função por cinco telas que não têm nada a ver com Ajustes.
 */
const AjustesContext = createContext<(() => void) | null>(null);

export function AjustesProvider({ abrir, children }: { abrir: () => void; children: ReactNode }) {
  return <AjustesContext.Provider value={abrir}>{children}</AjustesContext.Provider>;
}

/**
 * 01/11: sem tarja no topo. Cada tela diz o que quer nos cantos (`ScreenHeader`), e os botões
 * flutuam numa camada do App, FORA do alvo do vidro — só assim o vidro líquido deles dobra o
 * conteúdo que rola por baixo (de dentro das telas ele desenharia a si mesmo).
 */
type Topo = { left?: ReactNode; center?: ReactNode; right?: ReactNode; semAjustes?: boolean };
const topos = new Map<string, Topo>();
const ouvintes = new Set<() => void>();
let atual: { id: string; topo: Topo } | null = null;

function publicarTopo(id: string, topo: Topo | null) {
  // A última tela que ficou ativa vence (Conversas por cima do Chat, por exemplo): o Map guarda a
  // ordem de entrada, e atualizar uma tela que já está lá não a move.
  if (topo) topos.set(id, topo); else topos.delete(id);
  const ultimo = [...topos.entries()].pop();
  atual = ultimo ? { id: ultimo[0], topo: ultimo[1] } : null;
  ouvintes.forEach((f) => f());
}
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** Quanto o conteúdo de uma tela `flutuante` precisa sobrar em cima para começar abaixo dos botões. */
export function useFolgaDoTopo(): number {
  return useSafeAreaInsets().top + 8 + 40 + 8;
}

export function ScreenHeader({
  left,
  center,
  right,
  semAjustes = false,
  flutuante = false,
}: {
  /** Só documenta a tela: o nome não aparece mais (a barra de abas já diz onde se está). */
  title?: string;
  /** Telas empilhadas (Conversas, Histórico) não repetem a engrenagem. */
  semAjustes?: boolean;
  /** No meio do topo — o switch IA ↔ PC no Chat. */
  center?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /** A tela já sobra a folga no próprio conteúdo (que rola por baixo dos botões). Sem isto,
   *  um espaço vazio da altura do topo fica no lugar da tarja. */
  flutuante?: boolean;
}) {
  const id = useId();
  const ativa = useAbaAtiva();
  const folga = useFolgaDoTopo();
  // Sem dependências de propósito: os cantos levam closures da tela, que mudam a cada render.
  useLayoutEffect(() => { publicarTopo(id, ativa ? { left, center, right, semAjustes } : null); });
  useEffect(() => () => publicarTopo(id, null), [id]);
  return flutuante ? null : <View style={{ height: folga }} />;
}

/** A camada dos botões do topo. Montada no App por cima das telas, como a TabBar. */
export function TopoFlutuante() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const abrirAjustes = useContext(AjustesContext);
  const t = useSyncExternalStore(assinar, () => atual);
  if (!t) return null;
  const { left, center, right, semAjustes } = t.topo;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Só um véu sob o relógio do sistema, para o conteúdo que rola não brigar com ele. */}
      <LinearGradient pointerEvents="none" colors={[palette.background, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 12, opacity: 0.85 }} />
      <Animated.View key={t.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}
        pointerEvents="box-none" style={[styles.linha, { top: insets.top + 8 }]}>
        <View pointerEvents="box-none" style={[styles.lado, { alignItems: 'flex-start' }]}>{left}</View>
        {center}
        <View pointerEvents="box-none" style={[styles.lado, styles.direita]}>
          {right}
          {!semAjustes && abrirAjustes && (
            <GlassCircle accessibilityLabel="Ajustes" size={40} onPress={abrirAjustes}>
              <Feather name="settings" size={18} color={palette.textMuted} />
            </GlassCircle>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { position: 'absolute', left: 16, right: 16, height: 40, flexDirection: 'row', alignItems: 'center' },
  lado: { flex: 1 },
  direita: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
});
