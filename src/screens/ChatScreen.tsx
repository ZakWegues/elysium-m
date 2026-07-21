import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Pairing } from '../lib/pairing';
import { sendCommand } from '../lib/api';

type Message = { id: string; from: 'me' | 'reply' | 'error'; text: string };

export default function ChatScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', from: 'reply', text: `Pareado com ${pairing.ip}:${pairing.port}` },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: `me-${Date.now()}`, from: 'me', text }]);
    setSending(true);

    try {
      const reply = await sendCommand(pairing, text);
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, from: 'reply', text: reply }]);
      Speech.speak(reply, { language: 'pt-BR' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, from: 'error', text: `Falha: ${message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>NeuroAxis Portal</Text>
        <Pressable onPress={onUnpair}>
          <Text style={styles.unpair}>Desparear</Text>
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.from === 'me' && styles.bubbleMe,
              item.from === 'reply' && styles.bubbleReply,
              item.from === 'error' && styles.bubbleError,
            ]}
          >
            <Text style={item.from === 'me' ? styles.bubbleTextMe : styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      {sending && (
        <View style={styles.sendingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.sendingText}>Pensando...</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreve um comando..."
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  headerText: { fontSize: 18, fontWeight: '600' },
  unpair: { color: '#c0392b', fontSize: 14 },
  list: { padding: 16, gap: 8 },
  bubble: { borderRadius: 12, padding: 12, maxWidth: '80%', backgroundColor: '#eee', alignSelf: 'flex-start' },
  bubbleMe: { backgroundColor: '#4da3ff', alignSelf: 'flex-end' },
  bubbleReply: { backgroundColor: '#eee' },
  bubbleError: { backgroundColor: '#f8d7da' },
  bubbleText: { color: '#000' },
  bubbleTextMe: { color: '#fff' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sendingText: { color: '#666' },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButton: {
    backgroundColor: '#4da3ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
