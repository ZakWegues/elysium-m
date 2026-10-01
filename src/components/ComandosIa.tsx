import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { Text } from './ui';
import { Markdown } from './Markdown';
import { useTheme } from '../theme';
import { callRpc } from '../lib/rpc';
import type { Pairing } from '../lib/pairing';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { textoPuro } from '../lib/markdown';

/**
 * Comandos de IA sobre um texto compartilhado (bloco 137) — e "Resumir a página" quando é
 * um link (bloco 138). Compartilhar do WhatsApp/navegador → escolher → copiar o resultado.
 * Roda no PC (comandos.run / link.resumir); o celular só mostra.
 */
type Comando = { id: string; nome: string };

export function ComandosIa({ texto, pairing }: { texto: string; pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [comandos, setComandos] = useState<Comando[] | null>(null);
  const [rodando, setRodando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ titulo: string; texto: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const link = /^https?:\/\/\S+$/i.test(texto.trim()) ? texto.trim() : null;

  useEffect(() => {
    callRpc(pairing, 'comandos.list')
      .then(r => setComandos(r.comandos))
      .catch(e => setErro(`O PC não respondeu (ou é anterior à 1.8.0): ${errMessage(e)}`));
  }, [pairing]);

  async function rodar(id: string, titulo: string) {
    setRodando(id); setErro(null); setResultado(null);
    try {
      const r = id === '__link'
        ? { resultado: (await callRpc(pairing, 'link.resumir', { url: link }, { timeoutMs: 120_000 })).resumo }
        : await callRpc(pairing, 'comandos.run', { comando: id, texto }, { timeoutMs: 120_000 });
      setResultado({ titulo, texto: r.resultado });
      haptica.leve();
    } catch (e) { setErro(errMessage(e)); }
    finally { setRodando(null); }
  }

  const botao = (id: string, nome: string, icone: keyof typeof Feather.glyphMap) => (
    <Pressable key={id} disabled={!!rodando} onPress={() => rodar(id, nome)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: tokens.radii.md, borderWidth: 1, borderColor: palette.border, opacity: rodando && rodando !== id ? 0.5 : 1 }}>
      <Feather name={icone} size={16} color={palette.primary} />
      <Text variant="body" style={{ flex: 1 }}>{nome}</Text>
      {rodando === id ? <ActivityIndicator size="small" color={palette.primary} /> : <Feather name="chevron-right" size={16} color={palette.textMuted} />}
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ gap: tokens.spacing.sm, paddingBottom: tokens.spacing.lg }}>
      <Text variant="caption" color={palette.textMuted} numberOfLines={3}>“{texto.slice(0, 240)}”</Text>
      {resultado ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="subheading">{resultado.titulo}</Text>
          <View style={{ padding: 12, borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }}>
            <Markdown texto={resultado.texto} cor={palette.text} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => { Clipboard.setStringAsync(textoPuro(resultado.texto)).catch(() => {}); haptica.leve(); }}
              style={{ flex: 1, alignItems: 'center', padding: 11, borderRadius: tokens.radii.md, backgroundColor: palette.primary }}>
              <Text variant="label" color={palette.onPrimary}>Copiar</Text>
            </Pressable>
            <Pressable onPress={() => { Share.share({ message: textoPuro(resultado.texto) }).catch(() => {}); }}
              style={{ flex: 1, alignItems: 'center', padding: 11, borderRadius: tokens.radii.md, borderWidth: 1, borderColor: palette.border }}>
              <Text variant="label">Compartilhar</Text>
            </Pressable>
            <Pressable onPress={() => setResultado(null)}
              style={{ alignItems: 'center', padding: 11, borderRadius: tokens.radii.md, borderWidth: 1, borderColor: palette.border }}>
              <Feather name="rotate-ccw" size={16} color={palette.textMuted} />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {link && botao('__link', 'Resumir a página', 'file-text')}
          {!comandos && !erro && <ActivityIndicator color={palette.primary} />}
          {comandos?.map(c => botao(c.id, c.nome, 'zap'))}
        </>
      )}
      {erro && <Text variant="caption" color={palette.error}>{erro}</Text>}
    </ScrollView>
  );
}
