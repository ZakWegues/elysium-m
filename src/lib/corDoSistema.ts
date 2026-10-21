import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * A cor de destaque do aparelho, para o tema Minimal (20/10).
 *
 * No Android 12+ é a cor do papel de parede (Material You), lida pelo módulo nativo local
 * `modules/cor-do-sistema` (APK 2.4.0). Sem o módulo (APK antigo rodando um OTA novo), no
 * Android abaixo do 12 ou na web: null — o Minimal usa o acento neutro.
 */
const nativo = Platform.OS === 'android'
  ? requireOptionalNativeModule<{ destaque(): string | null }>('CorDoSistema')
  : null;

export function destaqueDoSistema(): string | null {
  try {
    const c = nativo?.destaque() ?? null;
    return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
  } catch {
    return null;
  }
}
