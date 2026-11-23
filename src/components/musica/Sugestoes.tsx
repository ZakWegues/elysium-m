import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { Pairing } from '../../lib/pairing';
import type { MomentoMusical, MusicaSugerida } from '../../lib/rpc';
import { alternarPrevia, avaliar, carregarSugestoes, tocarSugestao, useCarregarSugestoes, useMusica } from '../../lib/musica';
import { haptica } from '../../lib/haptica';
import { comAlfa, useTheme } from '../../theme';
import { Text } from '../ui';
import { FolhaMusica, type AbaDaMusica } from './FolhaMusica';

const MOMENTOS: [MomentoMusical, string][] = [['geral', 'Tudo'], ['foco', 'Foco'], ['treino', 'Treino'], ['noite', 'Noite']];

/** Uma música: a capa toca o trecho, o texto toca a música aqui, e os polegares ensinam. */
export function LinhaDeMusica({ pairing, m, semTocar, comMotivo }: { pairing: Pairing; m: MusicaSugerida; semTocar?: boolean; comMotivo?: boolean }) {
  const { palette, tokens } = useTheme();
  const { previa, notas } = useMusica();
  const nota = notas[m.id];
  const botao = (icone: keyof typeof Feather.glyphMap, rotulo: string, aceso: boolean, aoTocar: () => void) => (
    <Pressable onPress={() => { haptica.leve(); aoTocar(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={rotulo} style={styles.botao}>
      <Feather name={icone} size={16} color={aceso ? palette.primary : palette.textMuted} />
    </Pressable>
  );
  return (
    <View style={styles.linha}>
      <Pressable onPress={() => void alternarPrevia(pairing, m.id)} accessibilityRole="button" accessibilityLabel={previa === m.id ? 'Parar o trecho' : `Ouvir um trecho de ${m.titulo}`}
        style={[styles.capa, { borderRadius: tokens.radii.sm, backgroundColor: palette.primarySoft }]}>
        {m.capa ? <Image source={{ uri: m.capa }} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, styles.capaIcone, previa === m.id && styles.capaTocando]}>
          <Feather name={previa === m.id ? 'pause' : 'play'} size={14} color="#fff" />
        </View>
      </Pressable>
      <Pressable style={{ flex: 1 }} disabled={semTocar} onPress={() => { haptica.leve(); void tocarSugestao(pairing, m, 'celular'); }} accessibilityRole="button" accessibilityLabel={`Tocar ${m.titulo} no celular`}>
        <Text variant="body" numberOfLines={1}>{m.titulo}</Text>
        <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{m.artista}</Text>
        {comMotivo && m.motivo ? <Text variant="caption" color={palette.textMuted} numberOfLines={2} style={{ opacity: 0.75 }}>{m.motivo}</Text> : null}
      </Pressable>
      {botao('thumbs-up', 'Gostei', nota === 1, () => void avaliar(pairing, m, 1))}
      {botao('thumbs-down', 'Não gostei', nota === -1, () => void avaliar(pairing, m, -1))}
      {semTocar ? null : botao('monitor', 'Tocar no PC', false, () => void tocarSugestao(pairing, m, 'pc'))}
    </View>
  );
}

/** "Talvez você goste": no card do Início, na tela do PC, no player e na folha Música. */
export function Sugestoes({ pairing, quantas = 3, completa }: { pairing: Pairing; quantas?: number; completa?: boolean }) {
  const { palette, tokens } = useTheme();
  const s = useMusica();
  useCarregarSugestoes(pairing);
  const [folha, setFolha] = useState<AbaDaMusica | null>(null);

  return (
    <View style={{ gap: 6 }}>
      {s.pronto === false ? (
        <View style={styles.vazio}>
          <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>Conte do que você gosta e eu sugiro músicas novas.</Text>
          {completa ? null : (
            <Pressable onPress={() => setFolha('estilos')} accessibilityRole="button" style={[styles.chip, { backgroundColor: palette.primarySoft }]}>
              <Text variant="caption" color={palette.primary}>Responder</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <View style={styles.cab}>
            <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>Talvez você goste</Text>
            <Pressable onPress={() => void carregarSugestoes(pairing, { refazer: true })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Outras sugestões" style={[styles.botao, s.carregando && { opacity: 0.4 }]}>
              <Feather name="refresh-cw" size={15} color={palette.textMuted} />
            </Pressable>
            {completa ? null : (
              <Pressable onPress={() => setFolha('sugestoes')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ver tudo e meus gostos" style={styles.botao}>
                <Feather name="maximize-2" size={15} color={palette.textMuted} />
              </Pressable>
            )}
          </View>
          <View style={styles.momentos}>
            {MOMENTOS.map(([id, nome]) => (
              <Pressable key={id} onPress={() => void carregarSugestoes(pairing, { momento: id })} accessibilityRole="button" accessibilityState={{ selected: s.momento === id }}
                style={[styles.chip, s.momento === id && { backgroundColor: comAlfa(palette.primary, 0.18) }]}>
                <Text variant="caption" color={s.momento === id ? palette.primary : palette.textMuted}>{nome}</Text>
              </Pressable>
            ))}
          </View>
          {s.itens.length ? (
            <View style={[{ gap: tokens.spacing.xs }, s.carregando && { opacity: 0.5 }]}>
              {s.itens.slice(0, completa ? undefined : quantas).map((m) => <LinhaDeMusica key={m.id} pairing={pairing} m={m} comMotivo={completa} />)}
            </View>
          ) : (
            <Text variant="caption" color={palette.textMuted}>{s.carregando || s.pronto === null && !s.erro ? 'Procurando…' : s.erro ? 'Não consegui falar com o PC agora.' : 'Sem sugestões agora.'}</Text>
          )}
        </>
      )}
      {folha ? <FolhaMusica pairing={pairing} abaInicial={folha} onFechar={() => setFolha(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  capa: { width: 42, height: 42, overflow: 'hidden' },
  capaIcone: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  capaTocando: { backgroundColor: 'rgba(0,0,0,0.55)' },
  botao: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  cab: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  momentos: { flexDirection: 'row', gap: 4 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  vazio: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
