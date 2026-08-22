import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ChatSession, deleteSession, listSessions, toggleFavorite } from '../lib/chatHistoryStore';
import { syncChats } from '../lib/chatSync';
import { Pairing } from '../lib/pairing';
import { useTheme } from '../theme';
import { Button, Card, ScreenHeader, Text } from '../components/ui';

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
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}>
        <Button title="+ Nova conversa" onPress={onNew} />

        <Text variant="caption" color={offline ? palette.error : palette.textMuted}>
          {offline
            ? 'PC fora de alcance — mostrando a cópia local. Sincroniza sozinho quando voltar.'
            : 'Sincronizado com o PC. As 5 mais recentes ficam guardadas; favoritar tira dessa contagem.'}
        </Text>

        {!loading && sessions.length === 0 && (
          <Card style={styles.center}>
            <Text variant="body" color={palette.textMuted}>
              Nenhuma conversa salva ainda.
            </Text>
          </Card>
        )}

        {sessions.map((session) => (
          <Card key={session.id} style={styles.row}>
            <Pressable style={{ flex: 1 }} onPress={() => onSelect(session.id)}>
              <Text variant="subheading" numberOfLines={1}>
                {session.title}
              </Text>
              <Text variant="caption" color={palette.textMuted}>
                {relativeTime(session.updatedAt)} · {session.messages.length} mensagens
              </Text>
            </Pressable>
            <Pressable onPress={() => handleToggleFavorite(session.id)} hitSlop={8} style={{ marginRight: 8 }}>
              <Feather name="star" size={20} color={session.favorite ? '#F5A623' : palette.border} />
            </Pressable>
            <Pressable onPress={() => handleDelete(session.id)} hitSlop={8}>
              <Feather name="trash-2" size={20} color={palette.textMuted} />
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 32 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
