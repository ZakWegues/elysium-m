import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme';
import { Button, Card, Text } from './ui';
import type { Pairing } from '../lib/pairing';
import type { PacoteAtualizacao } from '../lib/rpc';
import { adiada, adiar, apkNovo, baixarEInstalar, versaoInstalada } from '../lib/atualizacao';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';

/**
 * O cartão "ELYSIUM-M x.y.z disponível" (bloco 95).
 *
 * - `modo="inicio"`: só aparece quando há versão nova E ela não foi adiada; "Agora não"
 *   esconde até a PRÓXIMA versão. PC fora de alcance = nada, sem erro na tela.
 * - `modo="sobre"`: sempre aparece, com "Procurar versão nova" (pede ao PC conferir o GitHub
 *   na hora) e o motivo quando não há nada.
 */
export default function AvisoAtualizacao({ pairing, modo }: { pairing: Pairing; modo: 'inicio' | 'sobre' }) {
  const { palette, tokens } = useTheme();
  const [pacote, setPacote] = useState<PacoteAtualizacao | null>(null);
  const [escondido, setEscondido] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [situacao, setSituacao] = useState('');

  const conferir = useCallback(async (verificar = false) => {
    try {
      if (verificar) setSituacao('Perguntando ao PC…');
      const p = await apkNovo(pairing, verificar);
      setPacote(p);
      setEscondido(p ? modo === 'inicio' && (await adiada(p.versao)) : false);
      setSituacao(p ? '' : `Você está na versão mais nova (${versaoInstalada()}).`);
    } catch (e) {
      setPacote(null);
      setSituacao(`Não consegui perguntar ao PC: ${errMessage(e)}`);
    }
  }, [pairing, modo]);

  useEffect(() => { void conferir(); }, [conferir]);

  async function instalar() {
    if (!pacote) return;
    haptica.medio();
    setProgresso(0);
    try {
      await baixarEInstalar(pairing, pacote, setProgresso);
      haptica.sucesso();
    } catch (e) {
      haptica.erro();
      Alert.alert('Não deu para atualizar', errMessage(e));
    } finally {
      setProgresso(null);
    }
  }

  if (modo === 'inicio' && (!pacote || escondido)) return null;

  if (!pacote) {
    return (
      <Card glass style={{ gap: tokens.spacing.sm }}>
        <Text variant="body">{situacao || 'Conferindo…'}</Text>
        <Button title="Procurar versão nova" variant="secondary" onPress={() => conferir(true)} />
      </Card>
    );
  }

  const mb = Math.round(pacote.tamanho / 1e6);
  return (
    <Card glass style={{ gap: tokens.spacing.sm, borderColor: palette.primary, borderWidth: 1 }}>
      <View style={styles.linha}>
        <View style={[styles.icone, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
          <Feather name="download" size={18} color={palette.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label">ELYSIUM-M {pacote.versao} disponível</Text>
          <Text variant="caption" color={palette.textMuted}>
            Você tem a {versaoInstalada()} · {mb} MB, vem do PC
          </Text>
        </View>
        {modo === 'inicio' && progresso === null && (
          <Pressable
            hitSlop={10}
            onPress={async () => { await adiar(pacote.versao); setEscondido(true); }}
            accessibilityLabel="Agora não"
          >
            <Feather name="x" size={18} color={palette.textMuted} />
          </Pressable>
        )}
      </View>
      {!!pacote.notas && (
        <Text variant="caption" color={palette.textMuted} numberOfLines={modo === 'inicio' ? 3 : 12}>
          {pacote.notas.replace(/\n*versionCode \d+\s*$/, '')}
        </Text>
      )}
      {progresso !== null ? (
        <View style={[styles.barra, { backgroundColor: palette.primarySoft, borderRadius: 3 }]}>
          <View style={{ width: `${Math.round(progresso * 100)}%`, height: '100%', backgroundColor: palette.primary, borderRadius: 3 }} />
        </View>
      ) : (
        <Button title="Baixar e instalar" onPress={instalar} />
      )}
      {progresso !== null && (
        <Text variant="caption" color={palette.textMuted}>
          Baixando do PC… {Math.round(progresso * 100)}% — depois o Android pede para confirmar.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icone: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  barra: { height: 6, overflow: 'hidden' },
});
