import { Component, ReactNode } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';
import { errMessage } from '../lib/errors';

/**
 * Cores lidas do sistema, não do tema do app.
 *
 * Este componente envolve o `ThemeProvider` — se ele quebrar, o provider pode nem ter
 * montado, então `useTheme()` não está disponível. Com valores fixos claros, uma falha
 * no modo escuro devolvia um flash branco na cara do usuário.
 */
function colors() {
  const dark = Appearance.getColorScheme() === 'dark';
  return {
    background: dark ? '#0B0D12' : '#F7F8FA',
    title: dark ? '#EEF1F6' : '#14161A',
    message: dark ? '#9AA3B2' : '#6B7280',
  };
}

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
      const c = colors();
      return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
          <Text style={[styles.title, { color: c.title }]}>Algo deu errado</Text>
          <Text style={[styles.message, { color: c.message }]}>{errMessage(this.state.error)}</Text>
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  message: { textAlign: 'center' },
  button: { backgroundColor: '#7C5CFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
