import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  fetchInboxContent,
  listInbox,
  listOutbox,
  MAILBOX_MAX_ATTACHMENT_BYTES,
  MailboxItem,
  sendToDesktop,
} from '../lib/mailbox';
import { loadFavorites, saveCache, loadCache, toggleFavorite as toggleFavoriteStore } from '../lib/mailboxStore';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { Card, ScreenHeader, Text } from '../components/ui';

const POLL_INTERVAL_MS = 30000;

type Section = 'inbox' | 'outbox';
type PendingAttachment = { name: string; mimeType: string; uri: string; sizeBytes: number };

export default function MailboxScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { palette, tokens } = useTheme();
  const [section, setSection] = useState<Section>('inbox');
  const [inbox, setInbox] = useState<MailboxItem[]>([]);
  const [outbox, setOutbox] = useState<MailboxItem[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const loggedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [inboxItems, outboxItems] = await Promise.all([listInbox(pairing), listOutbox(pairing)]);
      if (!loggedOnce.current) {
        loggedOnce.current = true;
        // Contrato /api/mailbox ainda não testado ponta a ponta contra o desktop real -
        // log único pra pegar mismatch de campo cedo (mesmo risco já visto com reply/error
        // e telemetria). Remover depois de confirmar.
        console.log('[mailbox] primeira resposta inbox/outbox:', JSON.stringify({ inboxItems, outboxItems }));
      }
      setInbox(inboxItems);
      setOutbox(outboxItems);
      saveCache({ inbox: inboxItems, outbox: outboxItems });
    } catch (err) {
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }
      console.error('[mailbox] falha ao atualizar', err);
    }
  }, [pairing, onUnpair]);

  useEffect(() => {
    (async () => {
      const [cache, favs] = await Promise.all([loadCache(), loadFavorites()]);
      setInbox(cache.inbox);
      setOutbox(cache.outbox);
      setFavorites(favs);
      setLoading(false);
      refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) setDraft(text);
  }

  async function handleAttach() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > MAILBOX_MAX_ATTACHMENT_BYTES) {
      Alert.alert('Arquivo grande demais', 'Limite de 5MB por anexo.');
      return;
    }
    setAttachment({
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      uri: asset.uri,
      sizeBytes: asset.size ?? 0,
    });
  }

  function guessKind(text: string): 'link' | 'note' {
    return /^https?:\/\//i.test(text.trim()) ? 'link' : 'note';
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text && !attachment) return;
    setSending(true);

    try {
      let attachmentPayload: { name: string; mimeType: string; base64: string } | undefined;
      if (attachment) {
        const base64 = await FileSystem.readAsStringAsync(attachment.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (base64.length * 0.75 > MAILBOX_MAX_ATTACHMENT_BYTES) {
          Alert.alert('Arquivo grande demais', 'Limite de 5MB por anexo.');
          setSending(false);
          return;
        }
        attachmentPayload = { name: attachment.name, mimeType: attachment.mimeType, base64 };
      }

      await sendToDesktop(pairing, {
        kind: attachment ? 'file' : guessKind(text),
        text: text || undefined,
        attachment: attachmentPayload,
      });

      setDraft('');
      setAttachment(null);
      await refresh();
    } catch (err) {
      if (err instanceof AuthError) {
        Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
        onUnpair();
        return;
      }
      Alert.alert('Falha ao enviar', errMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function handleToggleFavorite(id: string) {
    const next = await toggleFavoriteStore(id);
    setFavorites(next);
  }

  async function handleOpenInboxItem(item: MailboxItem) {
    try {
      await fetchInboxContent(pairing, item.id);
      Alert.alert(item.kind === 'link' ? 'Link' : 'Item', item.text ?? '(anexo)');
    } catch (err) {
      Alert.alert('Falha ao abrir', errMessage(err));
    }
  }

  const items = (section === 'inbox' ? inbox : outbox)
    .slice()
    .sort((a, b) => {
      const favA = favorites[a.id] ? 1 : 0;
      const favB = favorites[b.id] ? 1 : 0;
      if (favA !== favB) return favB - favA;
      return b.createdAt - a.createdAt;
    });

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Caixa de recados" />

      <View style={[styles.tabs, { paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.sm }]}>
        {(['inbox', 'outbox'] as Section[]).map((s) => {
          const active = s === section;
          return (
            <Pressable
              key={s}
              onPress={() => setSection(s)}
              style={[
                styles.tabButton,
                {
                  borderRadius: tokens.radii.full,
                  backgroundColor: active ? palette.primary : palette.surface,
                  borderColor: palette.border,
                  borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text variant="label" color={active ? palette.onPrimary : palette.text}>
                {s === 'inbox' ? 'Do PC' : 'Enviados'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.primary} />}
      >
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={palette.primary} />
          </View>
        )}

        {!loading && items.length === 0 && (
          <Card style={styles.center}>
            <Feather name="inbox" size={22} color={palette.textMuted} />
            <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
              {section === 'inbox' ? 'Nada do PC ainda.' : 'Você ainda não mandou nada.'}
            </Text>
          </Card>
        )}

        {items.map((item) => (
          <Card key={item.id} style={styles.itemRow}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => section === 'inbox' && handleOpenInboxItem(item)}
            >
              <View style={styles.itemHeader}>
                <Feather
                  name={item.kind === 'link' ? 'link' : item.kind === 'file' ? 'paperclip' : 'file-text'}
                  size={16}
                  color={palette.textMuted}
                />
                <Text variant="caption" color={palette.textMuted}>
                  {new Date(item.createdAt).toLocaleString('pt-BR')}
                </Text>
              </View>
              <Text variant="body" numberOfLines={2}>
                {item.text ?? item.attachment?.name ?? '(sem conteúdo)'}
              </Text>
            </Pressable>
            <Pressable onPress={() => handleToggleFavorite(item.id)} hitSlop={8}>
              <Feather
                name="star"
                size={20}
                color={favorites[item.id] ? '#F5A623' : palette.border}
              />
            </Pressable>
          </Card>
        ))}
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: palette.border, backgroundColor: palette.surface, padding: tokens.spacing.md }]}>
        {attachment && (
          <View style={[styles.attachmentChip, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
            <Feather name="paperclip" size={14} color={palette.primary} />
            <Text variant="caption" color={palette.primary} numberOfLines={1} style={{ flex: 1 }}>
              {attachment.name}
            </Text>
            <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
              <Feather name="x" size={14} color={palette.primary} />
            </Pressable>
          </View>
        )}
        <View style={styles.composerRow}>
          <Pressable style={styles.iconButton} onPress={handlePaste}>
            <Feather name="clipboard" size={20} color={palette.textMuted} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={handleAttach}>
            <Feather name="paperclip" size={20} color={palette.textMuted} />
          </Pressable>
          <TextInput
            style={[styles.input, { borderColor: palette.border, borderRadius: tokens.radii.full, color: palette.text }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Cola um link ou escreve uma nota..."
            placeholderTextColor={palette.textMuted}
            editable={!sending}
          />
          <Pressable
            style={[styles.iconButton, { backgroundColor: palette.primary, borderRadius: 22, opacity: sending ? 0.5 : 1 }]}
            onPress={handleSend}
            disabled={sending || (!draft.trim() && !attachment)}
          >
            {sending ? (
              <ActivityIndicator size="small" color={palette.onPrimary} />
            ) : (
              <Feather name="arrow-up" size={20} color={palette.onPrimary} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingBottom: 12 },
  tabButton: { paddingVertical: 8, paddingHorizontal: 16 },
  center: { alignItems: 'center', paddingVertical: 32 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
