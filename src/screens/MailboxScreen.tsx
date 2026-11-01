import { useFolgaDaBarra } from '../lib/folgaBarra';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { TextoComLinks } from '../components/TextoComLinks';
import { useAbaAtiva } from '../components/AbaViva';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { baseUrl, Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  ackMessage,
  fetchMessageContent,
  listMessages,
  MAILBOX_MAX_ATTACHMENT_BYTES,
  MailboxMessage,
  sendMessage,
} from '../lib/mailbox';
import { loadFavorites, saveCache, loadCache, toggleFavorite as toggleFavoriteStore } from '../lib/mailboxStore';
import { callRpc } from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { useTheme } from '../theme';
import { GlassCircle, GlassFill, ScreenHeader, Text, useFolgaDoTopo } from '../components/ui';
import { avisarTokenRecusado } from '../lib/erroRpc';
import { mandarArquivoParaPc } from '../lib/shareIntent';
import { abrirArquivo, baixarAnexo, LIMITE_ENVIO_PARA_O_PC, planejarEnvio, resumoDosArquivos, salvarArquivo, tamanhoLegivel, tipoDoArquivo } from '../lib/anexos';
import { aoChegarRecado } from '../lib/mailboxAviso';
import { haptica } from '../lib/haptica';

// 24/10: o recado novo já chega pelo WebSocket (aoChegarRecado); a consulta é só rede de segurança.
const POLL_INTERVAL_MS = 60000;

type PendingAttachment = { name: string; mimeType: string; uri: string; sizeBytes: number };

export default function MailboxScreen({
  pairing,
  onUnpair,
  semCabecalho,
  sessionId,
}: {
  pairing: Pairing;
  onUnpair: () => void;
  /** Dentro do ChatHub o cabeçalho é do hub, com o switch IA ↔ PC. */
  semCabecalho?: boolean;
  /**
   * Conversa aberta. `null` deixa o PC decidir (a ativa dele) — é o que mantém o app
   * funcionando contra um PC que ainda não conhece conversas separadas.
   */
  sessionId?: string | null;
}) {
  const { palette, tokens } = useTheme();
  const folgaDaBarra = useFolgaDaBarra();
  const folgaTopo = useFolgaDoTopo();
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  /** 21/10: download de anexo em andamento (com progresso). */
  const [baixando, setBaixando] = useState<{ id: string; nome: string; fracao: number } | null>(null);
  const fetchingImages = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<MailboxMessage>>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await listMessages(pairing, sessionId ?? null);
      setMessages(items);
      // O cache guarda TODAS as conversas. Gravar só as desta apagaria o histórico
      // offline das outras — que é justamente o que a tela de histórico lê.
      loadCache()
        .then(cache => {
          const outras = sessionId
            ? cache.messages.filter(m => m.sessionId !== sessionId)
            : [];
          return saveCache({ messages: [...outras, ...items] });
        })
        .catch(err => console.warn('[caixa] falha ao gravar cache', err));

      const unreadFromPc = items.filter((m) => m.from === 'pc' && !m.readAt);
      if (unreadFromPc.length > 0) {
        await Promise.all(
          unreadFromPc.map((m) =>
            ackMessage(pairing, m.id).catch((err) => console.warn('[mailbox] falha ao confirmar leitura', m.id, err))
          )
        );
        setMessages((prev) =>
          prev.map((m) => (unreadFromPc.some((u) => u.id === m.id) ? { ...m, readAt: Date.now() } : m))
        );
      }
    } catch (err) {
      if (err instanceof AuthError) {
        // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
        avisarTokenRecusado();
        return;
      }
      console.error('[mailbox] falha ao atualizar', err);
    }
  }, [pairing, onUnpair, sessionId]);

  useEffect(() => {
    (async () => {
      const [cache, favs] = await Promise.all([loadCache(), loadFavorites()]);
      setMessages(
        sessionId ? cache.messages.filter(m => m.sessionId === sessionId) : cache.messages
      );
      setFavorites(favs);
      setLoading(false);
      refresh();
    })();
  }, [refresh, sessionId]);

  // 21/10: recado/arquivo novo do PC chega pelo WebSocket — recarrega na hora.
  useEffect(() => aoChegarRecado(() => { refresh(); }), [refresh]);

  // Com o Chat escondido (abas vivas), a Caixa não consulta o PC a cada minuto à toa.
  const ativa = useAbaAtiva();
  useEffect(() => {
    if (!ativa) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, ativa]);

  /**
   * 🔴 A conversa abria no MEIO, não na última mensagem.
   *
   * A versão anterior mandava `scrollToEnd` num efeito disparado por `messages.length`.
   * Dois furos, e os dois aparecem justamente na abertura:
   *
   * 1. O comprimento vai de 0 para N quando o cache local chega, mas a `FlatList` ainda
   *    não mediu as linhas. `scrollToEnd` calcula com a altura que ela conhece — que é
   *    quase nenhuma — e para onde der. Como as bolhas têm alturas bem diferentes (texto
   *    curto, texto longo, imagem), o erro acumulado joga a lista para o meio.
   * 2. Se o servidor devolver a mesma quantidade que estava em cache, `messages.length`
   *    não muda, o efeito não roda de novo, e a âncora errada fica de pé.
   *
   * A correção escuta o tamanho do CONTEÚDO em vez da contagem: toda vez que a lista
   * cresce de verdade — inclusive quando uma imagem termina de carregar e empurra tudo
   * para baixo — decidimos se acompanhamos.
   */
  const jaAncorou = useRef(false);
  /** O dedo está por perto do fim? Só então a lista acompanha mensagem nova. */
  const coladoNoFim = useRef(true);
  /**
   * 🔴 O QUE AINDA ABRIA NO MEIO, e por quê.
   *
   * O bloco 42 trocou a contagem de mensagens pelo tamanho do conteúdo, o que estava
   * certo, mas travava a âncora no PRIMEIRO `onContentSizeChange`. Esse primeiro evento
   * não é a lista inteira: a `FlatList` renderiza a janela inicial (10 linhas), dispara
   * o evento com a altura DELAS, e só depois monta o resto. O `scrollToEnd` daquele
   * instante vai para o fim de 10 linhas — o meio da conversa.
   *
   * Depois disso a decisão passava a depender do `onScroll`, e aí entra a corrida: o
   * evento de rolagem chega com o `contentSize` do quadro anterior. Se mais linhas
   * montaram no meio, `faltando` vem grande, `coladoNoFim` vira false e a âncora desiste
   * de vez — parada exatamente onde estava. Conversa mais curta só reduz a chance de a
   * corrida acontecer; não corrige nada.
   *
   * A correção é não usar POSIÇÃO para decidir enquanto o usuário não tocou na lista.
   * Só o arrasto dele solta a âncora, e voltar ao fim a prende de novo.
   */
  const usuarioArrastou = useRef(false);

  // A conversa mudou: a âncora recomeça. Sem isso, trocar de conversa herdaria o estado
  // de rolagem da anterior e abriria a nova no lugar errado.
  useEffect(() => {
    jaAncorou.current = false;
    usuarioArrastou.current = false;
    coladoNoFim.current = true;
  }, [sessionId]);

  const aoCrescerConteudo = useCallback((_l: number, altura: number) => {
    if (__DEV__) {
      console.log("[caixa] conteudo cresceu", {
        altura, jaAncorou: jaAncorou.current, arrastou: usuarioArrastou.current,
        coladoNoFim: coladoNoFim.current,
      });
    }
    if (!usuarioArrastou.current) {
      // Enquanto o dedo não entrou na história, TODO crescimento reancora. A primeira vez
      // sem animar (animar mostraria a lista rolando sozinha na abertura, que é a própria
      // sensação de "abriu torto"); as seguintes acompanham suave.
      listRef.current?.scrollToEnd({ animated: jaAncorou.current });
      jaAncorou.current = true;
      return;
    }
    // Depois do primeiro arrasto, só acompanha quem estava lendo o fim. Puxar a tela de
    // volta enquanto o usuário lê uma mensagem antiga é pior que não rolar.
    if (coladoNoFim.current) listRef.current?.scrollToEnd({ animated: true });
  }, [sessionId]);

  useEffect(() => {
    const toFetch = messages.filter(
      (m) =>
        m.attachment?.mimeType.startsWith('image/') &&
        // Prévia só de imagem que cabe em base64; foto enorme abre pelo toque (21/10).
        (m.attachment?.sizeBytes ?? 0) <= MAILBOX_MAX_ATTACHMENT_BYTES &&
        !imageCache[m.id] &&
        !fetchingImages.current.has(m.id)
    );
    toFetch.forEach((m) => {
      fetchingImages.current.add(m.id);
      fetchMessageContent(pairing, m.id)
        .then((content) => {
          if (content.attachment?.base64) {
            setImageCache((prev) => ({ ...prev, [m.id]: content.attachment!.base64 }));
          }
        })
        .catch((err) => console.warn('[mailbox] falha ao carregar preview de imagem', m.id, err))
        .finally(() => fetchingImages.current.delete(m.id));
    });
  }, [messages, pairing, imageCache]);

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) setDraft(text);
  }

  // Fase 21: vários arquivos de uma vez, de qualquer tipo (antes: um só, imagem ou PDF).
  async function handleAttach() {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: false,
    });
    if (result.canceled || !result.assets.length) return;
    const escolhidos: PendingAttachment[] = result.assets.map((a) => ({
      name: a.name,
      mimeType: a.mimeType ?? 'application/octet-stream',
      uri: a.uri,
      sizeBytes: a.size ?? 0,
    }));
    // 22/10: até 500 MB por arquivo (PC 2.15+, em stream). PC antigo recusa acima de 5 MB com aviso.
    const { aceitos, grandes } = planejarEnvio([...attachments, ...escolhidos], LIMITE_ENVIO_PARA_O_PC);
    if (grandes.length) {
      Alert.alert(
        grandes.length === 1 ? 'Um arquivo ficou de fora' : `${grandes.length} arquivos ficaram de fora`,
        `Passam de 500 MB: ${grandes.map((g) => g.name).join(', ')}`,
      );
    }
    setAttachments(aceitos);
  }

  function guessKind(text: string): 'link' | 'note' {
    return /^https?:\/\//i.test(text.trim()) ? 'link' : 'note';
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text && !attachments.length) return;
    setSending(true);
    const fila = attachments.slice();
    let enviados = 0;

    try {
      if (!fila.length) {
        await sendMessage(pairing, { kind: guessKind(text), text, sessionId: sessionId ?? null });
        haptica.leve();
      }
      // Um recado por arquivo (o PC guarda um anexo por recado); o texto vai junto do primeiro.
      for (const [i, a] of fila.entries()) {
        const contagem = fila.length > 1 ? `${i + 1}/${fila.length}` : '';
        setProgresso(contagem || null);
        await mandarArquivoParaPc(pairing, { uri: a.uri, nome: a.name, mimeType: a.mimeType, bytes: a.sizeBytes }, i === 0 && text ? text : null, {
          sessionId: sessionId ?? null,
          progresso: (p) => setProgresso(`${contagem ? `${contagem} · ` : ''}${Math.round(p * 100)}%`),
        });
        enviados++;
        // O que já foi não volta para a fila se o próximo falhar.
        setAttachments((prev) => prev.filter((x) => x.uri !== a.uri));
      }

      setDraft('');
      setAttachments([]);
      await refresh();
    } catch (err) {
      if (err instanceof AuthError) {
        // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
        avisarTokenRecusado();
        return;
      }
      if (enviados) { setDraft(''); void refresh(); }
      Alert.alert('Falha ao enviar', enviados ? `${enviados} de ${fila.length} foram. ${errMessage(err)}` : errMessage(err));
    } finally {
      setSending(false);
      setProgresso(null);
    }
  }

  async function handleToggleFavorite(id: string) {
    const next = await toggleFavoriteStore(id);
    setFavorites(next);
  }

  /**
   * Segurar abre as ações do recado. Antes segurar favoritava direto, o que não deixava
   * lugar nenhum para apagar — e apagar recado era justamente o `DELETE` que faltava no
   * contrato do mailbox (§16, C15).
   */
  function handleLongPress(message: MailboxMessage) {
    // Fase 23: copiar e compartilhar (o Zak pediu nas duas conversas).
    // O Alert do Android mostra no máximo 3 botões: com texto, "Mais…" leva a favoritar/apagar.
    const texto = message.text ?? '';
    const titulo = message.text ?? message.attachment?.name ?? 'Sem conteúdo';
    const mais = () => Alert.alert('Recado', undefined, [
      { text: favorites[message.id] ? 'Desfavoritar' : 'Favoritar', onPress: () => handleToggleFavorite(message.id) },
      { text: 'Apagar', style: 'destructive', onPress: () => apagarRecado(message) },
      { text: 'Cancelar', style: 'cancel' },
    ], { cancelable: true });
    if (!texto) { mais(); return; }
    Alert.alert('Recado', titulo, [
      { text: 'Copiar', onPress: () => { Clipboard.setStringAsync(texto).catch(() => {}); } },
      { text: 'Compartilhar', onPress: () => { Share.share({ message: texto }).catch(() => {}); } },
      { text: 'Mais…', onPress: mais },
    ], { cancelable: true });
  }

  async function apagarRecado(message: MailboxMessage) {
    // Destrutivo no desktop: apaga o recado e o anexo do disco. O `confirmed` só vai
    // depois que a identidade foi validada aqui — sem ele o PC responde 403.
    const r = await confirmDestructive('Apagar recado', 'Some do PC junto com o anexo. Não dá para desfazer.');
    if (r !== 'confirmed') return;
    try {
      await callRpc(pairing, 'mailbox.messages.delete', { id: message.id }, { confirmed: true });
      setMessages(prev => prev.filter(m => m.id !== message.id));
      const cache = await loadCache();
      await saveCache({ messages: cache.messages.filter(m => m.id !== message.id) });
    } catch (err) {
      Alert.alert('Falha ao apagar', errMessage(err));
    }
  }

  /**
   * Fase 21: o anexo baixa de verdade — antes este toque só mostrava o nome num alerta.
   * "Abrir" entrega ao app do tipo; "Salvar no celular" grava na pasta escolhida (lembrada).
   */
  async function handleOpenAttachment(message: MailboxMessage) {
    const meta = message.attachment;
    if (!meta) return;
    const escolha = await new Promise<'abrir' | 'salvar' | 'trocar' | null>((r) => Alert.alert(meta.name, `${tipoDoArquivo(meta.name, meta.mimeType)} · ${tamanhoLegivel(meta.sizeBytes)}`, [
      { text: 'Cancelar', style: 'cancel', onPress: () => r(null) },
      { text: 'Salvar em outra pasta', onPress: () => r('trocar') },
      { text: 'Salvar no celular', onPress: () => r('salvar') },
      { text: 'Abrir', onPress: () => r('abrir') },
    ], { cancelable: true, onDismiss: () => r(null) }));
    if (!escolha) return;
    try {
      // 21/10: baixa direto para o cache (até 500 MB, com progresso); PC antigo cai no base64.
      setBaixando({ id: message.id, nome: meta.name, fracao: 0 });
      const arquivo = await baixarAnexo(
        { baseUrl: baseUrl(pairing), token: pairing.token }, message.id, meta.name, meta.sizeBytes,
        (fracao) => setBaixando(b => (b && b.id === message.id ? { ...b, fracao } : b)),
        async () => (await fetchMessageContent(pairing, message.id)).attachment?.base64 ?? '',
      );
      setBaixando(null);
      if (escolha === 'abrir') await abrirArquivo(arquivo, meta.name, meta.mimeType);
      else {
        const pasta = await salvarArquivo(arquivo, meta.name, meta.mimeType, escolha === 'trocar');
        Alert.alert('Salvo', `${meta.name} está em ${pasta}.`);
      }
    } catch (err) {
      setBaixando(null);
      // Fechar o seletor de pasta não é erro.
      if (/cancel/i.test(errMessage(err))) return;
      Alert.alert(escolha === 'abrir' ? 'Não deu para abrir' : 'Não deu para salvar', errMessage(err));
    }
  }

  const ordered = messages.slice().sort((a, b) => a.createdAt - b.createdAt);

  return (
    <View style={{ flex: 1 }}>
      {!semCabecalho && <ScreenHeader title="Caixa de recados" />}
      {baixando && (
        <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center', paddingVertical: 6, marginTop: semCabecalho ? folgaTopo : 0 }}>
          Baixando {baixando.nome}… {Math.round(baixando.fracao * 100)}%
        </Text>
      )}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
        </View>
      )}

      {!loading && ordered.length === 0 && (
        <View style={styles.center}>
          <Feather name="inbox" size={22} color={palette.textMuted} />
          <Text variant="body" color={palette.textMuted} style={{ marginTop: tokens.spacing.sm }}>
            Nenhuma mensagem ainda.
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={ordered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: tokens.spacing.lg, paddingTop: semCabecalho ? folgaTopo : tokens.spacing.lg, gap: tokens.spacing.sm }}
        onContentSizeChange={aoCrescerConteudo}
        // O arrasto do dedo é o ÚNICO jeito de soltar a âncora. Posição de rolagem sozinha
        // não serve: durante a montagem ela chega defasada e derrubava a âncora no meio.
        onScrollBeginDrag={() => { usuarioArrastou.current = true; }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const faltando = contentSize.height - layoutMeasurement.height - contentOffset.y;
          // 80 px de tolerância: quem parou a rolagem um dedo acima do fim ainda quer
          // acompanhar; quem subiu para reler, não.
          coladoNoFim.current = faltando < 80;
          // Voltou ao fim de verdade: a âncora volta a valer como se a tela tivesse
          // acabado de abrir.
          if (faltando < 8) usuarioArrastou.current = false;
        }}
        scrollEventThrottle={64}
        renderItem={({ item }) => {
          const mine = item.from === 'mobile';
          // Fase 23.1: mesma bolha do chat da Ely e do PC — translúcida, não um bloco sólido.
          const bg = mine ? palette.bolhaMinha : palette.bolhaEla;
          const color = palette.text;
          const isImage = item.attachment?.mimeType.startsWith('image/') ?? false;
          return (
            <Pressable
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}
              onPress={() => {
                if (item.attachment) handleOpenAttachment(item);
              }}
              onLongPress={() => handleLongPress(item)}
            >
              <View
                style={[
                  styles.bubble,
                  {
                    borderRadius: tokens.radii.lg,
                    padding: isImage ? tokens.spacing.xs : tokens.spacing.md,
                    backgroundColor: bg,
                    borderWidth: 1,
                    borderColor: mine ? palette.bolhaMinhaBorda : palette.bolhaElaBorda,
                  },
                ]}
              >
                {!isImage && (
                  <View style={styles.bubbleHeader}>
                    {item.attachment && <Feather name="paperclip" size={14} color={color} />}
                    {favorites[item.id] && <Feather name="star" size={12} color="#F5A623" />}
                  </View>
                )}

                {isImage ? (
                  imageCache[item.id] ? (
                    <Image
                      source={{ uri: `data:${item.attachment!.mimeType};base64,${imageCache[item.id]}` }}
                      style={[styles.previewImage, { borderRadius: tokens.radii.md }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.previewImage, styles.previewLoading, { borderRadius: tokens.radii.md }]}>
                      <ActivityIndicator size="small" color={palette.primary} />
                    </View>
                  )
                ) : (
                  <TextoComLinks texto={item.text ?? item.attachment?.name ?? '(sem conteúdo)'} cor={color} />
                )}

                {isImage && favorites[item.id] && (
                  <View style={styles.imageFavorite}>
                    <Feather name="star" size={12} color="#F5A623" />
                  </View>
                )}
                {isImage && item.text && (
                  <TextoComLinks texto={item.text} cor={color} variant="caption" style={{ marginTop: tokens.spacing.xs }} />
                )}
              </View>
              <Text
                variant="caption"
                color={palette.textMuted}
                style={{ textAlign: mine ? 'right' : 'left', marginTop: 2 }}
              >
                {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Mesmo desenho do lado da IA: barra em tinta chapada, botões em vidro real. */}
      <View style={{ overflow: 'hidden', paddingBottom: folgaDaBarra }}>
        <GlassFill intensity={40} strong edge={false} blur={false} />
        <View
          style={[
            styles.composer,
            { borderTopColor: palette.glassBorder, padding: tokens.spacing.md },
          ]}
        >
        {attachments.length > 1 && (
          <Text variant="caption" color={palette.textMuted}>
            {progresso ? `Enviando ${progresso}…` : resumoDosArquivos(attachments)}
          </Text>
        )}
        {attachments.map((a) => (
          <View key={a.uri} style={[styles.attachmentChip, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
            <Feather name="paperclip" size={14} color={palette.primary} />
            <Text variant="caption" color={palette.primary} numberOfLines={1} style={{ flex: 1 }}>
              {a.name}
            </Text>
            <Pressable accessibilityLabel={`Tirar ${a.name}`} accessibilityRole="button" disabled={sending} onPress={() => setAttachments((prev) => prev.filter((x) => x.uri !== a.uri))} hitSlop={8}>
              <Feather name="x" size={14} color={palette.primary} />
            </Pressable>
          </View>
        ))}
        <View style={styles.composerRow}>
          <GlassCircle accessibilityLabel="Colar da área de transferência" onPress={handlePaste}>
            <Feather name="clipboard" size={20} color={palette.primary} />
          </GlassCircle>
          <GlassCircle accessibilityLabel="Anexar arquivo" onPress={handleAttach}>
            <Feather name="paperclip" size={20} color={palette.primary} />
          </GlassCircle>
          <TextInput
            style={[styles.input, { borderColor: palette.border, borderRadius: tokens.radii.full, color: palette.text }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Cola um link ou escreve uma nota..."
            placeholderTextColor={palette.textMuted}
            editable={!sending}
          />
          <GlassCircle accessibilityLabel="Enviar"
            ativo
            onPress={handleSend}
            disabled={sending || (!draft.trim() && !attachments.length)}
          >
            {sending ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : (
              <Feather name="arrow-up" size={20} color={palette.primary} />
            )}
          </GlassCircle>
        </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 32 },
  bubble: { gap: 4 },
  bubbleHeader: { flexDirection: 'row', gap: 4 },
  previewImage: { width: 220, height: 220 },
  previewLoading: { alignItems: 'center', justifyContent: 'center' },
  imageFavorite: { position: 'absolute', top: 8, right: 8 },
  composer: { borderTopWidth: 1, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
