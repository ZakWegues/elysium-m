import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeInUp, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { GlassFill, Text } from './ui';
import type { ConnectionStatus } from '../lib/useConnection';
import { MOV } from '../lib/motion';

/**
 * Faixa fina no topo quando o PC não está respondendo. Fica invisível no caminho
 * feliz — some por completo quando a conexão está de pé.
 */
export function ConnectionBanner({
  status,
  queued,
  scanning,
  scanProgress,
  hasTunnel,
  onRetry,
  onScan,
}: {
  status: ConnectionStatus;
  queued: number;
  scanning: boolean;
  scanProgress: number;
  /** null = nunca conseguimos perguntar ao PC. */
  hasTunnel: boolean | null;
  onRetry: () => void;
  onScan: () => void;
}) {
  const { palette, tokens } = useTheme();

  if (status === 'online' && queued === 0) return null;

  const offline = status === 'offline';
  const unauthorized = status === 'unauthorized';
  // Tokens formais da escala glass L2
  const isError = offline || unauthorized;
  const foreground = isError ? palette.error : palette.primary;

  let label: string;
  if (unauthorized) label = 'O PC recusou o token — leia o QR de novo';
  else if (scanning) label = `Procurando o PC na rede… ${scanProgress}%`;
  else if (offline) {
    // Sem túnel no PC, "fora do ar" é enganoso: o PC pode estar ligado e funcionando,
    // e simplesmente não haver caminho até ele fora de casa. Dizer o motivo real evita
    // a caça ao problema errado.
    // Com túnel no PC, a causa mais comum fora de casa é o Tailscale do CELULAR ter caído
    // (o HyperOS mata o app e o ícone de VPN continua na barra — §12). Dizer isso, com o
    // botão que abre o app dele, em vez de mandar procurar o problema no PC (bloco 122).
    const base = hasTunnel === false
      ? 'Sem acesso remoto — só funciona na rede de casa'
      : hasTunnel ? 'PC fora de alcance — fora de casa? confira o Tailscale' : 'PC fora do ar';
    label = queued > 0 ? `${base} · ${queued} na fila` : base;
  }
  else if (status === 'checking') label = 'Procurando o PC…';
  else label = `Reenviando ${queued} comando${queued > 1 ? 's' : ''}…`;

  return (
    <Animated.View
      entering={FadeInUp.withInitialValues({ transform: [{ translateY: -8 }] }).duration(MOV.base).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(MOV.saida).reduceMotion(ReduceMotion.System)}
      style={[
        styles.bar,
        {
          paddingHorizontal: tokens.spacing.lg,
          paddingVertical: tokens.spacing.sm,
          gap: tokens.spacing.sm,
        },
      ]}
    >
      <GlassFill intensity={35} tintColor={isError ? palette.errorSoft : palette.glassSurface} edge={false} />

      {scanning || status === 'checking' ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <Feather name={unauthorized ? 'key' : offline ? 'wifi-off' : 'upload-cloud'} size={14} color={foreground} />
      )}

      <Text variant="caption" color={foreground} style={{ flex: 1 }}>
        {label}
      </Text>

      {offline && !scanning && (
        <>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text variant="label" color={foreground}>Tentar</Text>
          </Pressable>
          {hasTunnel ? (
            <Pressable onPress={abrirTailscale} hitSlop={8}>
              <Text variant="label" color={foreground}>Tailscale</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onScan} hitSlop={8}>
              <Text variant="label" color={foreground}>Procurar</Text>
            </Pressable>
          )}
        </>
      )}
    </Animated.View>
  );
}

/** Abre o app do Tailscale; sem ele instalado, a página dele na loja. */
function abrirTailscale(): void {
  try { IntentLauncher.openApplication('com.tailscale.ipn'); }
  catch { Linking.openURL('market://details?id=com.tailscale.ipn').catch(() => {}); }
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
});
