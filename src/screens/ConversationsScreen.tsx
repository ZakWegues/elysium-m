import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { conversaEmMarkdown } from '../lib/exportarConversa';
import Feather from '@expo/vector-icons/Feather';
import {
  ChatSession, deleteSession, listSessions, renameSession, toggleFavorite,
} from '../lib/chatHistoryStore';
import { syncChats } from '../lib/chatSync';
import { callRpc } from '../lib/rpc';
import { Pairing } from '../lib/pairing';
import { useTheme } from '../theme';
import { Button, Card, ScreenHeader, Text } from '../components/ui';
import { buscarNasConversas } from '../lib/buscaConversas';
import Animated from 'react-native-reanimated';
import { LAYOUT, ENTRA, SAI } from '../lib/motion';

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.round(hours / 24);
  return `${days}d atrás`;
}

export default function ConversationsScreen({
  pairing,
  onSelect,
  onNew,
  onBack,
}: {
  pairing: Pairing;
  onSelect: (id: string) => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  // Renomear existe nos dois lados do switch. O lado da Caixa já tinha (MailboxHistorico);
  // aqui era o verbo que faltava, e é a mesma edição no lugar, sem caixa de diálogo.
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  /** Busca dentro das conversas (bloco 133): com 3+ letras, a lista vira os trechos achados. */
  const [consulta, setConsulta] = useState('');
  const achados = consulta.trim().length >= 3 ? buscarNasConversas(sessions, consulta) : null;

  async function refresh() {
    const list = await listSessions();
    setSessions(list);
    setLoading(false);
  }

  /** Mostra o que existe aqui primeiro, depois concilia com o PC. */
  const sync = useCallback(async () => {
    setSyncing(true);
    const result = await syncChats(pairing);
    setOffline(result.status === 'offline');
    await refresh();
    setSyncing(false);
  }, [pairing]);

  useEffect(() => {
    refresh().then(sync);
  }, [sync]);

  async function handleToggleFavorite(id: string) {
    await toggleFavorite(id);
    await refresh();
    // Favoritar muda o que sobrevive à poda, então vale propagar na hora em vez de
    // esperar a próxima abertura da tela.
    sync();
  }

  async function confirmarRenome(session: ChatSession) {
    const novo = rascunho.trim().slice(0, 60);
    setRenomeando(null);
    if (!novo || novo === session.title) return;
    await renameSession(session.id, novo);
    await refresh();
    // Renomear não sobe o `updatedAt`, então o PC não aceitaria pelo critério de
    // conflito; quem carrega o nome novo até lá é o `chat.rename`.
    try {
      await callRpc(pairing, 'chat.rename', { id: session.id, title: novo });
    } catch {
      // PC fora de alcance. O nome vale aqui e sobe na próxima sincronização em que o
      // `chat.save` levar a conversa inteira, `titleCustom` junto.
    }
  }

  function compartilhar(id: string) {
    const sessao = sessions.find(x => x.id === id);
    if (!sessao) return;
    Share.share({ title: sessao.title, message: conversaEmMarkdown(sessao) }).catch(() => {});
  }

  async function handleDelete(id: string) {
    await deleteSession(id);
    await refresh();
    sync();
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        semAjustes
        title="Conversas"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {syncing
              ? <ActivityIndicator size="small" color={palette.primary} />
              : <Pressable onPress={sync} hitSlop={8}>
                  <Feather name="refresh-cw" size={18} color={palette.textMuted} />
                </Pressable>}
            <Pressable onPress={onBack} hitSlop={8}>
              <Feather name="x" size={22} color={palette.textMuted} />
            </Pressable>
          </View>
        }
      />
      <Animated.ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}>
        <Button title="+ Nova conversa" onPress={onNew} />

        <View style={[styles.busca, { borderColor: palette.border, borderRadius: tokens.radii.lg }]}>
          <Feather name="search" size={16} color={palette.textMuted} />
          <TextInput
            value={consulta}
            onChangeText={setConsulta}
            placeholder="Buscar dentro das conversas"
            placeholderTextColor={palette.textMuted}
            style={{ flex: 1, color: palette.text, fontSize: 14, paddingVertical: 0 }}
          />
          {consulta ? (
            <Pressable onPress={() => setConsulta('')} hitSlop={8}><Feather name="x" size={16} color={palette.textMuted} /></Pressable>
          ) : null}
        </View>

        {achados && achados.length === 0 && (
          <Text variant="caption" color={palette.textMuted}>Nada com isso nas conversas guardadas neste celular.</Text>
        )}
        {achados?.map((a) => (
          <Pressable key={a.sessaoId} onPress={() => onSelect(a.sessaoId)}>
            <Card glass style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" color={palette.textMuted} numberOfLines={1} style={{ flex: 1 }}>{a.titulo} · {relativeTime(a.em)}</Text>
                {/* Compartilhar também daqui: achar pela busca e mandar adiante é o caminho comum. */}
                <Pressable onPress={() => compartilhar(a.sessaoId)} hitSlop={12} accessibilityLabel="Compartilhar a conversa">
                  <Feather name="share-2" size={16} color={palette.textMuted} />
                </Pressable>
              </View>
              <Text variant="body" numberOfLines={3}>{a.deQuem === 'eu' ? 'Você: ' : ''}{a.trecho}</Text>
            </Card>
          </Pressable>
        ))}

        <Text variant="caption" color={offline ? palette.error : palette.textMuted}>
          {offline
            ? 'PC fora de alcance — mostrando a cópia local. Sincroniza sozinho quando voltar.'
            : 'Sincronizado com o PC. As 5 mais recentes ficam guardadas; favoritar tira dessa contagem.'}
        </Text>

        {!achados && !loading && sessions.length === 0 && (
          <Animated.View layout={LAYOUT} entering={ENTRA} exiting={SAI}>
            <Card glass style={styles.center}>
              <Text variant="body" color={palette.textMuted}>
                Nenhuma conversa salva ainda.
              </Text>
            </Card>
          </Animated.View>
        )}

        {!achados && sessions.map((session) => (
          <Animated.View key={session.id} layout={LAYOUT} entering={ENTRA} exiting={SAI}>
            <Card glass style={styles.row}>
              {renomeando === session.id ? (
                <TextInput
                  value={rascunho}
                  onChangeText={setRascunho}
                  onBlur={() => confirmarRenome(session)}
                  onSubmitEditing={() => confirmarRenome(session)}
                  autoFocus
                  maxLength={60}
                  style={{ flex: 1, color: palette.text, fontSize: 14, paddingVertical: 0 }}
                />
              ) : (
                <Pressable style={{ flex: 1 }} onPress={() => onSelect(session.id)}>
                  <Text variant="subheading" numberOfLines={1}>
                    {session.title}
                  </Text>
                  <Text variant="caption" color={palette.textMuted}>
                    {relativeTime(session.updatedAt)} · {session.messages.length} mensagens
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { setRascunho(session.title); setRenomeando(session.id); }}
                hitSlop={12}
                style={{ marginRight: 8 }}
              >
                <Feather name="edit-2" size={17} color={palette.textMuted} />
              </Pressable>
              <Pressable onPress={() => handleToggleFavorite(session.id)} hitSlop={12} style={{ marginRight: 8 }}>
                <Feather name="star" size={20} color={session.favorite ? '#F5A623' : palette.border} />
              </Pressable>
              <Pressable
                onPress={() => compartilhar(session.id)}
                hitSlop={12}
                style={{ marginRight: 8 }}
                accessibilityLabel="Compartilhar a conversa"
              >
                <Feather name="share-2" size={18} color={palette.textMuted} />
              </Pressable>
              <Pressable onPress={() => handleDelete(session.id)} hitSlop={12}>
                <Feather name="trash-2" size={20} color={palette.textMuted} />
              </Pressable>
            </Card>
          </Animated.View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 32 },
  row: { flexDirection: 'row', alignItems: 'center' },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth },
});
