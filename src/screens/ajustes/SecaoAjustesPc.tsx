import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../../lib/pairing';
import { callRpc, CampoAjustePc, GrupoAjustesPc } from '../../lib/rpc';
import { errMessage } from '../../lib/errors';
import { haptica } from '../../lib/haptica';
import { useTheme } from '../../theme';
import { Card, Text, VidroSwitch } from '../../components/ui';

/**
 * Ajustes do PC no celular (12/11, pedido do dono: o Cérebro, o modo sem censura e o resto dos
 * Ajustes do desktop, daqui). O PC manda o esquema (`pc.ajustes`) com o valor de agora; esta tela
 * só desenha: interruptor, lista de opções, faixa com − e +, e texto. Cada mudança grava na hora
 * (`pc.ajustes.set`) e volta o esquema novo. PC antigo (sem o método): avisa para atualizar.
 */
export function SecaoAjustesPc({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [grupos, setGrupos] = useState<GrupoAjustesPc[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    callRpc(pairing, 'pc.ajustes')
      .then((r) => { if (vivo) setGrupos(r.grupos); })
      .catch((e) => { if (vivo) setErro(/404|desconhecido|unknown/i.test(errMessage(e)) ? 'Atualize o ELYSIUM do PC para mudar os ajustes dele daqui.' : errMessage(e)); });
    return () => { vivo = false; };
  }, [pairing]);

  async function gravar(chave: string, valor: unknown) {
    setGravando(chave);
    // Otimista: o interruptor muda na hora; erro → volta.
    const antes = grupos;
    setGrupos((g) => g?.map((x) => ({ ...x, campos: x.campos.map((c) => (c.chave === chave ? { ...c, valor } : c)) })) ?? g);
    try {
      const r = await callRpc(pairing, 'pc.ajustes.set', { chave, valor });
      setGrupos(r.grupos);
      haptica.leve();
    } catch (e) {
      setGrupos(antes);
      Alert.alert('Não mudou no PC', errMessage(e));
    } finally {
      setGravando(null);
    }
  }

  if (erro) return <Card glass><Text variant="body" color={palette.textMuted}>{erro}</Text></Card>;
  if (!grupos) return <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />;

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      {grupos.map((g) => (
        <Card key={g.grupo} glass style={{ gap: tokens.spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="label" color={palette.textMuted}>{g.grupo.toUpperCase()}</Text>
            {g.nota ? <Text variant="caption" color={palette.textMuted}>{g.nota}</Text> : null}
          </View>
          {g.campos.map((c) => <Campo key={c.chave} campo={c} ocupado={gravando === c.chave} onMudar={(v) => void gravar(c.chave, v)} />)}
        </Card>
      ))}
    </View>
  );
}

function Campo({ campo: c, ocupado, onMudar }: { campo: CampoAjustePc; ocupado: boolean; onMudar: (v: unknown) => void }) {
  const { palette, tokens } = useTheme();
  const [texto, setTexto] = useState(typeof c.valor === 'string' ? c.valor : '');
  useEffect(() => { if (c.tipo === 'texto') setTexto(typeof c.valor === 'string' ? c.valor : ''); }, [c.valor, c.tipo]);

  const cabeca = (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="subheading">{c.rotulo}</Text>
      {c.dica ? <Text variant="caption" color={palette.textMuted}>{c.dica}</Text> : null}
    </View>
  );

  if (c.tipo === 'bool') {
    return (
      <View style={styles.linha}>
        {cabeca}
        <VidroSwitch value={c.valor === true} disabled={ocupado} onValueChange={(v) => onMudar(v)} accessibilityLabel={c.rotulo} />
      </View>
    );
  }
  if (c.tipo === 'faixa') {
    const n = typeof c.valor === 'number' ? c.valor : 0;
    const passo = (d: number) => { const v = Math.min(c.max, Math.max(c.min, n + d * c.passo)); if (v !== n) onMudar(v); };
    return (
      <View style={styles.linha}>
        {cabeca}
        <View style={styles.faixa}>
          <Pressable onPress={() => passo(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Diminuir ${c.rotulo}`} style={[styles.botaoFaixa, { borderColor: palette.border }]}>
            <Feather name="minus" size={16} color={palette.text} />
          </Pressable>
          <Text variant="body" style={{ minWidth: 44, textAlign: 'center' }}>{`${n > 0 ? '+' : ''}${n}${c.unidade}`}</Text>
          <Pressable onPress={() => passo(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Aumentar ${c.rotulo}`} style={[styles.botaoFaixa, { borderColor: palette.border }]}>
            <Feather name="plus" size={16} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }
  if (c.tipo === 'texto') {
    return (
      <View style={{ gap: 6 }}>
        {cabeca}
        <TextInput
          value={texto}
          onChangeText={setTexto}
          onEndEditing={() => { if (texto.trim() !== (typeof c.valor === 'string' ? c.valor : '')) onMudar(texto.trim()); }}
          maxLength={c.max}
          placeholderTextColor={palette.textMuted}
          placeholder="(vazio)"
          style={{ color: palette.text, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: tokens.radii.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
        />
      </View>
    );
  }
  // select: as opções em pílulas (poucas) — a escolhida acesa.
  return (
    <View style={{ gap: 8 }}>
      {cabeca}
      <View style={styles.opcoes}>
        {c.opcoes.map(([valor, rotulo]) => {
          const sel = c.valor === valor;
          return (
            <Pressable key={valor} disabled={ocupado} onPress={() => { if (!sel) onMudar(valor); }} accessibilityRole="radio" accessibilityState={{ selected: sel }}
              style={[styles.opcao, { borderColor: sel ? palette.primary : palette.border, backgroundColor: sel ? palette.primarySoft : 'transparent' }]}>
              <Text variant="caption" color={sel ? palette.text : palette.textMuted}>{rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  botaoFaixa: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
