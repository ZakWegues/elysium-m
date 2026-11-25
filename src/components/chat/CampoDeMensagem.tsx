import { forwardRef, ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, TextInput, TextStyle, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { alturaDoCampo, LINHA_DO_CAMPO, perto, PADDING_DO_CAMPO, proximoTamanho } from '../../lib/campoDeMensagem';
import { haptica } from '../../lib/haptica';
import { useTheme } from '../../theme';
import { Text } from '../ui';

/**
 * O campo de escrever dos dois lados do Chat (25/11 — "é só uma linha reta, não dá para ler o que
 * eu coloquei"). A altura vem de um texto espelho invisível, com a mesma fonte e largura: no Android
 * a altura automática do campo não é confiável. Cresce até 7 linhas e abre em meia tela.
 */
export const CampoDeMensagem = forwardRef<TextInput, {
  valor: string;
  aoMudar: (t: string) => void;
  aoEnviar: () => void;
  placeholder: string;
  max?: number;
  /** Os botões dos lados e quanto eles ocupam. Com mais de uma linha o campo toma a largura toda e
   *  eles descem — sem mudar de lugar na árvore, senão o teclado fecharia. */
  esquerda: ReactNode;
  direita: ReactNode;
  larguraEsquerda: number;
  larguraDireita: number;
}>(function CampoDeMensagem({ valor, aoMudar, aoEnviar, placeholder, max = 4000, esquerda, direita, larguraEsquerda, larguraDireita }, ref) {
  const { palette, tokens } = useTheme();
  const { height } = useWindowDimensions();
  const [medida, setMedida] = useState(0);
  const [aberto, setAberto] = useState(false);
  const { altura, linhas } = alturaDoCampo(valor ? medida : 0, aberto ? Math.round(height * 0.4) : null);
  // Mais largo, o mesmo texto volta a caber numa linha: sem guardar onde virou, ficaria piscando.
  const [virouCom, setVirouCom] = useState<number | null>(null);
  useEffect(() => { setVirouCom((v) => proximoTamanho(v, valor.length, linhas)); }, [valor.length, linhas]);
  const cartao = virouCom !== null || aberto;
  const fonte: TextStyle = { fontSize: tokens.fontSize.base, lineHeight: LINHA_DO_CAMPO, ...(palette.fontes ? { fontFamily: palette.fontes.texto[500] } : {}), includeFontPadding: false };
  const sobra = perto(valor.length, max);

  return (
    <View style={{ flex: 1, minHeight: 44 }}>
    <View style={[styles.caixa, cartao ? { marginBottom: 52 } : { marginLeft: larguraEsquerda, marginRight: larguraDireita }, { borderColor: cartao ? palette.bolhaMinhaBorda : palette.border, borderRadius: cartao ? 20 : 22, backgroundColor: palette.bolhaEla }]}>
      <RNText
        style={[fonte, styles.espelho, { right: cartao ? 40 : 16 }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        onLayout={(e) => setMedida(e.nativeEvent.layout.height)}
      >
        {/* O espaço no fim mede a linha nova que o cursor abriu. */}
        {valor.endsWith('\n') ? `${valor} ` : valor || ' '}
      </RNText>
      <TextInput
        ref={ref}
        style={[fonte, styles.campo, { height: altura, color: palette.text, paddingRight: cartao ? 40 : 16 }]}
        value={valor}
        onChangeText={(t) => { if (!t) setAberto(false); aoMudar(t); }}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        multiline
        textAlignVertical="top"
        // Uma linha: Enter envia. Cresceu (ou aberto): Enter pula linha, e o botão envia.
        submitBehavior={cartao ? 'newline' : 'submit'}
        returnKeyType={cartao ? 'default' : 'send'}
        onSubmitEditing={() => { if (!cartao) aoEnviar(); }}
        maxLength={max}
        scrollEnabled={altura < medida + PADDING_DO_CAMPO * 2}
      />
      {cartao ? (
        <Pressable onPress={() => { haptica.leve(); setAberto((v) => !v); }} hitSlop={8} style={styles.abrir}
          accessibilityRole="button" accessibilityLabel={aberto ? 'Diminuir o campo' : 'Aumentar o campo'}>
          <Feather name={aberto ? 'minimize-2' : 'maximize-2'} size={15} color={palette.textMuted} />
        </Pressable>
      ) : null}
      {sobra !== null ? (
        <Text variant="caption" color={sobra < 50 ? palette.error : palette.textMuted} style={styles.sobra}>{sobra}</Text>
      ) : null}
    </View>
    <View style={[styles.lado, { left: 0 }]}>{esquerda}</View>
    <View style={[styles.lado, { right: 0 }]}>{direita}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  caixa: { borderWidth: 1, overflow: 'hidden' },
  lado: { position: 'absolute', bottom: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  campo: { paddingVertical: PADDING_DO_CAMPO, paddingLeft: 16, margin: 0 },
  espelho: { position: 'absolute', left: 16, top: 0, opacity: 0 },
  abrir: { position: 'absolute', right: 6, top: 6, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  sobra: { position: 'absolute', right: 12, bottom: 6, fontSize: 11 },
});
