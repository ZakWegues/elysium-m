import { View } from 'react-native';
import { useTheme } from '../theme';
import { Card, ScreenHeader, Text } from '../components/ui';

export default function MailboxScreen() {
  const { palette, tokens } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Caixa de recados" />
      <View style={{ padding: tokens.spacing.lg }}>
        <Card>
          <Text variant="subheading">Em construção</Text>
          <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.xs }}>
            Envio de links, notas e arquivos entre celular e PC chega numa próxima fase.
          </Text>
        </Card>
      </View>
    </View>
  );
}
