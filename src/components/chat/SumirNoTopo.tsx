import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { comAlfa, useTheme } from '../../theme';

/** 25/11: o texto some antes de chegar aos botões que flutuam no topo (passava por trás deles). */
export function SumirNoTopo({ altura }: { altura: number }) {
  const { palette } = useTheme();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[comAlfa(palette.background, 0.94), comAlfa(palette.background, 0.82), comAlfa(palette.background, 0)]}
      locations={[0, 0.62, 1]}
      style={[styles.topo, { height: altura + 18 }]}
    />
  );
}

const styles = StyleSheet.create({ topo: { position: 'absolute', top: 0, left: 0, right: 0 } });
