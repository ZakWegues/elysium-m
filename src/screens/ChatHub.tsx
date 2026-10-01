import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, ReduceMotion } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { getActiveSessionId, setActiveSessionId } from '../lib/mailboxStore';
import { MOV } from '../lib/motion';
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
  perguntaPendente,
  onPerguntaEnviada,
  pedidoVoz,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  sessionId: string | null;
  onSessionChange: (id: string | null) => void;
  onOpenConversations: () => void;
  naoLidos?: number;
  modoInicial?: 'ia' | 'pc';
  /** Texto vindo da busca da Início, para o chat da IA enviar assim que abrir. */
  perguntaPendente?: string | null;
  onPerguntaEnviada?: () => void;
  /** "Elysium" ouvido (bloco 129) — vai para o chat da IA, mesmo se o hub estava nos recados. */
  pedidoVoz?: { n: number; texto: string } | null;
}) {
  const { palette, tokens } = useTheme();
  const [modo, setModo] = useState<'ia' | 'pc'>(modoInicial ?? 'ia');
  useEffect(() => { if (pedidoVoz?.n) setModo('ia'); }, [pedidoVoz?.n]);
  /**
   * Cada lado tem o seu histórico, e o botão de relógio abre o do lado em que você está.
   *
   * Antes ele abria as Conversas da IA sempre, inclusive estando nos recados do PC — o que
   * fazia parecer que os dois modos dividiam um histórico só. Os stores sempre foram
   * separados; era o botão que não sabia disso.
   */
  const [historicoPcAberto, setHistoricoPcAberto] = useState(false);
  /**
   * Conversa aberta do lado PC. Mora aqui, e não dentro da Caixa, pelo mesmo motivo que
   * o `sessionId` da IA mora acima deste componente: quem troca de conversa é o histórico,
   * que é irmão da tela e não filho dela.
   *
   * `null` deixa o PC decidir (a conversa ativa dele) — é o que mantém a tela funcionando
   * contra um desktop que ainda não conhece conversas separadas.
   */
  const [mailboxSessionId, setMailboxSessionId] = useState<string | null>(null);

  useEffect(() => {
    getActiveSessionId()
      .then(id => setMailboxSessionId(id))
      .catch(err => console.warn('[caixa] falha lendo a conversa ativa', err));
  }, []);
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
    return (
      <MailboxHistorico
        pairing={pairing}
        sessionId={mailboxSessionId}
        onSelecionar={(id) => {
          // String vazia = a conversa aberta foi apagada; volta a deixar o PC decidir.
          const alvo = id || null;
          setMailboxSessionId(alvo);
          setActiveSessionId(alvo).catch(() => {});
          if (id) setHistoricoPcAberto(false);
        }}
        onFechar={() => setHistoricoPcAberto(false)}
      />
    );
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
            perguntaPendente={perguntaPendente}
            onPerguntaEnviada={onPerguntaEnviada}
            pedidoVoz={pedidoVoz}
            pairing={pairing}
            onUnpair={onUnpair}
            sessionId={sessionId}
            onSessionChange={onSessionChange}
            onOpenConversations={onOpenConversations}
            semCabecalho
          />
        ) : (
          <MailboxScreen
            pairing={pairing}
            onUnpair={onUnpair}
            sessionId={mailboxSessionId}
            semCabecalho
          />
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
  // `x` vai de 0 (ia) a 1 (pc).
  const x = useSharedValue(modo === 'ia' ? 0 : 1);
  const [largura, setLargura] = useState(0);

  // Sincroniza se a prop mudar de fora (ex: share intent do Android mandando abrir a Caixa)
  useEffect(() => {
    x.value = withTiming(modo === 'ia' ? 0 : 1, { duration: MOV.base, reduceMotion: ReduceMotion.System });
  }, [modo, x]);

  function trocar(m: 'ia' | 'pc') {
    if (m === modo) return;
    onTroca(m);
    // a mola viaja no useEffect acima quando `modo` mudar e re-renderizar
  }

  const polegarStyle = useAnimatedStyle(() => {
    const w = Math.max(0, largura / 2 - 3);
    return {
      width: w,
      transform: [{ translateX: x.value * w }],
    };
  });

  return (
    <View
      onLayout={e => setLargura(e.nativeEvent.layout.width)}
      style={[styles.switch, { borderRadius: tokens.radii.full, borderColor: palette.glassBorder, backgroundColor: palette.primarySoft }]}
    >
      {/* O polegar é um irmão atrás dos dois botões: o texto ativo não precisa de fundo
          próprio, e a troca é um único translate. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.polegar, { borderRadius: tokens.radii.full, backgroundColor: palette.surfaceRaised }, polegarStyle]}
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


