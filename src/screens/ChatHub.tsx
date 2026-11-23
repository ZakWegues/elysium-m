import { useEffect, useState } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, ReduceMotion } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { getActiveSessionId, setActiveSessionId } from '../lib/mailboxStore';
import { MOV } from '../lib/motion';
import { useTheme } from '../theme';
import { GlassCircle, ScreenHeader, Text, VIDRO_BOTAO } from '../components/ui';
import { VidroNativo, VIDRO_NATIVO } from '../components/vidro/VidroNativo';
import { AbaViva, useAbaAtiva } from '../components/AbaViva';
import ChatScreen from './ChatScreen';
import MailboxScreen from './MailboxScreen';
import MailboxHistorico from './MailboxHistorico';

/**
 * Chat e Caixa numa tela só, escolhidos por um switch.
 *
 * A Caixa era um destino próprio da TabBar, ocupando um dos cinco lugares para fazer o que
 * é, no fundo, o outro lado da mesma conversa — no desktop isso sempre foi um par de
 * botões dentro do chat. Aqui vira um switch centralizado no topo: à esquerda a IA, à
 * direita os recados que aparecem no PC.
 *
 * Fase 22: os presets saíram daqui para o "+" da barra de escrita; no canto direito fica só a
 * engrenagem de Ajustes, como no PC.
 * (Antes: o botão redondo no canto direito abria os presets — um popover ancorado,
 * como no desktop.)
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
  pedidoModo,
  perguntaPendente,
  onPerguntaEnviada,
  falaDaEly,
  onFalaDaElyMostrada,
  pedidoVoz,
  onPedidoVozTratado,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  sessionId: string | null;
  onSessionChange: (id: string | null) => void;
  onOpenConversations: () => void;
  naoLidos?: number;
  modoInicial?: 'ia' | 'pc';
  /** Cada pedido de lado (compartilhar, abrir conversa) é um número novo — ver App.tsx. */
  pedidoModo?: number;
  /** Texto vindo da busca da Início, para o chat da IA enviar assim que abrir. */
  perguntaPendente?: string | null;
  onPerguntaEnviada?: () => void;
  falaDaEly?: string | null;
  onFalaDaElyMostrada?: () => void;
  /** "Elysium" ouvido (bloco 129) — vai para o chat da IA, mesmo se o hub estava nos recados. */
  pedidoVoz?: { n: number; texto: string } | null;
  onPedidoVozTratado?: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [modo, setModo] = useState<'ia' | 'pc'>(modoInicial ?? 'ia');
  const ativa = useAbaAtiva();
  // 23/11 (o dono: "se eu troco para PC, ela para de pensar"): o lado que sai fica montado e
  // escondido. Antes a troca desmontava o Chat, que fechava a conexão e o PC descartava a resposta.
  // O PC só monta na primeira visita.
  const [pcMontado, setPcMontado] = useState(modoInicial === 'pc');
  useEffect(() => {
    if (modo === 'pc') setPcMontado(true);
    Keyboard.dismiss();
  }, [modo]);
  /** Uma resposta da IA chegou com ele no lado PC: acende o ponto no "IA". */
  const [respondeuFora, setRespondeuFora] = useState(false);
  useEffect(() => { if (modo === 'ia') setRespondeuFora(false); }, [modo]);
  useEffect(() => { if (pedidoVoz?.n) setModo('ia'); }, [pedidoVoz?.n]);
  // O Chat continua montado entre as abas (08/10): o lado pedido de fora vale a cada pedido.
  useEffect(() => { if (pedidoModo && modoInicial) setModo(modoInicial); }, [pedidoModo]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // 31/10: Voltar do Android fecha o histórico em vez de sair do app.
  useEffect(() => {
    if (!historicoPcAberto || !ativa) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setHistoricoPcAberto(false); return true; });
    return () => sub.remove();
  }, [historicoPcAberto, ativa]);

  const historicoPc = historicoPcAberto ? (
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
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <AbaViva ativa={!historicoPcAberto}>
      <ScreenHeader
        flutuante
        // Os dois cantos são o mesmo objeto: círculo de vidro, ícone fino em cor de
        // texto, sem glow. Antes o histórico era um ícone solto à esquerda e os presets
        // uma bolinha com borda à direita — dois pesos para dois alvos irmãos.
        left={
          <GlassCircle accessibilityLabel="Histórico"
            size={40}
            onPress={() => (modo === 'ia' ? onOpenConversations() : setHistoricoPcAberto(true))}
          >
            <Feather name="clock" size={17} color={palette.textMuted} />
          </GlassCircle>
        }
        center={<SwitchModo modo={modo} onTroca={setModo} temNovidade={(naoLidos ?? 0) > 0} novidadeIa={respondeuFora} />}
      />

      {/* As duas telas continuam inteiras e vivas; muda qual delas está à vista, e nenhuma desenha
          mais o próprio cabeçalho. */}
      <View style={{ flex: 1 }}>
        <AbaViva ativa={modo === 'ia'}>
          <ChatScreen
            onRespondeu={() => { if (modo !== 'ia') setRespondeuFora(true); }}
            perguntaPendente={perguntaPendente}
            onPerguntaEnviada={onPerguntaEnviada}
            falaDaEly={falaDaEly}
            onFalaDaElyMostrada={onFalaDaElyMostrada}
            pedidoVoz={pedidoVoz}
            onPedidoVozTratado={onPedidoVozTratado}
            pairing={pairing}
            onUnpair={onUnpair}
            sessionId={sessionId}
            onSessionChange={onSessionChange}
            onOpenConversations={onOpenConversations}
            semCabecalho
          />
        </AbaViva>
        {pcMontado ? (
          <AbaViva ativa={modo === 'pc'}>
          <MailboxScreen
            pairing={pairing}
            onUnpair={onUnpair}
            sessionId={mailboxSessionId}
            semCabecalho
          />
          </AbaViva>
        ) : null}
      </View>
      </AbaViva>
      {historicoPc}
    </View>
  );
}

/**
 * O switch. Um polegar deslizante em vez de dois botões que apagam e acendem: o traço
 * percorre a distância, e é esse percurso que diz de onde você veio.
 */
function SwitchModo({
  modo, onTroca, temNovidade, novidadeIa,
}: {
  modo: 'ia' | 'pc';
  onTroca: (m: 'ia' | 'pc') => void;
  temNovidade: boolean;
  /** Resposta da IA que chegou enquanto ele estava no PC. */
  novidadeIa: boolean;
}) {
  const { palette, tokens, familiaResolvida } = useTheme();
  // 01/11: a pílula também é vidro líquido nativo, e a gota da lente segue o polegar.
  const lente = !VIDRO_NATIVO || familiaResolvida === 'stark' ? 0 : 12;
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
      style={[styles.switch, VIDRO_BOTAO, { borderRadius: tokens.radii.full }, lente ? { backgroundColor: 'transparent', overflow: 'hidden' } : null]}
    >
      {lente > 0 && largura > 0 && (() => {
        const w = largura / 2 - 3;
        return (
          <VidroNativo alvo={null} lente={lente} brilho={0.4} segueAparelho={false}
            seletor={[3 + w / 2 + (modo === 'pc' ? w : 0), w / 2 - 4, 1]}
            reserva={<View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: VIDRO_BOTAO.backgroundColor }]} />} />
        );
      })()}
      {/* O polegar é um irmão atrás dos dois botões: o texto ativo não precisa de fundo
          próprio, e a troca é um único translate. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.polegar, { borderRadius: tokens.radii.full, backgroundColor: palette.primarySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.bolhaMinhaBorda }, polegarStyle]}
      />
      {(['ia', 'pc'] as const).map(m => (
        <Pressable
          key={m}
          onPress={() => trocar(m)}
          style={styles.lado}
          // O switch tem ~30 px de altura: o hitSlop leva o alvo aos 44 px (08/10).
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="tab"
          accessibilityState={{ selected: modo === m }}
          accessibilityLabel={m === 'ia' ? `Conversar com a IA${novidadeIa && modo !== 'ia' ? ', resposta nova' : ''}` : `Recados do PC${temNovidade && modo !== 'pc' ? ', com novidade' : ''}`}
        >
          <Feather
            name={m === 'ia' ? 'cpu' : 'monitor'}
            size={13}
            color={modo === m ? palette.primary : palette.textMuted}
          />
          <Text variant="caption" color={modo === m ? palette.primary : palette.textMuted}>
            {m === 'ia' ? 'IA' : 'PC'}
          </Text>
          {modo !== m && (m === 'pc' ? temNovidade : novidadeIa) && (
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


