import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, PanResponder, Pressable, RefreshControl, ScrollView,
  StyleSheet, TextInput, View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  callRpc, Clima, DiskEntry, PowerOperation, ProcessEntry, Reminder, Sugestao,
} from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { findMetric } from '../lib/telemetryFormat';
import { MOV, animarProximoLayout, anima } from '../lib/motion';
import { useTheme } from '../theme';
import { SpotifyBar } from './SpotifyPlayer';
import { Card, MetricBar, ScreenHeader, Text } from '../components/ui';

/**
 * Tela inicial: um catálogo de cards, não uma tela fixa.
 *
 * A versão anterior tinha header, player, quatro atalhos, métricas, lembretes e energia —
 * nessa ordem, sempre. Agora cada card se declara num registro, sabe o que precisa buscar,
 * e pode ser ligado, desligado e arrastado para outro lugar. É o espelho do que o desktop
 * ganhou no mesmo bloco, e os dois leem pelos mesmos métodos RPC.
 *
 * ⚠️ O arrasto usa `PanResponder` + `Animated`, ambos do core do React Native. Não entra
 * `react-native-gesture-handler` nem `reanimated`: são dependências NATIVAS, mudariam o
 * fingerprint do `expo-updates` e obrigariam a gerar um APK novo. Isto precisa viajar por
 * `npm run update`.
 */

const CHAVE_CARDS = 'elysium_home_cards';
/** Horário do desligamento agendado, em epoch ms. Ver `gravarAgendamento`. */
const CHAVE_AGENDAMENTO = 'elysium_desligamento_agendado';

type Dados = {
  telemetria: TelemetryFrame | null;
  lembretes: Reminder[];
  sugestoes: Sugestao[];
  clima: Clima | null;
  processos: ProcessEntry[];
  discos: DiskEntry[];
  transferencia: string;
};

type Ctx = {
  dados: Dados;
  pairing: Pairing;
  ocupado: boolean;
  navegar: (tela: 'chat' | 'control') => void;
  abrirPlayer: () => void;
  energia: (op: PowerOperation, label: string, aviso: string) => void;
  agendarDesligamento: (segundos: number) => void;
  cancelarDesligamento: () => void;
  /** Epoch ms do desligamento marcado, ou `null`. */
  agendado: number | null;
  executarSugestao: (s: Sugestao) => void;
  criarLembrete: (texto: string, hora: Date) => Promise<void>;
  recarregar: () => void;
};

type DefCard = {
  titulo: string;
  icone: keyof typeof Feather.glyphMap;
  /** Chaves de dado que este card consome — só o que os visíveis pedem é buscado. */
  precisa: (keyof Dados)[];
  corpo: (c: Ctx) => React.ReactNode;
};

/** Ordem de fábrica. Card fora desta lista existe, mas nasce desligado. */
const CARDS_PADRAO = ['sugestoes', 'computador', 'musica', 'lembretes', 'atalhos', 'energia'];

export default function HomeScreen({
  pairing,
  onNavigate,
  onOpenPlayer,
  onUnpair,
}: {
  pairing: Pairing;
  onNavigate: (screen: 'chat' | 'control') => void;
  onOpenPlayer: () => void;
  onUnpair: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [telemetria, setTelemetria] = useState<TelemetryFrame | null>(null);
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [dados, setDados] = useState<Dados>({
    telemetria: null, lembretes: [], sugestoes: [], clima: null,
    processos: [], discos: [], transferencia: '',
  });
  const [ocupado, setOcupado] = useState(false);
  const [ordem, setOrdem] = useState<string[]>(CARDS_PADRAO);
  const [ocultos, setOcultos] = useState<string[]>([]);
  /** Fixos ficam no topo e não saem do lugar quando os outros são arrastados. */
  const [fixos, setFixos] = useState<string[]>(['clima']);
  const [editando, setEditando] = useState(false);
  /**
   * Tamanho por card: `col` é a fração da linha (1 ou 0,5) e `alt` a altura travada.
   * Card sem entrada aqui é inteiro e acompanha o conteúdo, que é o comportamento antigo.
   */
  const [tamanhos, setTamanhos] = useState<Record<string, { col?: number; alt?: number }>>({});
  /** Verdadeiro só enquanto um dedo está de fato arrastando um card. Ver `CardArrastavel`. */
  const [arrastando, setArrastando] = useState(false);
  /** Epoch ms do desligamento marcado, ou `null`. Ver `gravarAgendamento`. */
  const [agendado, setAgendado] = useState<number | null>(null);

  // Lê o agendamento guardado e descarta o que já venceu — um horário no passado só
  // deixaria um aviso mentiroso na tela.
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_AGENDAMENTO)
      .then(bruto => {
        const quando = Number(bruto);
        if (bruto && Number.isFinite(quando) && quando > Date.now()) setAgendado(quando);
        else if (bruto) AsyncStorage.removeItem(CHAVE_AGENDAMENTO).catch(() => { /* best-effort */ });
      })
      .catch(err => console.warn('[energia] não consegui ler o agendamento', err));
  }, []);

  // Enquanto há desligamento marcado, o card mostra quanto falta. Sem este tique a conta
  // só mudaria quando alguma outra coisa redesenhasse a tela.
  //
  // ⚠️ O contador precisa ser um estado SEPARADO: `setAgendado(v => v)` não redesenha
  // nada, porque o React descarta a atualização quando o valor novo é idêntico ao atual.
  const [, tique] = useState(0);
  useEffect(() => {
    if (agendado === null) return;
    const t = setInterval(() => {
      if (agendado <= Date.now()) setAgendado(null);
      else tique(n => n + 1);
    }, 30_000);
    return () => clearInterval(t);
  }, [agendado]);

  useEffect(() => openTelemetryStream(pairing, setTelemetria, setStatus),
    [pairing.activeIp, pairing.port, pairing.token]);

  // ── ordem gravada
  useEffect(() => {
    (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE_CARDS);
        if (!bruto) return;
        const salvo = JSON.parse(bruto) as {
          ordem?: string[]; ocultos?: string[]; fixos?: string[];
          tamanhos?: Record<string, { col?: number; alt?: number }>;
        };
        const conhecidos = (salvo.ordem ?? []).filter(id => id in CARDS);
        // Card novo numa versão futura precisa aparecer para quem já tinha configuração
        // gravada — senão nasce invisível e ninguém descobre que existe.
        const faltando = Object.keys(CARDS).filter(id => !conhecidos.includes(id));
        setOrdem([...conhecidos, ...faltando]);
        setOcultos([
          ...(salvo.ocultos ?? []).filter(id => id in CARDS),
          ...faltando.filter(id => !CARDS_PADRAO.includes(id)),
        ]);
        // Configuração gravada antes desta versão não tem `fixos` — nasce sem nenhum, em
        // vez de reimpor o padrão de fábrica por cima de uma escolha já feita.
        setFixos((salvo.fixos ?? []).filter(id => id in CARDS));
        // Tamanhos chegaram depois: configuracao antiga nao tem a chave, e nesse caso
        // todo card nasce inteiro e automatico, exatamente como sempre foi.
        const tm = salvo.tamanhos ?? {};
        setTamanhos(Object.fromEntries(Object.entries(tm).filter(([id]) => id in CARDS)));
      } catch { /* fica com o padrão */ }
    })();
  }, []);

  const gravar = useCallback(async (
    o: string[], oc: string[], fx: string[] = fixos,
    tm: Record<string, { col?: number; alt?: number }> = tamanhos,
  ) => {
    try {
      await AsyncStorage.setItem(CHAVE_CARDS, JSON.stringify({ ordem: o, ocultos: oc, fixos: fx, tamanhos: tm }));
    } catch { /* segue com o que está na tela */ }
  }, [fixos, tamanhos]);

  function alternarCard(id: string, ligado: boolean) {
    const novos = ligado ? [...ocultos, id] : ocultos.filter(x => x !== id);
    animarProximoLayout();
    setOcultos(novos);
    gravar(ordem, novos);
  }

  function alternarFixo(id: string) {
    const novos = fixos.includes(id) ? fixos.filter(x => x !== id) : [...fixos, id];
    animarProximoLayout();
    setFixos(novos);
    gravar(ordem, ocultos, novos);
  }

  /**
   * Espelho do `tamanhos` para ler o valor corrente sem depender do estado.
   *
   * O redimensionamento dispara a cada quadro do arrasto, e ler `tamanhos` direto do
   * fechamento daria o valor de antes do gesto começar — o card voltaria ao tamanho
   * original entre um quadro e outro.
   */
  const tamanhosRef = useRef(tamanhos);
  useEffect(() => { tamanhosRef.current = tamanhos; }, [tamanhos]);

  /**
   * 🔴 GRAVAR AQUI SERIA GRAVAR A CADA QUADRO.
   *
   * A primeira versão chamava `gravar()` de dentro do atualizador do `setTamanhos`. Dois
   * problemas somados: atualizador do React tem que ser puro — em modo concorrente ele
   * pode rodar duas vezes e o efeito colateral iria junto — e, pior, o gesto chama isto a
   * cada movimento do dedo, o que virava dezenas de escritas no `AsyncStorage` por
   * segundo durante um único arrasto.
   *
   * Agora o gesto só mexe na tela; quem grava é `fimDoRedimensionamento`, ao soltar. É o
   * mesmo desenho do desktop, onde a gravação mora no `aoSoltar`.
   */
  function redimensionar(id: string, alt: number | null, col: number) {
    const atual = tamanhosRef.current[id] ?? {};
    // Voltar ao automático apaga a chave em vez de guardar `null`: card sem entrada é
    // exatamente o padrão, e assim a configuração não engorda com valores neutros.
    const novo: { col?: number; alt?: number } = { ...atual, col, ...(alt === null ? {} : { alt }) };
    if (alt === null) delete novo.alt;

    const todos = { ...tamanhosRef.current, [id]: novo };
    tamanhosRef.current = todos;
    setTamanhos(todos);
  }

  function fimDoRedimensionamento() {
    gravar(ordem, ocultos, fixos, tamanhosRef.current);
  }

  function voltarAoPadrao() {
    animarProximoLayout();
    setOrdem(CARDS_PADRAO.concat(Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id))));
    setOcultos(Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id)));
    setFixos([]);
    setTamanhos({});
    AsyncStorage.removeItem(CHAVE_CARDS).catch(() => { /* best-effort */ });
  }

  const visiveis = useMemo(() => {
    const vis = ordem.filter(id => id in CARDS && !ocultos.includes(id));
    // Fixos primeiro, na ordem em que foram fixados; o resto mantém a ordem arrastada.
    const fx = fixos.filter(id => vis.includes(id));
    return [...fx, ...vis.filter(id => !fx.includes(id))];
  }, [ordem, ocultos, fixos]);

  // ── busca: só o que os cards visíveis pedem
  const carregar = useCallback(async () => {
    const precisa = new Set(visiveis.flatMap(id => CARDS[id].precisa));
    const d: Partial<Dados> = {};
    const jobs: Promise<void>[] = [];
    // Cada fonte falha por conta própria: o clima sem rede ou o Spotify deslogado não
    // podem derrubar a tela inteira, que é o que um `Promise.all` cru faria.
    const puxar = async <K extends keyof Dados>(k: K, fn: () => Promise<Dados[K]>) => {
      try { d[k] = await fn(); } catch { /* fonte muda */ }
    };

    if (precisa.has('lembretes')) jobs.push(puxar('lembretes', async () =>
      (await callRpc(pairing, 'reminders.list')).reminders
        .filter(r => !r.firedAt && r.dueAt > Date.now())
        .sort((a, b) => a.dueAt - b.dueAt)));
    if (precisa.has('sugestoes')) jobs.push(puxar('sugestoes', async () =>
      (await callRpc(pairing, 'suggestions.list')).suggestions));
    if (precisa.has('clima')) jobs.push(puxar('clima', async () =>
      await callRpc(pairing, 'weather.now')));
    if (precisa.has('processos')) jobs.push(puxar('processos', async () =>
      (await callRpc(pairing, 'system.processes')).processes
        .slice().sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))));
    if (precisa.has('discos')) jobs.push(puxar('discos', async () =>
      (await callRpc(pairing, 'system.disks')).disks));
    if (precisa.has('transferencia')) jobs.push(puxar('transferencia', async () =>
      (await callRpc(pairing, 'clipboard.get')).text));

    await Promise.all(jobs);
    setDados(prev => ({ ...prev, ...d }));
  }, [pairing, visiveis]);

  useEffect(() => { carregar(); }, [carregar]);

  function tratarErro(err: unknown, contexto: string) {
    if (err instanceof AuthError) {
      Alert.alert('Sessão expirada', 'O token foi regenerado no PC. Pareie o celular de novo.');
      onUnpair();
      return;
    }
    Alert.alert(contexto, errMessage(err));
  }

  async function energia(op: PowerOperation, label: string, aviso: string) {
    const ok = await confirmDestructive(`${label} o PC?`, aviso);
    if (ok !== 'confirmed') return;
    setOcupado(true);
    try {
      const res = await callRpc(pairing, 'power.control', { operation: op }, { confirmed: true });
      // Desligar imediato também é um desligamento pendente (o servidor usa 30 s de
      // padrão): sem registrar aqui, o cartão não ofereceria o botão de cancelar
      // justamente no caso em que a pessoa mais se arrepende.
      if (op === 'shutdown') await gravarAgendamento(Date.now() + 30_000);
      if (op === 'cancel') await gravarAgendamento(null);
      Alert.alert('ELYSIUM-M', res.message);
    } catch (err) { tratarErro(err, `Falha ao ${label.toLowerCase()}`); }
    finally { setOcupado(false); }
  }

  /**
   * Agenda o desligamento do PC daqui a N segundos.
   *
   * Não inventa serviço nenhum: `power.control` já aceitava `delaySeconds` desde sempre e
   * ninguém no celular passava o campo — só o caminho da voz usava. O `shutdown.exe /t`
   * do Windows é quem segura o prazo, então o agendamento sobrevive ao app fechado e ao
   * celular sair de alcance, que é justamente o que se quer de um agendamento.
   */
  async function agendarDesligamento(segundos: number) {
    const quando = new Date(Date.now() + segundos * 1000);
    const ok = await confirmDestructive(
      'Agendar desligamento?',
      `O PC vai desligar às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. `
      + 'Trabalho não salvo se perde. Dá para cancelar por aqui até lá.',
    );
    if (ok !== 'confirmed') return;

    setOcupado(true);
    try {
      const res = await callRpc(
        pairing, 'power.control',
        { operation: 'shutdown', delaySeconds: segundos },
        { confirmed: true },
      );
      await gravarAgendamento(quando.getTime());
      Alert.alert('ELYSIUM-M', res.message);
    } catch (err) { tratarErro(err, 'Falha ao agendar'); }
    finally { setOcupado(false); }
  }

  async function cancelarDesligamento() {
    setOcupado(true);
    try {
      const res = await callRpc(pairing, 'power.control', { operation: 'cancel' }, { confirmed: true });
      await gravarAgendamento(null);
      Alert.alert('ELYSIUM-M', res.message);
    } catch (err) { tratarErro(err, 'Falha ao cancelar'); }
    finally { setOcupado(false); }
  }

  /**
   * Guarda o horário marcado no aparelho.
   *
   * ⚠️ É memória do CELULAR, não do PC: o Windows não expõe "há um desligamento
   * agendado?" de forma barata. Por isso o registro expira sozinho quando o horário
   * passa — assim um agendamento cancelado no próprio PC não fica fantasma na tela para
   * sempre. Chave nova, e criar chave é seguro; renomear é que não pode ir por OTA.
   */
  async function gravarAgendamento(quando: number | null) {
    setAgendado(quando);
    try {
      if (quando === null) await AsyncStorage.removeItem(CHAVE_AGENDAMENTO);
      else await AsyncStorage.setItem(CHAVE_AGENDAMENTO, String(quando));
    } catch (err) { console.warn('[energia] não consegui guardar o agendamento', err); }
  }

  async function executarSugestao(s: Sugestao) {
    if (s.acao?.aba === 'chat' || s.acao?.aba === 'control') { onNavigate(s.acao.aba); return; }
    if (!s.acao?.metodo || s.acao.metodo.startsWith('__')) return;
    setOcupado(true);
    try {
      await callRpc(pairing, s.acao.metodo as never, s.acao.params as never);
      Alert.alert('ELYSIUM-M', s.acao.aviso ?? 'Feito.');
      await carregar();
    } catch (err) { tratarErro(err, 'Não consegui executar'); }
    finally { setOcupado(false); }
  }

  async function criarLembrete(texto: string, quando: Date) {
    await callRpc(pairing, 'reminders.create', { text: texto, dueAt: quando.getTime() });
    await carregar();
  }

  const ctx: Ctx = {
    dados: { ...dados, telemetria },
    pairing, ocupado,
    navegar: onNavigate, abrirPlayer: onOpenPlayer,
    energia, agendarDesligamento, cancelarDesligamento, agendado,
    executarSugestao, criarLembrete, recarregar: carregar,
  };

  // ── arrastar: troca com o vizinho ao passar de meio card
  function mover(de: number, para: number) {
    if (para < 0 || para >= visiveis.length || de === para) return;

    const novaVisivel = visiveis.slice();
    const [movido] = novaVisivel.splice(de, 1);
    novaVisivel.splice(para, 0, movido);

    // A ordem gravada inclui os ocultos, e eles precisam ficar onde estão: percorre a
    // ordem antiga e, a cada posição que era de um card visível, encaixa o próximo da
    // sequência nova. Reordenar só a lista visível e concatenar o resto jogaria todo card
    // desligado para o fim — e ligar um de volta o faria reaparecer no lugar errado.
    let i = 0;
    const nova = ordem.map(id => (visiveis.includes(id) ? novaVisivel[i++] : id));

    animarProximoLayout();
    setOrdem(nova);
    gravar(nova, ocultos);
  }

  const online = status === 'open';

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="ELYSIUM-M"
        right={
          <View style={styles.linhaStatus}>
            <Pressable
              onPress={() => { animarProximoLayout(); setEditando(v => !v); }}
              hitSlop={10}
              style={{ marginRight: 10 }}
            >
              <Feather name="sliders" size={17} color={editando ? palette.primary : palette.textMuted} />
            </Pressable>
            <View style={[styles.ponto, { backgroundColor: online ? palette.success : palette.error }]} />
            <Text variant="caption" color={online ? palette.success : palette.error}>
              {online ? 'PC online' : 'PC offline'}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={carregar} tintColor={palette.primary} />}
        // Só para de rolar enquanto um arrasto está REALMENTE em curso. Antes isto era
        // `!editando`, o que matava a rolagem durante toda a personalização e tornava
        // impossível chegar nos cards de baixo. Ver o comentário em `CardArrastavel`.
        scrollEnabled={!arrastando}
      >
        {editando && (
          <Card glass style={{ gap: tokens.spacing.sm }}>
            <View style={styles.cabecalho}>
              <Text variant="label">Cards da tela</Text>
              <Pressable onPress={voltarAoPadrao} hitSlop={8} style={{ marginLeft: 'auto' }}>
                <Text variant="caption" color={palette.primary}>Voltar ao padrão</Text>
              </Pressable>
            </View>

            {/*
              🔴 Era uma nuvem de chips onde cada um acumulava DOIS toques diferentes —
              ligar no corpo, fixar num ícone aninhado dentro dele. Botão dentro de botão
              é loteria com o dedo, e reordenar só existia como arrasto, que exige mira.
              Agora é uma linha por card com alvos separados, e a ordem também muda por
              botão. É o mesmo desenho que o desktop adotou no bloco 33, pelo mesmo motivo.
            */}
            {Object.entries(CARDS).map(([id, def]) => {
              const ligado = !ocultos.includes(id);
              const fixo = fixos.includes(id);
              const pos = visiveis.indexOf(id);
              return (
                <View key={id} style={styles.linhaCfg}>
                  <Pressable
                    onPress={() => alternarCard(id, ligado)}
                    hitSlop={6}
                    style={styles.linhaCfgAlvo}
                  >
                    <Feather
                      name={ligado ? 'check-square' : 'square'}
                      size={16}
                      color={ligado ? palette.primary : palette.textMuted}
                    />
                    <Feather name={def.icone} size={13} color={palette.textMuted} />
                    <Text variant="body" color={ligado ? palette.text : palette.textMuted}>
                      {def.titulo}
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => alternarFixo(id)} hitSlop={8} style={styles.iconeCfg}>
                    <Feather name="bookmark" size={15} color={fixo ? palette.accent : palette.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => mover(pos, pos - 1)}
                    disabled={!ligado || fixo || pos <= 0}
                    hitSlop={8}
                    style={[styles.iconeCfg, { opacity: !ligado || fixo || pos <= 0 ? 0.25 : 1 }]}
                  >
                    <Feather name="chevron-up" size={17} color={palette.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => mover(pos, pos + 1)}
                    disabled={!ligado || fixo || pos < 0 || pos >= visiveis.length - 1}
                    hitSlop={8}
                    style={[styles.iconeCfg, { opacity: !ligado || fixo || pos < 0 || pos >= visiveis.length - 1 ? 0.25 : 1 }]}
                  >
                    <Feather name="chevron-down" size={17} color={palette.textMuted} />
                  </Pressable>
                </View>
              );
            })}

            <Text variant="caption" color={palette.textMuted}>
              Arraste pela alça ☰ para trocar de lugar, e pelo canto ↘ para mudar o tamanho.
              A rolagem continua funcionando.
            </Text>
          </Card>
        )}

        {/* Linha que embrulha: é o que permite dois meios-cards lado a lado. Com todos os
            cards inteiros, o resultado é idêntico à pilha de antes. */}
        <View style={styles.grelha}>
          {visiveis.map((id, i) => {
            const t = tamanhos[id];
            return (
              <CardArrastavel
                key={id}
                indice={i}
                ativo={editando && !fixos.includes(id)}
                largura={t?.col ?? 1}
                alturaFixa={t?.alt ?? null}
                onMover={mover}
                onArrastando={setArrastando}
                onRedimensionar={(alt, col) => redimensionar(id, alt, col)}
                onFimRedimensionar={fimDoRedimensionamento}
              >
                {alca => (
                  <Card glass style={{ gap: tokens.spacing.sm, flex: t?.alt ? 1 : undefined }}>
                    <View style={styles.cabecalho}>
                      <Feather name={CARDS[id].icone} size={14} color={palette.textMuted} />
                      <Text variant="label" color={palette.textMuted}>{CARDS[id].titulo}</Text>
                      {editando && !fixos.includes(id) && (
                        <View {...alca} hitSlop={12} style={{ marginLeft: 'auto', paddingLeft: 10 }}>
                          <Feather name="menu" size={16} color={palette.primary} />
                        </View>
                      )}
                    </View>
                    {CARDS[id].corpo(ctx)}
                  </Card>
                )}
              </CardArrastavel>
            );
          })}
        </View>

        {visiveis.length === 0 && (
          <Text variant="caption" color={palette.textMuted}>
            Todos os cards estão desligados. Toque no ícone acima para escolher.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Envelope arrastável. Só responde ao toque no modo de edição — fora dele, o card inteiro
 * continua clicável normalmente, e um gesto de rolagem não deve ser confundido com arrasto.
 */
function CardArrastavel({
  indice, ativo, largura, alturaFixa, onMover, onArrastando, onRedimensionar, onFimRedimensionar, children,
}: {
  indice: number;
  ativo: boolean;
  /** Fração da linha que este card ocupa: 1 = inteiro, 0.5 = metade. */
  largura: number;
  /** Altura travada pelo usuário, em px, ou `null` para acompanhar o conteúdo. */
  alturaFixa: number | null;
  onMover: (de: number, para: number) => void;
  onArrastando: (v: boolean) => void;
  onRedimensionar: (alt: number | null, col: number) => void;
  /** Chamado uma vez, ao soltar a quina: e quem persiste. */
  onFimRedimensionar: () => void;
  children: (alca: object) => React.ReactNode;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const altura = useRef(120);
  const acumulado = useRef(0);
  /** Altura e coluna no instante em que o dedo encostou — o arrasto é relativo a elas. */
  const baseAltura = useRef(0);
  const baseLargura = useRef(1);

  /**
   * 🔴 O ARRASTO SAIU DO CARD INTEIRO E FOI PARA A ALÇA.
   *
   * Antes o `PanResponder` cobria o card todo, e por isso o modo de edição precisava
   * desligar a rolagem (`scrollEnabled={!editando}`) para os dois gestos não brigarem
   * pelo mesmo dedo. O efeito colateral era grave: com a rolagem morta, **não dava para
   * chegar nos cards de baixo** — abrir a personalização travava você nos primeiros dois
   * ou três, e o card que você tocava sem querer virava o único que dava para mexer.
   *
   * Com o gesto restrito à alça, a `ScrollView` volta a funcionar durante a edição e a
   * rolagem só para enquanto um arrasto está de fato em curso.
   */
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => ativo,
    onMoveShouldSetPanResponder: (_e, g) => ativo && Math.abs(g.dy) > 4,
    onPanResponderGrant: () => onArrastando(true),
    onPanResponderMove: (_e, g) => {
      y.setValue(g.dy);
      const passos = Math.round(g.dy / altura.current);
      if (passos !== acumulado.current) {
        onMover(indice, indice + (passos - acumulado.current));
        acumulado.current = passos;
      }
    },
    onPanResponderRelease: () => {
      acumulado.current = 0;
      onArrastando(false);
      anima(y, 0, MOV.base).start();
    },
    onPanResponderTerminate: () => { acumulado.current = 0; onArrastando(false); },
  }), [ativo, indice, onMover, onArrastando]);

  /**
   * Canto de redimensionar, como a quina de uma janela do Windows.
   *
   * Vertical muda a altura livremente; horizontal decide entre card inteiro e meio card.
   * A largura não é livre de propósito: numa tela de telefone, larguras arbitrárias
   * deixam sobras irregulares entre um card e o vizinho e nada nunca alinha. Duas
   * posições encaixam sempre.
   */
  const panTamanho = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      onArrastando(true);
      baseAltura.current = altura.current - 12;
      baseLargura.current = largura;
    },
    onPanResponderMove: (_e, g) => {
      const nova = Math.max(72, Math.round((baseAltura.current + g.dy) / 8) * 8);
      // 60 px de folga antes de trocar de coluna: sem isso, um arrasto vertical com o
      // dedo levemente torto trocaria a largura sem ninguém pedir.
      let col = baseLargura.current;
      if (g.dx < -60) col = 0.5;
      else if (g.dx > 60) col = 1;
      onRedimensionar(nova, col);
    },
    // Gravar so ao soltar: durante o gesto isto dispara a cada quadro.
    onPanResponderRelease: () => { onArrastando(false); onFimRedimensionar(); },
    onPanResponderTerminate: () => { onArrastando(false); onFimRedimensionar(); },
  }), [largura, onArrastando, onRedimensionar, onFimRedimensionar]);

  return (
    <Animated.View
      onLayout={e => { altura.current = e.nativeEvent.layout.height + 12; }}
      style={{
        transform: [{ translateY: y }],
        // `48%` em vez de `50%` para o `gap` da linha caber entre os dois meios-cards.
        width: largura === 1 ? '100%' : '48%',
        ...(alturaFixa !== null ? { height: alturaFixa } : {}),
      }}
    >
      {/* `overflow: hidden` é o que faz a altura travada valer: sem ele o conteúdo
          transborda o card em vez de ser cortado, e o card "não redimensiona". */}
      <View style={{ flex: alturaFixa !== null ? 1 : undefined, overflow: 'hidden' }}>
        {children(ativo ? pan.panHandlers : {})}
      </View>

      {ativo && (
        <View
          {...panTamanho.panHandlers}
          // Área de toque maior que o desenho: 12 px de canto é fácil de ver e difícil
          // de acertar com o dedo.
          hitSlop={{ top: 14, left: 14, right: 6, bottom: 6 }}
          style={styles.cantoTamanho}
        >
          <Feather name="corner-down-right" size={13} color="rgba(255,255,255,0.85)" />
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────
// O CATÁLOGO
// ─────────────────────────────────────────────────

const CARDS: Record<string, DefCard> = {
  sugestoes: {
    titulo: 'Para agora', icone: 'zap', precisa: ['sugestoes'],
    corpo: ({ dados, executarSugestao }) => <Bolhas lista={dados.sugestoes} onToque={executarSugestao} />,
  },
  computador: {
    titulo: 'Este computador', icone: 'activity', precisa: [],
    corpo: ({ dados }) => <Metricas frame={dados.telemetria} />,
  },
  musica: {
    titulo: 'Tocando', icone: 'music', precisa: [],
    corpo: ({ pairing, abrirPlayer }) => <SpotifyBar pairing={pairing} onOpen={abrirPlayer} semCard />,
  },
  clima: {
    titulo: 'Lá fora', icone: 'cloud', precisa: ['clima'],
    corpo: ({ dados }) => <ClimaCorpo clima={dados.clima} />,
  },
  lembretes: {
    titulo: 'Próximos lembretes', icone: 'clock', precisa: ['lembretes'],
    corpo: (c) => <Lembretes lista={c.dados.lembretes} criar={c.criarLembrete} />,
  },
  processos: {
    titulo: 'Consumindo mais', icone: 'cpu', precisa: ['processos'],
    corpo: ({ dados }) => <Lista itens={dados.processos.slice(0, 4).map(p => ({
      chave: String(p.pid), icone: 'cpu' as const, texto: p.name, direita: `${Math.round(p.cpu ?? 0)}%`,
    }))} vazio="Sem leitura de processos." />,
  },
  discos: {
    titulo: 'Armazenamento', icone: 'hard-drive', precisa: ['discos'],
    corpo: ({ dados }) => <Discos lista={dados.discos} />,
  },
  transferencia: {
    titulo: 'Área de transferência', icone: 'clipboard', precisa: ['transferencia'],
    corpo: ({ dados }) => <Transferencia texto={dados.transferencia} />,
  },
  atalhos: {
    titulo: 'Atalhos', icone: 'grid', precisa: [],
    corpo: ({ navegar, abrirPlayer }) => <Atalhos navegar={navegar} abrirPlayer={abrirPlayer} />,
  },
  energia: {
    titulo: 'Energia', icone: 'power', precisa: [],
    corpo: ({ energia, agendarDesligamento, cancelarDesligamento, agendado, ocupado }) => (
      <Energia
        acionar={energia}
        agendar={agendarDesligamento}
        cancelarAgendamento={cancelarDesligamento}
        agendado={agendado}
        ocupado={ocupado}
      />
    ),
  },
};

// ─────────────────────────────────────────────────
// CORPOS
// ─────────────────────────────────────────────────

function Bolhas({ lista, onToque }: { lista: Sugestao[]; onToque: (s: Sugestao) => void }) {
  const { palette, tokens } = useTheme();
  if (!lista.length) return <Text variant="caption" color={palette.textMuted}>Nada de urgente por aqui.</Text>;
  return (
    <View style={styles.chips}>
      {lista.map((s, i) => (
        <Pressable
          key={i}
          onPress={() => onToque(s)}
          style={[styles.bolha, {
            borderRadius: 999,
            backgroundColor: palette.primarySoft,
            borderColor: palette.glassBorder,
          }]}
        >
          <Feather name={(s.icone as keyof typeof Feather.glyphMap) ?? 'zap'} size={13} color={palette.primary} />
          <Text variant="caption" style={{ flexShrink: 1 }}>{s.texto}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Metricas({ frame }: { frame: TelemetryFrame | null }) {
  const { palette } = useTheme();
  const metricas = frame
    ? Object.entries(frame).filter(([k, v]) => findMetric(k) && typeof v === 'number')
    : [];
  if (!metricas.length) return <Text variant="caption" color={palette.textMuted}>Esperando o PC…</Text>;
  return (
    <>
      {metricas.map(([k, v]) => {
        const m = findMetric(k)!;
        return <MetricBar key={k} icon={m.icon} label={m.label} percent={v as number} />;
      })}
    </>
  );
}

function ClimaCorpo({ clima }: { clima: Clima | null }) {
  const { palette } = useTheme();
  if (!clima) {
    return <Text variant="caption" color={palette.textMuted}>Defina a cidade nos Ajustes do PC.</Text>;
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.climaLinha}>
        <Feather name={(clima.icone as keyof typeof Feather.glyphMap) ?? 'cloud'} size={26} color={palette.primary} />
        <Text variant="display">{Math.round(clima.temperatura)}°</Text>
        <Text variant="caption" color={palette.textMuted}>{clima.descricao}</Text>
      </View>
      <Text variant="caption" color={palette.textMuted}>
        {clima.cidade} · máx {Math.round(clima.max)}° / mín {Math.round(clima.min)}°
      </Text>
    </View>
  );
}

function Lembretes({
  lista, criar,
}: {
  lista: Reminder[];
  criar: (texto: string, quando: Date) => Promise<void>;
}) {
  const { palette, tokens } = useTheme();
  const [texto, setTexto] = useState('');
  const [hora, setHora] = useState('');

  async function enviar() {
    const t = texto.trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
    if (!t || !m) { Alert.alert('Lembrete', 'Escreva o texto e a hora no formato 14:30.'); return; }
    // A hora digitada é sempre a PRÓXIMA ocorrência: 08:00 às 14h vira amanhã. Senão o
    // lembrete nasceria vencido e o desktop recusaria com "dueAt já passou".
    const quando = new Date();
    quando.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (quando.getTime() <= Date.now()) quando.setDate(quando.getDate() + 1);
    try { await criar(t, quando); setTexto(''); setHora(''); }
    catch (e) { Alert.alert('Lembrete', errMessage(e)); }
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {lista.length === 0
        ? <Text variant="caption" color={palette.textMuted}>Nada agendado.</Text>
        : lista.slice(0, 4).map(r => (
          <View key={r.id} style={styles.linhaItem}>
            <Feather name="bell" size={13} color={palette.primary} />
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{r.text}</Text>
            <Text variant="caption" color={palette.textMuted}>
              {new Date(r.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ))}
      {/* `reminders.create` já existia no RPC e nunca era chamado: o lembrete só podia ser
          criado por voz. Agora dá para digitar dos dois lados. */}
      <View style={styles.formLinha}>
        <TextInput
          value={texto}
          onChangeText={setTexto}
          placeholder="Lembrar de…"
          placeholderTextColor={palette.textMuted}
          style={[styles.campo, { flex: 1, color: palette.text, borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}
        />
        <TextInput
          value={hora}
          onChangeText={setHora}
          placeholder="14:30"
          keyboardType="numbers-and-punctuation"
          placeholderTextColor={palette.textMuted}
          style={[styles.campo, { width: 68, textAlign: 'center', color: palette.text, borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}
        />
        <Pressable onPress={enviar} style={[styles.botaoIcone, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
          <Feather name="check" size={16} color={palette.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function Lista({
  itens, vazio,
}: {
  itens: { chave: string; icone: keyof typeof Feather.glyphMap; texto: string; direita?: string }[];
  vazio: string;
}) {
  const { palette } = useTheme();
  if (!itens.length) return <Text variant="caption" color={palette.textMuted}>{vazio}</Text>;
  return (
    <>
      {itens.map(i => (
        <View key={i.chave} style={styles.linhaItem}>
          <Feather name={i.icone} size={13} color={palette.primary} />
          <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{i.texto}</Text>
          {i.direita && <Text variant="caption" color={palette.textMuted}>{i.direita}</Text>}
        </View>
      ))}
    </>
  );
}

function Discos({ lista }: { lista: DiskEntry[] }) {
  const { palette } = useTheme();
  if (!lista.length) return <Text variant="caption" color={palette.textMuted}>Sem leitura dos discos.</Text>;
  return (
    <>
      {lista.map(d => (
        <MetricBar key={d.name} icon="hard-drive" label={`${d.name} · ${d.freeGB} GB livres`} percent={d.usedPct} />
      ))}
    </>
  );
}

function Transferencia({ texto }: { texto: string }) {
  const { palette, tokens } = useTheme();
  return (
    <View style={[styles.caixaTexto, { borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}>
      <Text variant="caption" numberOfLines={4} color={texto ? palette.text : palette.textMuted}>
        {texto || 'Vazia.'}
      </Text>
    </View>
  );
}

function Atalhos({
  navegar, abrirPlayer,
}: {
  navegar: (t: 'chat' | 'control') => void;
  abrirPlayer: () => void;
}) {
  const { palette, tokens } = useTheme();
  const itens = [
    { chave: 'chat', label: 'Conversar', icone: 'message-circle' as const, acao: () => navegar('chat') },
    { chave: 'control', label: 'Controlar', icone: 'monitor' as const, acao: () => navegar('control') },
    { chave: 'player', label: 'Música', icone: 'music' as const, acao: abrirPlayer },
  ];
  return (
    <View style={styles.grade}>
      {itens.map(i => (
        <Pressable
          key={i.chave}
          onPress={i.acao}
          style={[styles.ladrilho, { borderRadius: tokens.radii.lg, backgroundColor: palette.primarySoft }]}
        >
          <Feather name={i.icone} size={20} color={palette.primary} />
          <Text variant="label" color={palette.primary}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Energia({
  acionar, agendar, cancelarAgendamento, agendado, ocupado,
}: {
  acionar: (op: PowerOperation, label: string, aviso: string) => void;
  agendar: (segundos: number) => void;
  cancelarAgendamento: () => void;
  agendado: number | null;
  ocupado: boolean;
}) {
  const { palette, tokens } = useTheme();
  const [abrindoHora, setAbrindoHora] = useState(false);
  const [horaTexto, setHoraTexto] = useState('');

  const botoes = [
    { op: 'lock' as const, label: 'Bloquear', icone: 'lock' as const, aviso: 'A tela do PC será bloqueada.' },
    { op: 'sleep' as const, label: 'Suspender', icone: 'moon' as const, aviso: 'O PC vai suspender.' },
    { op: 'shutdown' as const, label: 'Desligar', icone: 'power' as const, aviso: 'O PC desliga em 30 segundos. Trabalho não salvo se perde.' },
  ];

  /** Atalhos em minutos. Acima de 24 h o servidor recusa — ver `LIMITE_AGENDAMENTO_S`. */
  const atalhos = [15, 30, 60, 120];

  function confirmarHora() {
    const segundos = segundosAte(horaTexto);
    if (segundos === null) {
      Alert.alert('Hora inválida', 'Escreva no formato 23:30.');
      return;
    }
    if (segundos > LIMITE_AGENDAMENTO_S) {
      Alert.alert('Longe demais', 'O Windows aceita agendar o desligamento com até 24 horas de antecedência.');
      return;
    }
    setAbrindoHora(false);
    setHoraTexto('');
    agendar(segundos);
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <View style={styles.linhaEnergia}>
        {botoes.map(b => (
          <Pressable
            key={b.op}
            onPress={() => acionar(b.op, b.label, b.aviso)}
            disabled={ocupado}
            style={[styles.botaoEnergia, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft, opacity: ocupado ? 0.5 : 1 }]}
          >
            <Feather name={b.icone} size={17} color={b.op === 'shutdown' ? palette.error : palette.primary} />
            <Text variant="caption" color={b.op === 'shutdown' ? palette.error : palette.primary}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Agendamento em pé: o que está marcado e como desmarcar, sem precisar lembrar de
          um comando de voz. Enquanto há um agendamento, oferecer outro só confundiria —
          o Windows guarda um de cada vez, e o segundo pedido é recusado até cancelar. */}
      {agendado !== null ? (
        <View style={[styles.agendaAtiva, {
          borderRadius: tokens.radii.md,
          borderColor: palette.error,
          backgroundColor: palette.errorSoft,
        }]}>
          <Feather name="power" size={15} color={palette.error} />
          <View style={{ flex: 1 }}>
            <Text variant="caption" color={palette.error}>Desliga às {relogio(agendado)}</Text>
            <Text variant="caption" color={palette.textMuted}>{faltando(agendado)}</Text>
          </View>
          <Pressable
            onPress={cancelarAgendamento}
            disabled={ocupado}
            hitSlop={6}
            style={[styles.botaoCancelar, { borderRadius: tokens.radii.sm, borderColor: palette.error }]}
          >
            <Text variant="caption" color={palette.error}>Cancelar</Text>
          </Pressable>
        </View>
      ) : abrindoHora ? (
        <View style={styles.formLinha}>
          <TextInput
            value={horaTexto}
            onChangeText={setHoraTexto}
            placeholder="23:30"
            placeholderTextColor={palette.textMuted}
            keyboardType="numbers-and-punctuation"
            autoFocus
            onSubmitEditing={confirmarHora}
            style={[styles.campo, {
              flex: 1, borderRadius: tokens.radii.md,
              borderColor: palette.glassBorder, color: palette.text,
            }]}
          />
          <Pressable onPress={confirmarHora} style={[styles.botaoIcone, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft }]}>
            <Feather name="check" size={16} color={palette.primary} />
          </Pressable>
          <Pressable onPress={() => { setAbrindoHora(false); setHoraTexto(''); }} style={styles.botaoIcone}>
            <Feather name="x" size={16} color={palette.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <Text variant="caption" color={palette.textMuted}>Agendar desligamento</Text>
          <View style={styles.chips}>
            {atalhos.map(min => (
              <Pressable
                key={min}
                onPress={() => agendar(min * 60)}
                disabled={ocupado}
                style={[styles.chip, {
                  borderRadius: tokens.radii.full,
                  borderColor: palette.glassBorder,
                  opacity: ocupado ? 0.5 : 1,
                }]}
              >
                <Feather name="clock" size={12} color={palette.textMuted} />
                <Text variant="caption" color={palette.text}>
                  {min < 60 ? `${min} min` : `${min / 60} h`}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setAbrindoHora(true)}
              disabled={ocupado}
              style={[styles.chip, {
                borderRadius: tokens.radii.full,
                borderColor: palette.glassBorder,
                opacity: ocupado ? 0.5 : 1,
              }]}
            >
              <Feather name="edit-2" size={12} color={palette.textMuted} />
              <Text variant="caption" color={palette.text}>Escolher hora</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** Teto do `power.control` no servidor: `delaySeconds` entre 0 e 86400. */
const LIMITE_AGENDAMENTO_S = 86400;

/**
 * "23:30" → quantos segundos faltam até lá.
 *
 * Hora já passada hoje vira amanhã, em vez de erro: quem digita 07:00 às 23h quer o
 * próximo 07:00, e recusar seria pedir para a pessoa fazer a conta que o app pode fazer.
 * Devolve `null` quando o texto não é uma hora.
 */
function segundosAte(texto: string): number | null {
  const m = texto.trim().match(/^(\d{1,2})\s*[:h]?\s*(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;

  const alvo = new Date();
  alvo.setHours(h, min, 0, 0);
  if (alvo.getTime() <= Date.now()) alvo.setDate(alvo.getDate() + 1);
  return Math.round((alvo.getTime() - Date.now()) / 1000);
}

function relogio(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function faltando(ts: number): string {
  const s = Math.max(0, Math.round((ts - Date.now()) / 1000));
  if (s < 60) return `em ${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  return `em ${h} h ${min % 60} min`;
}

const styles = StyleSheet.create({
  linhaStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
  bolha: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%' },
  linhaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  climaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  campo: { paddingVertical: 8, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 13 },
  botaoIcone: { paddingVertical: 9, paddingHorizontal: 12 },
  caixaTexto: { padding: 10, borderWidth: StyleSheet.hairlineWidth },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ladrilho: { flexGrow: 1, minWidth: '30%', alignItems: 'center', gap: 6, paddingVertical: 16 },
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  linhaCfg: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linhaCfgAlvo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  iconeCfg: { paddingHorizontal: 6, paddingVertical: 7 },
  cantoTamanho: {
    position: 'absolute', right: 2, bottom: 2,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  linhaEnergia: { flexDirection: 'row', gap: 8 },
  botaoEnergia: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12 },
  agendaAtiva: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  botaoCancelar: { paddingVertical: 6, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth },
});
