import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFolgaDaBarra } from '../lib/folgaBarra';
import Feather from '@expo/vector-icons/Feather';
import { MailboxMessage } from '../lib/mailbox';
import {
  deleteSessionLocal, loadCache, loadFavorites, loadSessions,
  MailboxSession, newMailboxSessionId, saveSessionLocal, setActiveSessionId,
} from '../lib/mailboxStore';
import { syncMailboxSessions } from '../lib/mailboxSync';
import { confirmDestructive } from '../lib/confirm';
import { Pairing } from '../lib/pairing';
import { useTheme } from '../theme';
import { Button, Card, ScreenHeader, Text } from '../components/ui';

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
export default function MailboxHistorico({
  pairing, sessionId, onSelecionar, onFechar,
}: {
  pairing: Pairing;
  /** Conversa aberta no momento, para marcá-la na lista. */
  sessionId: string | null;
  onSelecionar: (id: string) => void;
  onFechar: () => void;
}) {
  const { palette, tokens } = useTheme();
  const folgaDaBarra = useFolgaDaBarra();
  const [mensagens, setMensagens] = useState<MailboxMessage[]>([]);
  const [favoritos, setFavoritos] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState('');
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [sessoes, setSessoes] = useState<MailboxSession[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [offline, setOffline] = useState(false);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');

  const recarregar = useCallback(async () => {
    const [cache, favs, lista] = await Promise.all([loadCache(), loadFavorites(), loadSessions()]);
    setMensagens(cache.messages);
    setFavoritos(favs);
    setSessoes(lista);
  }, []);

  /** Mostra o que existe aqui primeiro, depois concilia com o PC. */
  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    const r = await syncMailboxSessions(pairing);
    setOffline(r.status === 'offline');
    await recarregar();
    setSincronizando(false);
  }, [pairing, recarregar]);

  useEffect(() => {
    recarregar()
      .then(sincronizar)
      .catch(err => console.error('[histórico-pc] falha lendo o cache', err));
  }, [recarregar, sincronizar]);

  async function novaConversa() {
    const agora = Date.now();
    const nova: MailboxSession = {
      id: newMailboxSessionId(), title: 'Novos recados',
      createdAt: agora, updatedAt: agora, favorite: false,
    };
    await saveSessionLocal(nova);
    await setActiveSessionId(nova.id);
    await recarregar();
    // 🔴 ESPERA a sincronização antes de abrir. A conversa nasce só aqui; se o primeiro
    // recado sair antes de o PC conhecer o id, o servidor não acha a sessão e joga a
    // mensagem na conversa ativa dele — o recado cairia na conversa errada.
    await sincronizar();
    onSelecionar(nova.id);
  }

  async function abrir(id: string) {
    await setActiveSessionId(id);
    onSelecionar(id);
  }

  async function favoritar(s: MailboxSession) {
    // `updatedAt` sobe: favoritar muda o que sobrevive à poda, e é essa marca que faz o
    // PC aceitar a versão do celular em vez de devolver a dele.
    await saveSessionLocal({ ...s, favorite: !s.favorite, updatedAt: Date.now() });
    await recarregar();
    sincronizar();
  }

  async function confirmarRenome(s: MailboxSession) {
    const novo = rascunho.trim().slice(0, 60);
    setRenomeando(null);
    if (!novo || novo === s.title) return;
    await saveSessionLocal({ ...s, title: novo, updatedAt: Date.now() });
    await recarregar();
    sincronizar();
  }

  async function apagar(s: MailboxSession) {
    // Apagar leva os recados e os anexos do disco do PC junto, e não tem desfazer — é
    // destrutivo de verdade, então passa pela mesma trava dos outros.
    const r = await confirmDestructive(
      'Apagar conversa',
      `"${s.title}" e os recados dela somem do PC. Não dá para desfazer.`
    );
    if (r !== 'confirmed') return;
    await deleteSessionLocal(s.id);
    await recarregar();
    sincronizar();
    if (s.id === sessionId) onSelecionar('');
  }

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
      // O histórico é da conversa aberta. Sem o filtro ele voltaria a ser a thread única
      // e infinita que esta fase inteira existiu para acabar.
      .filter(m => (sessionId ? m.sessionId === sessionId : true))
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
  }, [mensagens, favoritos, busca, soFavoritos, sessionId]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        semAjustes
        title="Conversas do PC"
        left={
          <Pressable accessibilityLabel="Voltar" accessibilityRole="button" onPress={onFechar} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={palette.text} />
          </Pressable>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {sincronizando
              ? <ActivityIndicator size="small" color={palette.primary} />
              : <Pressable accessibilityLabel="Atualizar" accessibilityRole="button" onPress={sincronizar} hitSlop={8}>
                  <Feather name="refresh-cw" size={17} color={palette.textMuted} />
                </Pressable>}
            <Pressable accessibilityLabel="Favoritar" accessibilityRole="button" onPress={() => setSoFavoritos(v => !v)} hitSlop={8}>
              <Feather name="star" size={18} color={soFavoritos ? palette.accent : palette.textMuted} />
            </Pressable>
          </View>
        }
      />

      {/* Conversas do lado PC. Ficam AQUI, e não numa segunda tela: o botão de relógio já
          é o histórico deste lado do switch (bloco 43), e separar "as conversas" de "o que
          foi dito nelas" daria dois destinos para o mesmo assunto. */}
      <View style={{ paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.sm }}>
        <Button title="+ Nova conversa" onPress={novaConversa} />

        <Text variant="caption" color={offline ? palette.error : palette.textMuted}>
          {offline
            ? 'PC fora de alcance — mostrando a cópia local. Sincroniza sozinho quando voltar.'
            : 'Sincronizado com o PC. As 5 mais recentes ficam guardadas; favoritar tira dessa contagem.'}
        </Text>

        {sessoes.map(s => (
          <Card key={s.id} style={[styles.linhaSessao, s.id === sessionId && { borderColor: palette.primary }]}>
            {renomeando === s.id ? (
              <TextInput
                value={rascunho}
                onChangeText={setRascunho}
                onBlur={() => confirmarRenome(s)}
                onSubmitEditing={() => confirmarRenome(s)}
                autoFocus
                maxLength={60}
                style={{ flex: 1, color: palette.text, fontSize: 14, paddingVertical: 0 }}
              />
            ) : (
              <Pressable style={{ flex: 1 }} onPress={() => abrir(s.id)}>
                <Text variant="subheading" numberOfLines={1}>{s.title}</Text>
                <Text variant="caption" color={palette.textMuted}>
                  {s.count != null ? `${s.count} recado${s.count === 1 ? '' : 's'} · ` : ''}
                  {rotuloDoDia(s.updatedAt)}
                </Text>
              </Pressable>
            )}

            <Pressable accessibilityLabel="Renomear" accessibilityRole="button"
              onPress={() => { setRascunho(s.title); setRenomeando(s.id); }}
              hitSlop={8}
              style={{ marginRight: 10 }}
            >
              <Feather name="edit-2" size={17} color={palette.textMuted} />
            </Pressable>
            <Pressable accessibilityLabel="Favoritar" accessibilityRole="button" onPress={() => favoritar(s)} hitSlop={8} style={{ marginRight: 10 }}>
              <Feather name="star" size={18} color={s.favorite ? palette.accent : palette.border} />
            </Pressable>
            <Pressable accessibilityLabel="Apagar" accessibilityRole="button" onPress={() => apagar(s)} hitSlop={8}>
              <Feather name="trash-2" size={17} color={palette.textMuted} />
            </Pressable>
          </Card>
        ))}
      </View>

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
            <Pressable accessibilityLabel="Fechar" accessibilityRole="button" onPress={() => setBusca('')} hitSlop={8}>
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
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingTop: 0, gap: tokens.spacing.sm, paddingBottom: tokens.spacing.lg + folgaDaBarra }}
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
  linhaSessao: { flexDirection: 'row', alignItems: 'center' },
});
