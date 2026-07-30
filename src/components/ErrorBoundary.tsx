import { Component, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errMessage } from '../lib/errors';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[error-boundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Algo deu errado</Text>
          <Text style={styles.message}>{errMessage(this.state.error)}</Text>
          <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Tentar de novo</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#F7F8FA' },
  title: { fontSize: 20, fontWeight: '700', color: '#14161A' },
  message: { color: '#6B7280', textAlign: 'center' },
  button: { backgroundColor: '#7C5CFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
