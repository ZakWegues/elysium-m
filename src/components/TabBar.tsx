import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme';
import { GlassFill, Text } from './ui';

export type Screen = 'home' | 'chat' | 'mailbox' | 'control' | 'presets' | 'settings' | 'conversations';

const TABS: { screen: Screen; label: string; icon: keyof typeof Feather.glyphMap; modal?: boolean }[] = [
  // O app abria direto no chat, o que fazia sentido quando conversar era quase tudo
  // que ele fazia. Com controle remoto, lembretes e player, chat virou uma aba entre
  // outras — e nada mostrava de imediato se o PC estava de pé.
  { screen: 'home', label: 'Início', icon: 'home' },
  { screen: 'chat', label: 'Chat', icon: 'message-circle' },
  { screen: 'mailbox', label: 'Caixa', icon: 'inbox' },
  // Guia única de controle do PC: espelho da tela aparente ao entrar, e todo o resto
  // (trackpad, monitor, processos, programas, energia, transferência, mídia) em
  // gavetas. Antes eram duas abas separadas, Sistema e Remoto.
  { screen: 'control', label: 'PC', icon: 'monitor' },
  { screen: 'presets', label: 'Presets', icon: 'sliders', modal: true },
  { screen: 'settings', label: 'Ajustes', icon: 'settings', modal: true },
];

export function TabBar({
  active,
  onNavigate,
  onOpenModal,
  badges,
}: {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  onOpenModal: (screen: 'presets' | 'settings') => void;
  badges?: Partial<Record<Screen, number>>;
}) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ overflow: 'hidden' }}>
      <GlassFill intensity={65} strong edge={false} />
      <View
        style={[
          styles.row,
          {
            paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
            borderTopColor: palette.glassBorder,
          },
        ]}
      >
        {TABS.map((tab) => {
          const isActive = !tab.modal && tab.screen === active;
          const color = isActive ? palette.primary : palette.textMuted;
          const badgeCount = badges?.[tab.screen] ?? 0;
          return (
            <Pressable
              key={tab.screen}
              style={styles.tab}
              onPress={() => (tab.modal ? onOpenModal(tab.screen as 'presets' | 'settings') : onNavigate(tab.screen))}
            >
              <View>
                <Feather name={tab.icon} size={22} color={color} />
                {badgeCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: palette.error }]}>
                    <Text variant="caption" color="#fff" style={styles.badgeText}>
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text variant="caption" color={color} style={styles.label}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
});
