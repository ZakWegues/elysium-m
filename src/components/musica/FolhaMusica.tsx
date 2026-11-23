import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { errMessage } from '../../lib/errors';
import { haptica } from '../../lib/haptica';
import { carregarSugestoes, fazerPlaylist, gostosMudaram, pararPrevia, passarPara, porNaFila, recarregarSeMudou, useMusica } from '../../lib/musica';
import type { Pairing } from '../../lib/pairing';
import { callRpc, EstadoDosGostos, MusicaSugerida } from '../../lib/rpc';
import { comAlfa, useTheme } from '../../theme';
import { Text } from '../ui';
import { LinhaDeMusica, Sugestoes } from './Sugestoes';

export type AbaDaMusica = 'sugestoes' | 'estilos' | 'artistas' | 'musicas';
const ABAS: [AbaDaMusica, string][] = [['sugestoes', 'Para você'], ['estilos', 'Estilos'], ['artistas', 'Artistas'], ['musicas', 'Músicas']];

type Valor = 1 | -1 | 0 | null;
/** sem resposta → gosto → não gosto → sem resposta. */
const proximo = (v: Valor | undefined): 1 | -1 | null => (v === 1 ? -1 : v === -1 ? null : 1);

/**
 * A folha Música (23/11): as sugestões inteiras e o questionário de gostos — um toque gosta, o
 * segundo não gosta, o terceiro limpa. Tudo fica no PC e vale nos dois.
 */
export function FolhaMusica({ pairing, abaInicial = 'sugestoes', onFechar }: { pairing: Pairing; abaInicial?: AbaDaMusica; onFechar: () => void }) {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { itens, pronto } = useMusica();
  const [aba, setAba] = useState<AbaDaMusica>(abaInicial);
  const [gostos, setGostos] = useState<EstadoDosGostos | null>(null);
  const [estilo, setEstilo] = useState<string | null>(null);
  const [artistas, setArtistas] = useState<Record<string, { nome: string; foto: string | null }[]>>({});
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<{ nome: string; foto: string | null }[] | null>(null);
  const [musicas, setMusicas] = useState<MusicaSugerida[] | null>(null);
  const pedidos = useRef(0);
  // Dois toques seguidos não podem partir da mesma cópia: a resposta mais nova fica aqui.
  const agora = useRef<EstadoDosGostos | null>(null);
  const guardar = (g: EstadoDosGostos) => { agora.current = g; setGostos(g); };
  const falhou = (err: unknown) => ToastAndroid.show(errMessage(err), ToastAndroid.SHORT);

  useEffect(() => {
    callRpc(pairing, 'gostos.get').then((g) => { guardar(g); setEstilo((x) => x ?? (g.estilos.find((e) => e.valor === 1) ?? g.estilos[0])?.id ?? null); }).catch(falhou);
    return () => { pararPrevia(); recarregarSeMudou(pairing); };
  }, [pairing]);

  useEffect(() => { if (aba === 'sugestoes' && pronto === null) void carregarSugestoes(pairing); }, [aba, pronto, pairing]);
  useEffect(() => {
    if (aba !== 'artistas' || !estilo || artistas[estilo]) return;
    callRpc(pairing, 'gostos.artistas', { estilo }, { timeoutMs: 20000 }).then((r) => setArtistas((a) => ({ ...a, [estilo]: r.artistas }))).catch(falhou);
  }, [aba, estilo, artistas, pairing]);
  useEffect(() => { if (aba === 'musicas' && musicas === null) maisMusicas(); }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setAchados(null); return; }
    const minha = ++pedidos.current;
    const t = setTimeout(() => {
      callRpc(pairing, 'gostos.buscar', { q }, { timeoutMs: 10000 }).then((r) => { if (pedidos.current === minha) setAchados(r.artistas); }).catch(falhou);
    }, 350);
    return () => clearTimeout(t);
  }, [busca, pairing]);

  function maisMusicas() {
    setMusicas(null);
    callRpc(pairing, 'gostos.musicas', {}, { timeoutMs: 25000 }).then((r) => setMusicas(r.musicas)).catch((err) => { setMusicas([]); falhou(err); });
  }
  function marcarEstilo(id: string) {
    const g = agora.current;
    if (!g) return;
    haptica.tique();
    const valor = proximo(g.estilos.find((x) => x.id === id)?.valor);
    guardar({ ...g, estilos: g.estilos.map((x) => (x.id === id ? { ...x, valor } : x)) });
    callRpc(pairing, 'gostos.marcar', { tipo: 'estilo', id, valor }).then(gostosMudaram).catch(falhou);
  }
  function marcarArtista(nome: string) {
    const g = agora.current;
    if (!g) return;
    haptica.tique();
    const valor = proximo(g.respostas[nome]);
    const respostas = { ...g.respostas };
    if (valor === null) delete respostas[nome]; else respostas[nome] = valor;
    guardar({ ...g, respostas });
    callRpc(pairing, 'gostos.marcar', { tipo: 'artista', nome, valor }).then(gostosMudaram).catch(falhou);
  }

  function esquecer(a: NonNullable<EstadoDosGostos['aprendidos']>[number]) {
    const g = agora.current;
    if (!g) return;
    haptica.leve();
    guardar({ ...g, aprendidos: (g.aprendidos ?? []).filter((x) => x !== a) });
    callRpc(pairing, 'gostos.marcar', a.tipo === 'musica' ? { tipo: 'musica', musica: a.id, titulo: a.nome, artista: a.artista, valor: null } : { tipo: 'artista', nome: a.nome, valor: null }).then(gostosMudaram).catch(falhou);
  }

  const lista = achados ?? (estilo ? artistas[estilo] : undefined);
  const contas = gostos ? Object.values(gostos.respostas) : [];
  const ordem = gostos ? [...gostos.estilos].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)) : [];
  const carregando = <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />;
  const acao = (icone: keyof typeof Feather.glyphMap, rotulo: string, aoTocar: () => void) => (
    <Pressable key={rotulo} onPress={() => { haptica.leve(); aoTocar(); }} accessibilityRole="button" style={[styles.acao, { backgroundColor: palette.primarySoft }]}>
      <Feather name={icone} size={15} color={palette.primary} />
      <Text variant="caption" color={palette.text}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
        <View style={[styles.topo, { paddingHorizontal: tokens.spacing.lg }]}>
          <Feather name="music" size={18} color={palette.primary} />
          <Text variant="label" style={{ flex: 1 }}>Música</Text>
          <Pressable onPress={onFechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar"><Feather name="chevron-down" size={26} color={palette.textMuted} /></Pressable>
        </View>
        <View style={[styles.abas, { paddingHorizontal: tokens.spacing.lg }]}>
          {ABAS.map(([id, nome]) => (
            <Pressable key={id} onPress={() => setAba(id)} accessibilityRole="tab" accessibilityState={{ selected: aba === id }}
              style={[styles.aba, aba === id && { backgroundColor: comAlfa(palette.primary, 0.18) }]}>
              <Text variant="caption" color={aba === id ? palette.primary : palette.textMuted}>{nome}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: insets.bottom + 32 }}>
          {aba === 'sugestoes' ? (
            <>
              <Sugestoes pairing={pairing} completa />
              {pronto === false ? acao('arrow-right', 'Começar pelos estilos', () => setAba('estilos')) : null}
              {itens.length ? (
                <View style={styles.acoes}>
                  {acao('list', 'Pôr na fila', () => void porNaFila(pairing))}
                  {acao('plus', 'Criar playlist', () => void fazerPlaylist(pairing))}
                  {acao('smartphone', 'Continuar aqui', () => void passarPara(pairing, 'celular'))}
                  {acao('monitor', 'Continuar no PC', () => void passarPara(pairing, 'pc'))}
                </View>
              ) : null}
            </>
          ) : !gostos ? carregando : aba === 'estilos' ? (
            <>
              <Text variant="caption" color={palette.textMuted}>Um toque gosto, dois não gosto.</Text>
              <View style={styles.chips}>
                {gostos.estilos.map((x) => (
                  <Pressable key={x.id} onPress={() => marcarEstilo(x.id)} accessibilityRole="button" accessibilityLabel={`${x.nome}: ${x.valor === 1 ? 'gosto' : x.valor === -1 ? 'não gosto' : 'sem resposta'}`}
                    style={[styles.chip, { borderColor: palette.border }, x.valor === 1 && { backgroundColor: comAlfa(palette.primary, 0.22), borderColor: palette.primary }, x.valor === -1 && { opacity: 0.45 }]}>
                    <Text variant="body" color={x.valor === 1 ? palette.primary : palette.text} style={x.valor === -1 ? styles.riscado : undefined}>{x.nome}</Text>
                  </Pressable>
                ))}
              </View>
              {acao('arrow-right', 'Agora os artistas', () => setAba('artistas'))}
            </>
          ) : aba === 'artistas' ? (
            <>
              <TextInput value={busca} onChangeText={setBusca} placeholder="Procurar um artista" placeholderTextColor={palette.textMuted}
                style={[styles.campo, { color: palette.text, borderColor: palette.border }]} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                {ordem.map((x) => (
                  <Pressable key={x.id} onPress={() => { setBusca(''); setEstilo(x.id); }} accessibilityRole="button" style={[styles.aba, !achados && estilo === x.id && { backgroundColor: comAlfa(palette.primary, 0.18) }]}>
                    <Text variant="caption" color={!achados && estilo === x.id ? palette.primary : palette.textMuted}>{x.nome}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {!lista ? carregando : (
                <View style={styles.grade}>
                  {lista.map((a) => {
                    const v = gostos.respostas[a.nome];
                    return (
                      <Pressable key={a.nome} onPress={() => marcarArtista(a.nome)} accessibilityRole="button" accessibilityLabel={`${a.nome}: ${v === 1 ? 'gosto' : v === -1 ? 'não gosto' : 'sem resposta'}`} style={[styles.artista, v === -1 && { opacity: 0.4 }]}>
                        <View style={[styles.anel, { borderColor: v === 1 ? palette.primary : 'transparent' }]}>
                          {a.foto ? <Image source={{ uri: a.foto }} style={styles.foto} /> : <View style={[styles.foto, styles.semFoto, { backgroundColor: palette.primarySoft }]}><Text variant="heading" color={palette.primary}>{a.nome[0]}</Text></View>}
                        </View>
                        <Text variant="caption" numberOfLines={2} color={v === 1 ? palette.primary : palette.text} style={[styles.nome, v === -1 && styles.riscado]}>{a.nome}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text variant="caption" color={palette.textMuted}>{contas.filter((v) => v === 1).length} de que gosta, {contas.filter((v) => v === -1).length} de que não gosta.</Text>
            </>
          ) : (
            <>
              {gostos.aprendidos?.length ? (
                <>
                  <Text variant="caption" color={palette.textMuted}>Aprendi com você</Text>
                  <View style={styles.chips}>
                    {gostos.aprendidos.map((a) => (
                      <Pressable key={`${a.tipo}${a.id ?? a.nome}`} onPress={() => esquecer(a)} accessibilityRole="button" accessibilityLabel={`Esquecer ${a.nome}`} style={[styles.chip, styles.aprendido, { borderColor: palette.border }]}>
                        <Text variant="caption" numberOfLines={1} style={[{ flexShrink: 1 }, a.valor === -1 && styles.riscado]}>{a.artista ? `${a.nome}, ${a.artista}` : a.nome}</Text>
                        <Feather name="x" size={13} color={palette.textMuted} />
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              {musicas === null ? carregando : musicas.length === 0 ? <Text variant="caption" color={palette.textMuted}>Marque antes alguns artistas.</Text> : (
            <>
              <Text variant="caption" color={palette.textMuted}>Ouça um trecho na capa e diga se gosta.</Text>
              {musicas.map((m) => <LinhaDeMusica key={m.id} pairing={pairing} m={m} semTocar />)}
              {acao('refresh-cw', 'Outras músicas', maisMusicas)}
            </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  abas: { flexDirection: 'row', gap: 4, paddingBottom: 4 },
  aba: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acao: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  aprendido: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, maxWidth: '100%' },
  riscado: { textDecorationLine: 'line-through' },
  campo: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  artista: { width: '33.33%', alignItems: 'center', gap: 6 },
  anel: { padding: 3, borderWidth: 3, borderRadius: 999 },
  foto: { width: 72, height: 72, borderRadius: 36 },
  semFoto: { alignItems: 'center', justifyContent: 'center' },
  nome: { textAlign: 'center', paddingHorizontal: 4 },
});
