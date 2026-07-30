import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import { fromByteArray } from 'base64-js';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  ackMessage,
  fetchMessageContent,
  listMessages,
  MAILBOX_MAX_ATTACHMENT_BYTES,
  MailboxMessage,
  sendMessage,
} from '../lib/mailbox';
import { loadFavorites, saveCache, loadCache, toggleFavorite as toggleFavoriteStore } from '../lib/mailboxStore';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { ScreenHeader, Text } from '../components/ui';

const POLL_INTERVAL_MS = 15000;

type PendingAttachment = { name: string; mimeType: string; uri: string; sizeBytes: number };

export default function MailboxScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { palette, tokens } = useTheme();
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const fetchingImages = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<MailboxMessage>>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await listMessages(pairing);
      setMessages(items);
      saveCache({ messages: items });

      const unreadFromPc = items.filter((m) => m.from === 'pc' && !m.readAt);
      if (unreadFromPc.length > 0) {
        await Promise.all(
          unreadFromPc.map((m) =>
            ackMessage(pairing, m.id).catch((err) => console.warn('[mailbox] falha ao confirmar leitura', m.id, err))
          )
        );
        setMessages((prev) =>
          prev.map((m) => (unreadFromPc.some((u) => u.id === m.id) ? { ...m, readAt: Date.now() } : m))
        );
      }
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
      setMessages(cache.messages);
      setFavorites(favs);
      setLoading(false);
      refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  useEffect(() => {
    const toFetch = messages.filter(
      (m) =>
        m.attachment?.mimeType.startsWith('image/') &&
        !imageCache[m.id] &&
        !fetchingImages.current.has(m.id)
    );
    toFetch.forEach((m) => {
      fetchingImages.current.add(m.id);
      fetchMessageContent(pairing, m.id)
        .then((content) => {
          if (content.attachment?.base64) {
            setImageCache((prev) => ({ ...prev, [m.id]: content.attachment!.base64 }));
          }
        })
        .catch((err) => console.warn('[mailbox] falha ao carregar preview de imagem', m.id, err))
        .finally(() => fetchingImages.current.delete(m.id));
    });
  }, [messages, pairing, imageCache]);

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) setDraft(text);
  }

  async function handleAttach() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: false,
    });
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
        const bytes = new Uint8Array(await new File(attachment.uri).arrayBuffer());
        if (bytes.byteLength > MAILBOX_MAX_ATTACHMENT_BYTES) {
          Alert.alert('Arquivo grande demais', 'Limite de 5MB por anexo.');
          setSending(false);
          return;
        }
        attachmentPayload = { name: attachment.name, mimeType: attachment.mimeType, base64: fromByteArray(bytes) };
      }

      await sendMessage(pairing, {
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

  async function handleOpenAttachment(message: MailboxMessage) {
    if (!message.attachment) return;
    try {
      await fetchMessageContent(pairing, message.id);
      Alert.alert('Anexo', `${message.attachment.name}\n${message.attachment.mimeType}`);
    } catch (err) {
      Alert.alert('Falha ao abrir', errMessage(err));
    }
  }

  const ordered = messages.slice().sort((a, b) => a.createdAt - b.createdAt);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Caixa de recados" />

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
        </View>
      )}

      {!loading && ordered.length === 0 && (
        <View style={styles.center}>
          <Feather name="inbox" size={22} color={palette.textMuted} />
          <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
            Nenhuma mensagem ainda.
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={ordered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}
        renderItem={({ item }) => {
          const mine = item.from === 'mobile';
          const bg = mine ? palette.primary : palette.surfaceRaised;
          const color = mine ? palette.onPrimary : palette.text;
          const isImage = item.attachment?.mimeType.startsWith('image/') ?? false;
          return (
            <Pressable
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}
              onPress={() => {
                if (item.attachment && !isImage) handleOpenAttachment(item);
              }}
              onLongPress={() => handleToggleFavorite(item.id)}
            >
              <View
                style={[
                  styles.bubble,
                  {
                    borderRadius: tokens.radii.lg,
                    padding: isImage ? tokens.spacing.xs : tokens.spacing.md,
                    backgroundColor: bg,
                    borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
                    borderColor: palette.border,
                  },
                ]}
              >
                {!isImage && (
                  <View style={styles.bubbleHeader}>
                    {item.attachment && <Feather name="paperclip" size={14} color={color} />}
                    {favorites[item.id] && <Feather name="star" size={12} color="#F5A623" />}
                  </View>
                )}

                {isImage ? (
                  imageCache[item.id] ? (
                    <Image
                      source={{ uri: `data:${item.attachment!.mimeType};base64,${imageCache[item.id]}` }}
                      style={[styles.previewImage, { borderRadius: tokens.radii.md }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.previewImage, styles.previewLoading, { borderRadius: tokens.radii.md }]}>
                      <ActivityIndicator size="small" color={mine ? palette.onPrimary : palette.primary} />
                    </View>
                  )
                ) : (
                  <Text variant="body" color={color}>
                    {item.text ?? item.attachment?.name ?? '(sem conteúdo)'}
                  </Text>
                )}

                {isImage && favorites[item.id] && (
                  <View style={styles.imageFavorite}>
                    <Feather name="star" size={12} color="#F5A623" />
                  </View>
                )}
                {isImage && item.text && (
                  <Text variant="caption" color={color} style={{ marginTop: tokens.spacing.xs }}>
                    {item.text}
                  </Text>
                )}
              </View>
              <Text
                variant="caption"
                color={palette.textMuted}
                style={{ textAlign: mine ? 'right' : 'left', marginTop: 2 }}
              >
                {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
          );
        }}
      />

      <View
        style={[
          styles.composer,
          { borderTopColor: palette.border, backgroundColor: palette.surface, padding: tokens.spacing.md },
        ]}
      >
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
  center: { alignItems: 'center', paddingVertical: 32 },
  bubble: { gap: 4 },
  bubbleHeader: { flexDirection: 'row', gap: 4 },
  previewImage: { width: 220, height: 220 },
  previewLoading: { alignItems: 'center', justifyContent: 'center' },
  imageFavorite: { position: 'absolute', top: 8, right: 8 },
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
