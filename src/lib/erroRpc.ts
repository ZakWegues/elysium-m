import { Alert } from 'react-native';

/**
 * O PC recusou o token deste celular (401) — 08/10.
 *
 * Antes, seis telas tratavam isso por conta própria e chamavam `onUnpair()`: o celular
 * ESQUECIA o PC na hora, sem perguntar — e um 401 de passagem (o PC reiniciando, um token
 * trocado de propósito) apagava o pareamento. O App já mostra "Ler QR" quando a sonda vê o
 * 401; aqui é só explicar, uma vez a cada 30 s, sem apagar nada.
 */
let ultimoAviso = 0;

export function avisarTokenRecusado(agora = Date.now()): boolean {
  if (agora - ultimoAviso < 30_000) return false;
  ultimoAviso = agora;
  Alert.alert(
    'O PC recusou este celular',
    'O token deste aparelho não vale mais — acontece quando o QR é gerado de novo no ELYSIUM do PC. Em Ajustes → PCs, toque em "Adicionar PC" e leia o QR novo. Nada daqui é apagado.',
  );
  return true;
}
