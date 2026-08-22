import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { MOV, anima } from '../lib/motion';
import { useTheme } from '../theme';
import { GlassCircle, Popover, ScreenHeader, Text } from '../components/ui';
import ChatScreen from './ChatScreen';
import MailboxScreen from './MailboxScreen';
import MailboxHistorico from './MailboxHistorico';
import PresetsPopover from './PresetsPopover';

/**
 * Chat e Caixa numa tela só, escolhidos por um switch.
 *
 * A Caixa era um destino próprio da TabBar, ocupando um dos cinco lugares para fazer o que
 * é, no fundo, o outro lado da mesma conversa — no desktop isso sempre foi um par de
 * botões dentro do chat. Aqui vira um switch centralizado no topo: à esquerda a IA, à
 * direita os recados que aparecem no PC.
 *
 * O botão redondo no canto direito abre os presets. Não é uma aba: é um popover ancorado,
 * como no desktop.
 */
export default function ChatHub({
  pairing,
  onUnpair,
  sessionId,
  onSessionChange,
  onOpenConversations,
  /** Quantos recados não lidos — acende o ponto no lado "PC" do switch. */
  naoLidos,
  /** Compartilhar do Android cai aqui já no lado dos recados. */
  modoInicial,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  sessionId: string | null;
  onSessionChange: (id: string | null) => void;
  onOpenConversations: () => void;
  naoLidos?: number;
  modoInicial?: 'ia' | 'pc';
}) {
  const { palette, tokens } = useTheme();
  const [modo, setModo] = useState<'ia' | 'pc'>(modoInicial ?? 'ia');
  /**
   * Cada lado tem o seu histórico, e o botão de relógio abre o do lado em que você está.
   *
   * Antes ele abria as Conversas da IA sempre, inclusive estando nos recados do PC — o que
   * fazia parecer que os dois modos dividiam um histórico só. Os stores sempre foram
   * separados; era o botão que não sabia disso.
   */
  const [historicoPcAberto, setHistoricoPcAberto] = useState(false);
  const [presetsAberto, setPresetsAberto] = useState(false);
  const [ancora, setAncora] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const botaoRef = useRef<View>(null);

  function abrirPresets() {
    // `measureInWindow` mesmo com o popover já dentro da árvore: esta tela começa na
    // origem da janela, então as duas coordenadas coincidem, e medir na janela continua
    // sendo o único jeito que não depende de quantos pais existem no meio.
    botaoRef.current?.measureInWindow((x, y, width, height) => {
      setAncora({ x, y, width, height });
      setPresetsAberto(true);
    });
  }

  if (historicoPcAberto) {
    return <MailboxHistorico onFechar={() => setHistoricoPcAberto(false)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        // Os dois cantos são o mesmo objeto: círculo de vidro, ícone fino em cor de
        // texto, sem glow. Antes o histórico era um ícone solto à esquerda e os presets
        // uma bolinha com borda à direita — dois pesos para dois alvos irmãos.
        left={
          <GlassCircle
            size={34}
            onPress={() => (modo === 'ia' ? onOpenConversations() : setHistoricoPcAberto(true))}
          >
            <Feather name="clock" size={17} color={palette.textMuted} />
          </GlassCircle>
        }
        center={<SwitchModo modo={modo} onTroca={setModo} temNovidade={(naoLidos ?? 0) > 0} />}
        right={
          <View ref={botaoRef} collapsable={false}>
            <GlassCircle size={34} ativo={presetsAberto} onPress={abrirPresets}>
              <Feather name="sliders" size={17} color={presetsAberto ? palette.primary : palette.textMuted} />
            </GlassCircle>
          </View>
        }
      />

      {/* As duas telas continuam inteiras; o que muda é qual delas está montada e que
          nenhuma desenha mais o próprio cabeçalho. */}
      <View style={{ flex: 1 }}>
        {modo === 'ia' ? (
          <ChatScreen
            pairing={pairing}
            onUnpair={onUnpair}
            sessionId={sessionId}
            onSessionChange={onSessionChange}
            onOpenConversations={onOpenConversations}
            semCabecalho
          />
        ) : (
          <MailboxScreen pairing={pairing} onUnpair={onUnpair} semCabecalho />
        )}
      </View>

      <Popover visible={presetsAberto} onClose={() => setPresetsAberto(false)} anchor={ancora}>
        <PresetsPopover pairing={pairing} onFechar={() => setPresetsAberto(false)} />
      </Popover>
    </View>
  );
}

/**
 * O switch. Um polegar deslizante em vez de dois botões que apagam e acendem: o traço
 * percorre a distância, e é esse percurso que diz de onde você veio.
 */
function SwitchModo({
  modo, onTroca, temNovidade,
}: {
  modo: 'ia' | 'pc';
  onTroca: (m: 'ia' | 'pc') => void;
  temNovidade: boolean;
}) {
  const { palette, tokens } = useTheme();
  const x = useRef(new Animated.Value(modo === 'ia' ? 0 : 1)).current;
  const [largura, setLargura] = useState(0);

  function trocar(m: 'ia' | 'pc') {
    if (m === modo) return;
    onTroca(m);
    anima(x, m === 'ia' ? 0 : 1, MOV.base).start();
  }

  return (
    <View
      onLayout={e => setLargura(e.nativeEvent.layout.width)}
      style={[styles.switch, { borderRadius: tokens.radii.full, borderColor: palette.glassBorder, backgroundColor: palette.primarySoft }]}
    >
      {/* O polegar é um irmão atrás dos dois botões: o texto ativo não precisa de fundo
          próprio, e a troca é um único translate. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.polegar, {
          width: Math.max(0, largura / 2 - 3),
          borderRadius: tokens.radii.full,
          backgroundColor: palette.surfaceRaised,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, largura / 2 - 3)] }) }],
        }]}
      />
      {(['ia', 'pc'] as const).map(m => (
        <Pressable key={m} onPress={() => trocar(m)} style={styles.lado}>
          <Feather
            name={m === 'ia' ? 'cpu' : 'monitor'}
            size={13}
            color={modo === m ? palette.primary : palette.textMuted}
          />
          <Text variant="caption" color={modo === m ? palette.primary : palette.textMuted}>
            {m === 'ia' ? 'IA' : 'PC'}
          </Text>
          {m === 'pc' && temNovidade && modo !== 'pc' && (
            <View style={[styles.pontinho, { backgroundColor: palette.accent }]} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', padding: 3, borderWidth: StyleSheet.hairlineWidth, minWidth: 150 },
  polegar: { position: 'absolute', top: 3, bottom: 3, left: 3 },
  lado: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  pontinho: { width: 6, height: 6, borderRadius: 3 },
});
