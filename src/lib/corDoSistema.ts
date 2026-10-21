/**
 * A cor de destaque do aparelho, para o tema Minimal (20/10).
 *
 * O Android 12+ tem a cor do papel de parede (Material You), mas não há API em JavaScript para
 * ela: precisa de módulo nativo, que só entra com um APK novo. Até lá, null — o Minimal usa o
 * acento neutro. Ponto único para o módulo nativo se encaixar depois.
 */
export function destaqueDoSistema(): string | null {
  return null;
}
