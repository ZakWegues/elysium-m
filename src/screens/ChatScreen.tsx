import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pairing } from '../lib/pairing';

type Message = { id: string; from: 'me' | 'system'; text: string };

export default function ChatScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', from: 'system', text: `Pareado com ${pairing.ip}:${pairing.port}` },
  ]);
  const [draft, setDraft] = useState('');

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: String(Date.now()), from: 'me', text }]);
    setDraft('');
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
          <View style={[styles.bubble, item.from === 'me' ? styles.bubbleMe : styles.bubbleSystem]}>
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreve um comando..."
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable style={styles.sendButton} onPress={handleSend}>
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
  bubble: { borderRadius: 12, padding: 12, maxWidth: '80%' },
  bubbleMe: { backgroundColor: '#4da3ff', alignSelf: 'flex-end' },
  bubbleSystem: { backgroundColor: '#eee', alignSelf: 'flex-start' },
  bubbleText: { color: '#000' },
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
