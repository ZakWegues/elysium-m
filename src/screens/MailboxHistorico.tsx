import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { MailboxMessage } from '../lib/mailbox';
import { loadCache, loadFavorites } from '../lib/mailboxStore';
import { useTheme } from '../theme';
import { Card, ScreenHeader, Text } from '../components/ui';

/**
 * Histórico do lado "PC" — os recados trocados entre celular e computador.
 *
 * 🔴 POR QUE ESTA TELA PASSOU A EXISTIR: o botão de relógio do `ChatHub` abria a tela de
 * Conversas independentemente do lado em que você estava. Estando nos recados do PC, ele
 * mostrava o histórico da **IA** — dois assuntos diferentes atrás do mesmo botão, dando a
 * impressão de que os dois modos dividiam o mesmo histórico. Eles nunca dividiram: são
 * dois stores separados (`elysium_chat_sessions` e `elysium_mailbox_cache`). O que faltava
 * era o histórico do segundo ter tela própria.
 *
 * Lê do cache local de propósito, sem pedir nada ao PC: quem abre o histórico quer procurar
 * uma coisa que já viu, e isso tem que funcionar com o PC desligado.
 */
export default function MailboxHistorico({ onFechar }: { onFechar: () => void }) {
  const { palette, tokens } = useTheme();
  const [mensagens, setMensagens] = useState<MailboxMessage[]>([]);
  const [favoritos, setFavoritos] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState('');
  const [soFavoritos, setSoFavoritos] = useState(false);

  useEffect(() => {
    (async () => {
      const [cache, favs] = await Promise.all([loadCache(), loadFavorites()]);
      setMensagens(cache.messages);
      setFavoritos(favs);
    })().catch(err => console.error('[histórico-pc] falha lendo o cache', err));
  }, []);

  /**
   * A lista sai do mais novo para o mais antigo, ao contrário da conversa.
   *
   * Na conversa o fim é o presente e é para lá que se olha. Num histórico a pergunta é
   * "o que eu mandei ontem?", e obrigar a rolar até o fim para achar o recente seria
   * repetir na busca o mesmo incômodo que a conversa acabou de resolver.
   */
  const { linhas, total } = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = mensagens
      .filter(m => (soFavoritos ? favoritos[m.id] : true))
      .filter(m => {
        if (!termo) return true;
        const texto = m.text ?? m.attachment?.name ?? '';
        return texto.toLowerCase().includes(termo);
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    // Cabeçalho de dia intercalado, em vez de `SectionList`: são poucos itens e uma lista
    // só evita ter duas formas de renderizar a mesma bolha.
    const out: ({ tipo: 'dia'; chave: string; rotulo: string } | { tipo: 'msg'; chave: string; msg: MailboxMessage })[] = [];
    let diaAtual = '';
    for (const m of filtradas) {
      const dia = rotuloDoDia(m.createdAt);
      if (dia !== diaAtual) {
        diaAtual = dia;
        out.push({ tipo: 'dia', chave: `dia-${dia}`, rotulo: dia });
      }
      out.push({ tipo: 'msg', chave: m.id, msg: m });
    }
    return { linhas: out, total: filtradas.length };
  }, [mensagens, favoritos, busca, soFavoritos]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Histórico do PC"
        left={
          <Pressable onPress={onFechar} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={palette.text} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => setSoFavoritos(v => !v)} hitSlop={8}>
            <Feather name="star" size={18} color={soFavoritos ? palette.accent : palette.textMuted} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.sm }}>
        <View style={[styles.busca, {
          borderRadius: tokens.radii.full,
          borderColor: palette.glassBorder,
          backgroundColor: palette.glassSurface,
        }]}>
          <Feather name="search" size={15} color={palette.textMuted} />
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Procurar nos recados"
            placeholderTextColor={palette.textMuted}
            style={{ flex: 1, color: palette.text, fontSize: 14, paddingVertical: 0 }}
          />
          {busca.length > 0 && (
            <Pressable onPress={() => setBusca('')} hitSlop={8}>
              <Feather name="x" size={15} color={palette.textMuted} />
            </Pressable>
          )}
        </View>
        <Text variant="caption" color={palette.textMuted} style={{ marginTop: 6 }}>
          {total === 0 ? 'Nada encontrado' : `${total} recado${total > 1 ? 's' : ''}`}
          {soFavoritos ? ' · só favoritos' : ''}
        </Text>
      </View>

      <FlatList
        data={linhas}
        keyExtractor={item => item.chave}
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingTop: 0, gap: tokens.spacing.sm }}
        renderItem={({ item }) => {
          if (item.tipo === 'dia') {
            return (
              <Text variant="label" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
                {item.rotulo}
              </Text>
            );
          }
          const m = item.msg;
          const meu = m.from === 'mobile';
          return (
            <Card glass style={{ gap: 4 }}>
              <View style={styles.linha}>
                <Feather
                  name={meu ? 'smartphone' : 'monitor'}
                  size={12}
                  color={meu ? palette.primary : palette.accent}
                />
                <Text variant="caption" color={palette.textMuted}>
                  {meu ? 'Do celular' : 'Do PC'} · {hora(m.createdAt)}
                </Text>
                {favoritos[m.id] && (
                  <Feather name="star" size={12} color={palette.accent} style={{ marginLeft: 'auto' }} />
                )}
              </View>
              {m.text ? (
                <Text variant="body">{m.text}</Text>
              ) : (
                <View style={styles.linha}>
                  <Feather name="paperclip" size={13} color={palette.textMuted} />
                  <Text variant="body" color={palette.textMuted}>
                    {m.attachment?.name ?? 'Anexo'}
                  </Text>
                </View>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          <Text variant="caption" color={palette.textMuted}>
            {mensagens.length === 0
              ? 'Nenhum recado guardado ainda. Abra a conversa com o PC uma vez para ela ficar disponível aqui offline.'
              : 'Nenhum recado bate com essa busca.'}
          </Text>
        }
      />
    </View>
  );
}

function rotuloDoDia(ts: number): string {
  const d = new Date(ts);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const mesmoDia = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mesmoDia(d, hoje)) return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function hora(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  busca: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
