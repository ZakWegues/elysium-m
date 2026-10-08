import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme';
import { Button, Card, Text } from './ui';
import type { Pairing } from '../lib/pairing';
import {
  abrirPermissaoDeInstalar, adiada, adiar, baixarEInstalar, cancelarDownload, instalarNoPc, marcarNovidadesVistas, notasLimpas,
  novidadesPendentes, situacaoAtualizacao, versaoInstalada, type SituacaoAtualizacao,
} from '../lib/atualizacao';
import { confirmDestructive } from '../lib/confirm';
import { emFluxoExterno } from '../lib/atualizacaoOta';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';

/**
 * Versões novas (bloco 95).
 *
 * - `modo="inicio"`: só aparece quando há APK novo E ele não foi adiado; "agora não" esconde
 *   até a PRÓXIMA versão. PC fora de alcance = nada, sem erro na tela.
 * - `modo="sobre"`: sempre aparece — o celular e o PC, cada um com seu botão, mais "Procurar
 *   versão nova" (pede ao PC conferir o GitHub na hora).
 */
export default function AvisoAtualizacao({ pairing, modo }: { pairing: Pairing; modo: 'inicio' | 'sobre' }) {
  const { palette, tokens } = useTheme();
  const [sit, setSit] = useState<SituacaoAtualizacao | null>(null);
  const [escondido, setEscondido] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [situacao, setSituacao] = useState('');
  const [instalandoPc, setInstalandoPc] = useState(false);

  const conferir = useCallback(async (verificar = false) => {
    try {
      if (verificar) setSituacao('Perguntando ao PC…');
      const s = await situacaoAtualizacao(pairing, verificar);
      setSit(s);
      setEscondido(s.apk ? modo === 'inicio' && (await adiada(s.apk.versao)) : false);
      setSituacao('');
    } catch (e) {
      setSit(null);
      setSituacao(`Não consegui perguntar ao PC: ${errMessage(e)}`);
    }
  }, [pairing, modo]);

  // Pergunta ao abrir e ao voltar ao app. Status do PC com mais de 30 min (ele confere a
  // cada 6 h): pede para conferir o GitHub agora, em segundo plano, e mostra quando voltar
  // (07/10 — antes o cartão só via o que o PC achou na última volta dele).
  useEffect(() => {
    let vivo = true;
    const rodar = async () => {
      await conferir();
      try {
        const s = await situacaoAtualizacao(pairing);
        if (vivo && (!s.verificadoEm || Date.now() - s.verificadoEm > 30 * 60_000)) {
          await situacaoAtualizacao(pairing, true);
          if (vivo) await conferir();
        }
      } catch { /* PC fora: o cartão só não aparece */ }
    };
    void rodar();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void rodar(); });
    return () => { vivo = false; sub.remove(); };
  }, [conferir, pairing]);

  const apk = sit?.apk ?? null;

  async function instalar() {
    if (!apk) return;
    haptica.medio();
    setProgresso(0);
    try {
      await emFluxoExterno(() => baixarEInstalar(pairing, apk, setProgresso));
      // Chegou aqui = o instalador fechou SEM instalar (instalando, o app reinicia). Antes
      // isto vibrava "sucesso" e o cartão continuava lá sem explicação.
      haptica.aviso();
      Alert.alert(
        'A instalação não terminou',
        'Se o Android pediu para permitir "instalar apps desconhecidos", libere para o ELYSIUM-M e toque em "Baixar e instalar" de novo.',
        [
          { text: 'Abrir a permissão', onPress: () => { void emFluxoExterno(abrirPermissaoDeInstalar); } },
          { text: 'Tentar de novo', onPress: () => { void instalar(); } },
          { text: 'Agora não', style: 'cancel' },
        ],
      );
    } catch (e) {
      haptica.erro();
      if (!/cancel/i.test(errMessage(e))) Alert.alert('Não deu para atualizar', errMessage(e));
    } finally {
      setProgresso(null);
    }
  }

  async function atualizarPc() {
    if (!sit?.pcNova) return;
    haptica.aviso();
    const ok = await confirmDestructive(`Atualizar o PC para a ${sit.pcNova.versao}?`, 'O ELYSIUM do PC fecha por alguns segundos e volta sozinho.');
    if (ok !== 'confirmed') return;
    setInstalandoPc(true);
    try {
      Alert.alert('Atualizando o PC', await instalarNoPc(pairing));
      haptica.sucesso();
    } catch (e) {
      haptica.erro();
      Alert.alert('Não deu para atualizar o PC', errMessage(e));
    } finally {
      setInstalandoPc(false);
    }
  }

  if (modo === 'inicio' && (!apk || escondido)) return null;

  const cartaoApk = apk && (
    <Card glass style={{ gap: tokens.spacing.sm, borderColor: palette.primary, borderWidth: 1 }}>
      <View style={styles.linha}>
        <View style={[styles.icone, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
          <Feather name="download" size={18} color={palette.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label">ELYSIUM-M {apk.versao} disponível</Text>
          <Text variant="caption" color={palette.textMuted}>
            Você tem a {versaoInstalada()} · {Math.round(apk.tamanho / 1e6)} MB, vem do PC
          </Text>
        </View>
        {modo === 'inicio' && progresso === null && (
          <Pressable
            hitSlop={10}
            onPress={async () => { await adiar(apk.versao); setEscondido(true); }}
            accessibilityLabel="Agora não"
          >
            <Feather name="x" size={18} color={palette.textMuted} />
          </Pressable>
        )}
      </View>
      {!!notasLimpas(apk.notas) && (
        <Text variant="caption" color={palette.textMuted} numberOfLines={modo === 'inicio' ? 3 : 12}>
          {notasLimpas(apk.notas)}
        </Text>
      )}
      {progresso !== null ? (
        <>
          <View style={[styles.barra, { backgroundColor: palette.primarySoft, borderRadius: 3 }]}>
            <View style={{ width: `${Math.round(progresso * 100)}%`, height: '100%', backgroundColor: palette.primary, borderRadius: 3 }} />
          </View>
          <View style={styles.linha}>
            <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>
              Baixando do PC… {Math.round(progresso * 100)}% — depois o Android pede para confirmar.
            </Text>
            <Pressable onPress={cancelarDownload} hitSlop={12} accessibilityLabel="Cancelar o download">
              <Text variant="label" color={palette.textMuted}>Cancelar</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Button title="Baixar e instalar" onPress={instalar} />
      )}
    </Card>
  );

  if (modo === 'inicio') return cartaoApk;

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {cartaoApk}
      <Card glass style={{ gap: tokens.spacing.sm }}>
        {!!situacao && <Text variant="caption" color={palette.textMuted}>{situacao}</Text>}
        {sit?.baixando && (
          <Text variant="body">O PC está baixando {sit.baixando.oque}… {Math.round(sit.baixando.progresso * 100)}%. Toque em "Procurar" de novo em instantes.</Text>
        )}
        {sit?.problema && <Text variant="body" color={palette.error}>{sit.problema}</Text>}
        {sit && !apk && !sit.baixando && !sit.problema && (
          <Text variant="body">Celular na versão mais nova ({versaoInstalada()}).</Text>
        )}
        {sit && (sit.pcNova ? (
          <>
            <Text variant="body">PC: a versão {sit.pcNova.versao} está baixada (o PC está na {sit.pcAtual}).</Text>
            <Button title={instalandoPc ? 'Atualizando…' : 'Atualizar o PC'} variant="secondary" onPress={atualizarPc} disabled={instalandoPc} />
          </>
        ) : (
          <Text variant="caption" color={palette.textMuted}>PC na versão {sit.pcAtual}, a mais nova publicada.</Text>
        ))}
        <Button title="Procurar versão nova" variant="secondary" onPress={() => conferir(true)} />
      </Card>
    </View>
  );
}

/**
 * "Novidades da x.y.z" (fase 12): na primeira abertura depois de atualizar pelo cartão acima,
 * a Início mostra uma vez o que mudou.
 */
export function NovidadesCelular() {
  const { palette, tokens } = useTheme();
  const [n, setN] = useState<{ versao: string; notas: string } | null>(null);
  useEffect(() => { novidadesPendentes().then(setN); }, []);
  if (!n) return null;
  return (
    <Card glass style={{ gap: tokens.spacing.sm, borderColor: palette.primary, borderWidth: 1 }}>
      <View style={styles.linha}>
        <Feather name="star" size={18} color={palette.primary} />
        <Text variant="label" style={{ flex: 1 }}>Novidades da {n.versao}</Text>
        <Pressable hitSlop={10} onPress={() => { setN(null); void marcarNovidadesVistas(); }}>
          <Text variant="caption" color={palette.primary}>Entendi</Text>
        </Pressable>
      </View>
      <Text variant="caption" color={palette.textMuted}>{n.notas}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icone: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  barra: { height: 6, overflow: 'hidden' },
});
