import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme';
import { Text } from './ui';
import type { ConnectionStatus } from '../lib/useConnection';

/**
 * Faixa fina no topo quando o PC não está respondendo. Fica invisível no caminho
 * feliz — some por completo quando a conexão está de pé.
 */
export function ConnectionBanner({
  status,
  queued,
  scanning,
  scanProgress,
  onRetry,
  onScan,
}: {
  status: ConnectionStatus;
  queued: number;
  scanning: boolean;
  scanProgress: number;
  onRetry: () => void;
  onScan: () => void;
}) {
  const { palette, tokens } = useTheme();

  if (status === 'online' && queued === 0) return null;

  const offline = status === 'offline';
  const background = offline ? palette.errorSoft : palette.primarySoft;
  const foreground = offline ? palette.error : palette.primary;

  let label: string;
  if (scanning) label = `Procurando o PC na rede… ${scanProgress}%`;
  else if (offline) label = queued > 0 ? `PC fora do ar · ${queued} na fila` : 'PC fora do ar';
  else if (status === 'checking') label = 'Procurando o PC…';
  else label = `Reenviando ${queued} comando${queued > 1 ? 's' : ''}…`;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: background,
          paddingHorizontal: tokens.spacing.lg,
          paddingVertical: tokens.spacing.sm,
          gap: tokens.spacing.sm,
        },
      ]}
    >
      {scanning || status === 'checking' ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <Feather name={offline ? 'wifi-off' : 'upload-cloud'} size={14} color={foreground} />
      )}

      <Text variant="caption" color={foreground} style={{ flex: 1 }}>
        {label}
      </Text>

      {offline && !scanning && (
        <>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text variant="label" color={foreground}>Tentar</Text>
          </Pressable>
          <Pressable onPress={onScan} hitSlop={8}>
            <Text variant="label" color={foreground}>Procurar</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
});
