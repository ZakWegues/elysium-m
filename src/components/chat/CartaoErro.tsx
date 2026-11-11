import { StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { Text, Toque } from '../ui';
import { MOV } from '../../lib/motion';

export type AcaoErro = 'refazer' | 'depois' | 'cancelar';

/**
 * Erro no chat como cartão com saída (26/10, pedido do dono): antes era texto vermelho solto, e as
 * mensagens mandavam "tocar em Refazer" num botão que não existia na bolha. Aqui cada erro tem
 * título curto, o detalhe apagado e só botões que funcionam.
 */
export function CartaoErro({
  titulo, detalhe, acoes, fila, onAcao,
}: {
  titulo: string;
  detalhe?: string;
  acoes: AcaoErro[];
  /** O comando foi guardado para mandar depois (não é falha, é espera). */
  fila?: boolean;
  onAcao: (a: AcaoErro) => void;
}) {
  const { palette, tokens } = useTheme();
  const cor = fila ? palette.primary : palette.error;
  const rotulo: Record<AcaoErro, string> = { refazer: 'Refazer', depois: 'Mandar depois', cancelar: 'Cancelar envio' };
  return (
    <Animated.View
      entering={FadeInDown.withInitialValues({ transform: [{ translateY: 6 }] }).duration(MOV.base).reduceMotion(ReduceMotion.System)}
      style={[styles.cartao, { borderRadius: tokens.radii.lg, borderColor: palette.border, backgroundColor: palette.bolhaEla }]}
    >
      <View style={styles.topo}>
        <View style={[styles.placa, { backgroundColor: fila ? palette.primarySoft : palette.errorSoft }]}>
          <Feather name={fila ? 'clock' : 'alert-circle'} size={16} color={cor} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{titulo}</Text>
          {detalhe ? <Text variant="caption" color={palette.textMuted}>{detalhe}</Text> : null}
        </View>
      </View>
      {acoes.length > 0 && (
        <View style={styles.botoes}>
          {acoes.map((a, i) => (
            <Toque key={a} onPress={() => onAcao(a)} haptico="leve"
              style={[styles.botao, { borderRadius: tokens.radii.full, backgroundColor: i === 0 && a !== 'cancelar' ? palette.primary : 'transparent', borderColor: i === 0 && a !== 'cancelar' ? palette.primary : palette.border }]}>
              <Text variant="label" style={{ fontSize: 13 }} color={i === 0 && a !== 'cancelar' ? palette.onPrimary : palette.text}>{rotulo[a]}</Text>
            </Toque>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** Título e detalhe de um erro do chat a partir da mensagem técnica. Pura. */
export function textoDoErro(msg: string): { titulo: string; detalhe?: string } {
  if (/parou de responder|inatividade/i.test(msg)) return { titulo: 'O PC parou de responder no meio', detalhe: 'A resposta não chegou inteira.' };
  if (/conexão caiu|se perdeu/i.test(msg)) return { titulo: 'A conexão caiu', detalhe: 'A resposta se perdeu no caminho.' };
  if (/sem conexão com o pc/i.test(msg)) return { titulo: 'Sem conexão com o PC agora', detalhe: 'A resposta fica guardada no PC por 10 minutos.' };
  if (/respondeu com erro/i.test(msg)) return { titulo: 'O PC não conseguiu fazer isso', detalhe: msg.replace(/^O PC respondeu com erro:\s*/i, '') };
  return { titulo: 'Não deu certo', detalhe: msg };
}

const styles = StyleSheet.create({
  cartao: { alignSelf: 'stretch', marginVertical: 4, padding: 12, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  topo: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  placa: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botao: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
});
