import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { emFluxoExterno } from '../lib/atualizacaoOta';
import type { Fundo } from './fundo';

/**
 * Escolhe uma imagem da galeria e guarda uma cópia na pasta do app (a do seletor é cache e
 * some). Devolve o fundo novo, ou null se o dono desistiu. A cópia anterior é apagada.
 */
export async function escolherImagemDeFundo(anterior: Fundo): Promise<Fundo | null> {
  // Fora do app no seletor: sem isto, um OTA pendente poderia recarregar o app no meio.
  const r = await emFluxoExterno(() => DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false }));
  if (r.canceled || !r.assets?.[0]) return null;
  const pasta = new Directory(Paths.document, 'fundo');
  if (!pasta.exists) pasta.create();
  const ext = (r.assets[0].name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.jpg').toLowerCase();
  const destino = new File(pasta, `fundo-${Date.now()}${ext}`);
  new File(r.assets[0].uri).copy(destino);
  if (anterior.tipo === 'imagem') {
    try { new File(anterior.uri).delete(); } catch { /* já não existe */ }
  }
  return { tipo: 'imagem', uri: destino.uri };
}
