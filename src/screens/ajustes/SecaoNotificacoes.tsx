import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, ToastAndroid, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { errMessage } from '../../lib/errors';
import { haptica } from '../../lib/haptica';
import { abrirAcessoDeNotificacoes, abrirDetalhesDoApp, atualizarEscuta, desligarEscuta, escolherApps, ligarEscuta, LE_NOTIFICACOES, useEscuta } from '../../lib/notificacoesLidas';
import type { Pairing } from '../../lib/pairing';
import { comAlfa, useTheme } from '../../theme';
import { Text, VidroSwitch } from '../../components/ui';

const NOMES: Record<string, string> = { 'com.whatsapp': 'WhatsApp', 'com.whatsapp.w4b': 'WhatsApp Business', 'org.telegram.messenger': 'Telegram', 'com.instagram.android': 'Instagram', 'com.facebook.orca': 'Messenger', 'com.discord': 'Discord', 'com.google.android.gm': 'Gmail', 'com.microsoft.office.outlook': 'Outlook', 'com.twitter.android': 'X' };

/** "A Ely lê as notificações" em Ajustes (25/11): liga, guia o acesso e escolhe os apps. */
export function SecaoNotificacoes({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const e = useEscuta();
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    atualizarEscuta();
    const s = AppState.addEventListener('change', (a) => { if (a === 'active') atualizarEscuta(); });
    return () => s.remove();
  }, []);
  if (!LE_NOTIFICACOES) return null;

  async function trocar(v: boolean) {
    if (!v) { desligarEscuta(); return; }
    setOcupado(true);
    try {
      await ligarEscuta(pairing);
      if (!e.acesso) abrirAcessoDeNotificacoes();
    } catch (err) { ToastAndroid.show(errMessage(err), ToastAndroid.SHORT); }
    finally { setOcupado(false); }
  }
  // Os de conversa que já apareceram (ou estão ligados) primeiro; os outros vistos depois.
  const vistos = new Map(e.vistos.map((v) => [v.pacote, v.nome]));
  const pacotes = [...new Set([...e.apps.filter((p) => vistos.has(p) || NOMES[p]), ...vistos.keys()])].sort((a, b) => Number(e.apps.includes(b)) - Number(e.apps.includes(a)));

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <View style={[styles.linha, { borderRadius: tokens.radii.md, borderColor: palette.border }]}>
        <Feather name="bell" size={17} color={e.ligado ? palette.primary : palette.textMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="body">A Ely lê as notificações</Text>
          <Text variant="caption" color={palette.textMuted}>
            {e.ligado && !e.acesso ? 'Falta liberar o acesso no Android.' : 'Resume o que chegou e avisa o importante. Banco, senha e código ficam de fora.'}
          </Text>
        </View>
        <VidroSwitch value={e.ligado} onValueChange={(v) => { if (!ocupado) void trocar(v); }} accessibilityLabel="A Ely lê as notificações" />
      </View>
      {e.ligado && !e.acesso ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" color={palette.textMuted}>
            Se o Android disser que a configuração é restrita: abra os detalhes do app, toque nos três pontinhos e em “Permitir configurações restritas”. Depois libere o acesso.
          </Text>
          <View style={styles.botoes}>
            {([['Detalhes do app', abrirDetalhesDoApp], ['Liberar acesso', abrirAcessoDeNotificacoes]] as const).map(([rotulo, acao]) => (
              <Pressable key={rotulo} onPress={() => { haptica.leve(); acao(); }} accessibilityRole="button" style={[styles.botao, { backgroundColor: palette.primarySoft }]}>
                <Text variant="caption" color={palette.primary}>{rotulo}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {e.ligado && e.acesso ? (
        <>
          <Text variant="caption" color={palette.textMuted}>
            {e.naFila ? `${e.naFila} esperando o PC. ` : ''}Toque para escolher os apps.
          </Text>
          <View style={styles.botoes}>
            {pacotes.map((p) => {
              const on = e.apps.includes(p);
              return (
                <Pressable key={p} onPress={() => { haptica.tique(); escolherApps(on ? e.apps.filter((x) => x !== p) : [...e.apps, p]); }} accessibilityRole="switch" accessibilityState={{ checked: on }}
                  style={[styles.app, { borderColor: on ? palette.primary : palette.border }, on && { backgroundColor: comAlfa(palette.primary, 0.16) }]}>
                  <Text variant="caption" color={on ? palette.primary : palette.textMuted}>{vistos.get(p) ?? NOMES[p] ?? p}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 14 },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botao: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  app: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
