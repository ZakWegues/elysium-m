import { Linking } from 'react-native';

/**
 * Fase 23.2 (blindagem): todo link tocado nas bolhas passa por aqui — só http(s). Hoje os
 * detectores de link já só pegam http(s)/www, mas o texto vem do modelo e do PC; um
 * `intent:` ou `file:` que escapasse abriria app ou arquivo direto. Pura a checagem.
 */
export function linkSeguro(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

export function abrirLinkSeguro(url: string): void {
  if (linkSeguro(url)) Linking.openURL(url.trim()).catch(() => {});
}
