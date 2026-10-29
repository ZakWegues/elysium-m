import { StyleSheet, View } from 'react-native';

/**
 * Fase 23.1: as cantoneiras HUD do Stark — os oito traços de 12×1,5 px nos quatro cantos
 * que o `stark.css` do desktop desenha em todo painel.
 */
export function CantosHud({ cor }: { cor: string }) {
  const t = (s: object) => <View style={[{ position: 'absolute', backgroundColor: cor }, s]} />;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {t({ top: 4, left: 4, width: 12, height: 1.5 })}{t({ top: 4, left: 4, width: 1.5, height: 12 })}
      {t({ top: 4, right: 4, width: 12, height: 1.5 })}{t({ top: 4, right: 4, width: 1.5, height: 12 })}
      {t({ bottom: 4, left: 4, width: 12, height: 1.5 })}{t({ bottom: 4, left: 4, width: 1.5, height: 12 })}
      {t({ bottom: 4, right: 4, width: 12, height: 1.5 })}{t({ bottom: 4, right: 4, width: 1.5, height: 12 })}
    </View>
  );
}
