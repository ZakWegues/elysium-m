import { useFonts } from 'expo-font';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';

/**
 * As fontes do design de 29/10: Manrope + JetBrains Mono no Dark, Outfit + Figtree na
 * Glass. Viajam no OTA como asset (o `expo-font` já vem no APK). Enquanto carregam, o texto
 * sai na fonte do sistema — nada espera por elas.
 */
export function useFontes(): boolean {
  const [prontas] = useFonts({
    Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_500Medium, JetBrainsMono_600SemiBold,
    Outfit_600SemiBold, Outfit_700Bold,
    Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold,
  });
  return prontas;
}
