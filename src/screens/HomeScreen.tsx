import { lembrado, lembrar } from '../lib/conexao/cache';
import { AtualizadoHa } from '../components/ui/AtualizadoHa';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Pressable, RefreshControl, ScrollView,
  StyleSheet, View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pairing } from '../lib/pairing';
import { AuthError } from '../lib/api';
import {
  callRpc, PowerOperation, Sugestao,
} from '../lib/rpc';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { openTelemetryStream, TelemetryFrame, TelemetryStatus } from '../lib/telemetry';
import { useTheme } from '../theme';
import { Card, Esqueleto, GlassCircle, ScreenHeader, Text } from '../components/ui';
import { haptica } from '../lib/haptica';
import BuscaPanel from './BuscaPanel';
import AvisoAtualizacao, { NovidadesCelular } from '../components/AvisoAtualizacao';
import { CARDS } from './inicio/cards';
import CardArrastavel from './inicio/CardArrastavel';
import { CARDS_PADRAO, CHAVE_AGENDAMENTO, CHAVE_CARDS, Ctx, Dados, saudacao } from './inicio/tipos';
import { CHAVE_LAYOUT_V2, migrarLayout, resumoDaInicio } from '../lib/layoutInicio';
import { useAbaAtiva, useAoReativar } from '../components/AbaViva';
import { avisarTokenRecusado } from '../lib/erroRpc';
import { EstadoPcLinha } from '../components/EstadoPc';

/** O nome do dono, copiado da config do PC (fase 13). Chave nova, nada renomeado. */
import { CHAVE_NOME } from './inicio/tipos';
/**
 * Tela inicial: um catálogo de cards, não uma tela fixa.
 *
 * A versão anterior tinha header, player, quatro atalhos, métricas, lembretes e energia —
 * nessa ordem, sempre. Agora cada card se declara num registro, sabe o que precisa buscar,
 * e pode ser ligado, desligado e arrastado para outro lugar. É o espelho do que o desktop
 * ganhou no mesmo bloco, e os dois leem pelos mesmos métodos RPC.
 *
 * ⚠️ O arrasto usa `react-native-gesture-handler` + `reanimated`, e isso é uma REVERSÃO
 * deliberada do bloco 24, que proibia as duas por serem nativas — proibição que existia
 * porque tudo precisava viajar por OTA. Com o APK novo já obrigatório, o motivo caiu.
 *
 * O que se ganha aqui em concreto: o dedo, a posição do card e a altura do redimensionamento
 * vivem na thread de UI. Antes cada quadro de arrasto era uma volta pela thread de JS, que
 * nesta tela é a mais ocupada do app — telemetria por WebSocket, re-sorteio das bolhas a
 * cada 120 ms e o tique do Spotify a cada 400 ms, todos disparando `setState`.
 */

export default function HomeScreen({
  pairing,
  onNavigate,
  onOpenPlayer,
  onOpenConversation,
  onPerguntar,
  onAbrirCaixa,
  onUnpair,
  pedidoBusca,
}: {
  pairing: Pairing;
  onNavigate: (screen: 'chat' | 'control' | 'rotinas') => void;
  onOpenPlayer: () => void;
  /** A busca (lupa do cabeçalho) abre conversas salvas e manda perguntas pro chat. */
  onOpenConversation: (id: string) => void;
  onPerguntar: (texto: string) => void;
  onAbrirCaixa?: () => void;
  onUnpair: () => void;
  /** Muda quando um widget pede a lupa (elysium://busca); zero na montagem. */
  pedidoBusca?: number;
}) {
  const { palette, tokens } = useTheme();
  const [buscaAberta, setBuscaAberta] = useState(false);
  useEffect(() => { if (pedidoBusca) setBuscaAberta(true); }, [pedidoBusca]);
  const [telemetria, setTelemetria] = useState<TelemetryFrame | null>(null);
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const [dados, setDados] = useState<Dados>({
    telemetria: null, lembretes: [], sugestoes: [], clima: null,
    processos: [], discos: [], transferencia: '', saude: null, foco: null, aprendi: null, hoje: null, listas: null, timers: null,
  });
  const [ocupado, setOcupado] = useState(false);
  // Os cards fora do padrão entram na ordem já desligados — senão ligá-los em Personalizar não os mostraria.
  const [ordem, setOrdem] = useState<string[]>(() => CARDS_PADRAO.concat(Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id))));
  const [ocultos, setOcultos] = useState<string[]>(() => Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id)));
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
    AsyncStorage.getItem(CHAVE_AGENDAMENTO())
      .then(bruto => {
        const quando = Number(bruto);
        if (bruto && Number.isFinite(quando) && quando > Date.now()) setAgendado(quando);
        else if (bruto) AsyncStorage.removeItem(CHAVE_AGENDAMENTO()).catch(() => { /* best-effort */ });
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

  // Aba escondida (08/10, abas vivas) não segura um WebSocket de telemetria aberto à toa.
  const ativa = useAbaAtiva();
  useEffect(() => (ativa ? openTelemetryStream(pairing, setTelemetria, setStatus) : undefined),
    [ativa, pairing.activeIp, pairing.port, pairing.token]);

  // ── ordem gravada
  useEffect(() => {
    (async () => {
      try {
        // Fase 22: a migração única para os cinco cards novos (lib/layoutInicio.ts).
        const [flag, salvoBruto] = await Promise.all([AsyncStorage.getItem(CHAVE_LAYOUT_V2), AsyncStorage.getItem(CHAVE_CARDS)]);
        const mig = migrarLayout(flag, salvoBruto);
        if (mig.apagarSalvo) await AsyncStorage.removeItem(CHAVE_CARDS);
        if (mig.gravarFlag) await AsyncStorage.setItem(CHAVE_LAYOUT_V2, '1');
        const bruto = mig.usar;
        if (!bruto) return;
        const salvo = JSON.parse(bruto) as {
          ordem?: string[]; ocultos?: string[]; fixos?: string[];
          tamanhos?: Record<string, { col?: number; alt?: number }>;
        };
        const conhecidos = (salvo.ordem ?? []).filter(id => id in CARDS);
        // Card novo numa versão futura precisa aparecer para quem já tinha configuração
        // gravada — senão nasce invisível e ninguém descobre que existe.
        const faltando = Object.keys(CARDS).filter(id => !conhecidos.includes(id));
        // Card novo de fábrica entra logo depois do vizinho da ordem de fábrica, não no fim
        // da tela (o "Hoje", bloco 126, nasceria depois de todos).
        const ordemNova = [...conhecidos];
        for (const id of faltando) {
          const i = CARDS_PADRAO.indexOf(id);
          const antes = i > 0 ? CARDS_PADRAO.slice(0, i).reverse().find(v => ordemNova.includes(v)) : undefined;
          if (i < 0) ordemNova.push(id);
          else if (antes) ordemNova.splice(ordemNova.indexOf(antes) + 1, 0, id);
          else ordemNova.unshift(id);
        }
        setOrdem(ordemNova);
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

  // Nada de `animarProximoLayout` antes do `setState`: o `LayoutAnimation` era no-op na
  // Nova Arquitetura (§14) e nenhuma destas transições chegava a acontecer. Quem anima
  // agora é o `layout={LAYOUT}` na própria view, junto do `entering`/`exiting`.
  function alternarCard(id: string, ligado: boolean) {
    const novos = ligado ? [...ocultos, id] : ocultos.filter(x => x !== id);
    setOcultos(novos);
    gravar(ordem, novos);
  }

  function alternarFixo(id: string) {
    const novos = fixos.includes(id) ? fixos.filter(x => x !== id) : [...fixos, id];
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

  /** A primeira volta do `carregar` terminou: antes disso os cards mostram esqueleto (bloco 92). */
  const [primeiraLeitura, setPrimeiraLeitura] = useState(false);

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
    if (precisa.has('foco')) jobs.push(puxar('foco', async () => await callRpc(pairing, 'foco.status')));
    if (precisa.has('listas')) jobs.push(puxar('listas', async () => (await callRpc(pairing, 'listas.list')).listas));
    // O relógio do PC pode estar adiantado/atrasado em relação ao celular: guarda a diferença.
    if (precisa.has('timers')) jobs.push(puxar('timers', async () => { const r = await callRpc(pairing, 'timers.list'); return { lista: r.timers, diferenca: r.agora - Date.now() }; }));
    if (precisa.has('hoje')) jobs.push(puxar('hoje', async () => (await callRpc(pairing, 'resumo.dia', {}, { timeoutMs: 15000 })).texto));
    if (precisa.has('aprendi')) jobs.push(puxar('aprendi', async () => (await callRpc(pairing, 'memory.sugestoes')).sugestoes));
    if (precisa.has('saude')) jobs.push(puxar('saude', async () =>
      (await callRpc(pairing, 'system.saude', {}, { timeoutMs: 15000 })).itens));
    if (precisa.has('transferencia')) jobs.push(puxar('transferencia', async () =>
      (await callRpc(pairing, 'clipboard.get')).text));

    await Promise.all(jobs);
    setDados(prev => {
      const novo = { ...prev, ...d };
      // 26/10: o que veio do PC fica guardado (modo offline); sem nada novo, segue o guardado.
      if (Object.keys(d).length) { void lembrar('inicio', novo); setGuardadoEm(null); }
      return novo;
    });
    setPrimeiraLeitura(true);
  }, [pairing, visiveis]);

  // 26/10: abre com o último estado guardado (sem esqueleto e sem tela vazia fora de casa).
  const [guardadoEm, setGuardadoEm] = useState<number | null>(null);
  useEffect(() => {
    void lembrado<Dados>('inicio').then((c) => {
      if (!c) return;
      setDados((prev) => ({ ...c.dados, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length) && v !== '')) }));
      setGuardadoEm(c.em);
      setPrimeiraLeitura(true);
    });
  }, [pairing]);

  useEffect(() => { carregar(); }, [carregar]);
  // Puxar para atualizar com o círculo de verdade (08/10): antes ficava fixo em "parado".
  const [puxando, setPuxando] = useState(false);
  // Voltou à Início: os cards se atualizam por trás, sem sumir.
  useAoReativar(() => { void carregar(); });

  // O nome da saudação vem da config do PC (fase 13): dado pessoal fica nos dados do app,
  // nunca no código. Guardado no aparelho para a saudação funcionar sem rede.
  const [nome, setNome] = useState('');
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_NOME).then((n) => { if (n) setNome(n); }).catch(() => {});
    callRpc(pairing, 'pairing.endpoints', {}, { timeoutMs: 5000 })
      .then((r) => {
        const n = (r.tratamento || r.nome || '').trim();
        setNome(n);
        AsyncStorage.setItem(CHAVE_NOME, n).catch(() => {});
      })
      .catch(() => { /* sem PC: fica o guardado */ });
  }, [pairing]);

  function tratarErro(err: unknown, contexto: string) {
    if (err instanceof AuthError) {
      // 401 não despareia mais sozinho (08/10) — ver lib/erroRpc.ts.
      avisarTokenRecusado();
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
      if (quando === null) await AsyncStorage.removeItem(CHAVE_AGENDAMENTO());
      else await AsyncStorage.setItem(CHAVE_AGENDAMENTO(), String(quando));
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

    setOrdem(nova);
    gravar(nova, ocultos);
  }

  const online = status === 'open';

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={nome ? `${saudacao()}, ${nome}` : saudacao()}
        right={
          <View style={styles.linhaStatus}>
            {/* 08/10: o microfone que mostrava a escuta do "Ely" saiu do topo — o Zak o lia como a
                mão livre que ele pediu para tirar. O estado da escuta continua em Ajustes → Voz. */}
            <GlassCircle accessibilityLabel="Buscar" size={32} onPress={() => { haptica.leve(); setBuscaAberta(true); }}>
              <Feather name="search" size={16} color={palette.textMuted} />
            </GlassCircle>
            {/* Só o ponto: a saudação virou o título e não sobra largura para "PC online"
                aqui. O texto do estado mora na linha abaixo do cabeçalho. */}
            <View style={[styles.ponto, { backgroundColor: online ? palette.success : palette.error }]} />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.md }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={async () => { setPuxando(true); try { await carregar(); } finally { setPuxando(false); } }} tintColor={palette.primary} colors={[palette.primary]} />}
        // Só para de rolar enquanto um arrasto está REALMENTE em curso. Antes isto era
        // `!editando`, o que matava a rolagem durante toda a personalização e tornava
        // impossível chegar nos cards de baixo. Ver o comentário em `CardArrastavel`.
        scrollEnabled={!arrastando}
      >
        {/* A saudação do desktop (bloco 33), aqui também: a Início precisa dizer de cara
            que é a Início, e o estado do PC merece uma frase, não só um ponto no canto. */}
        {!editando && (
          <View style={{ paddingBottom: 2 }}>
            {/* 08/10: o estado do ELYSIUM no PC (na tela, minimizado, bandeja, fechado,
                desligado), com os detalhes num toque. */}
            {/* Fase 22: uma linha só — PC, lembretes e clima juntos. */}
            <EstadoPcLinha extra={resumoDaInicio(dados.lembretes.length, dados.clima ? dados.clima.temperatura : null)} />
            {!online && <AtualizadoHa em={guardadoEm} />}
          </View>
        )}

        {/* Versão nova do app guardada no PC (bloco 95). Some sozinho quando não há. */}
        {!editando && <NovidadesCelular />}
        {!editando && online && <AvisoAtualizacao pairing={pairing} modo="inicio" />}

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
                {Alca => (
                  <Card glass style={{ gap: tokens.spacing.sm, flex: t?.alt ? 1 : undefined }}>
                    <View style={styles.cabecalho}>
                      <Feather name={CARDS[id].icone} size={14} color={palette.textMuted} />
                      <Text variant="label" color={palette.textMuted}>{CARDS[id].titulo}</Text>
                      {editando && !fixos.includes(id) && (
                        <Alca>
                          <Feather name="menu" size={16} color={palette.primary} />
                        </Alca>
                      )}
                    </View>
                    {!primeiraLeitura && CARDS[id].precisa.length ? <Esqueleto /> : CARDS[id].corpo(ctx)}
                  </Card>
                )}
              </CardArrastavel>
            );
          })}
        </View>

        {visiveis.length === 0 && (
          <Text variant="caption" color={palette.textMuted}>
            Todos os cards estão desligados. Toque em "Personalizar" para escolher.
          </Text>
        )}

        {/* Fase 22: o editor saiu do cabeçalho — fica aqui no fim, atrás deste botão. */}
        <Pressable onPress={() => { haptica.leve(); setEditando(v => !v); }} accessibilityRole="button" hitSlop={6}
          style={[styles.personalizar, { borderColor: palette.glassBorder, borderRadius: tokens.radii.full }]}>
          <Feather name={editando ? 'check' : 'sliders'} size={14} color={palette.primary} />
          <Text variant="label" color={palette.primary}>{editando ? 'Pronto' : 'Personalizar'}</Text>
        </Pressable>
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

                  <Pressable accessibilityLabel="Fixar o card" accessibilityRole="button" onPress={() => alternarFixo(id)} hitSlop={8} style={styles.iconeCfg}>
                    <Feather name="bookmark" size={15} color={fixo ? palette.accent : palette.textMuted} />
                  </Pressable>
                  <Pressable accessibilityLabel="Mover o card para cima" accessibilityRole="button"
                    onPress={() => mover(pos, pos - 1)}
                    disabled={!ligado || fixo || pos <= 0}
                    hitSlop={8}
                    style={[styles.iconeCfg, { opacity: !ligado || fixo || pos <= 0 ? 0.25 : 1 }]}
                  >
                    <Feather name="chevron-up" size={17} color={palette.textMuted} />
                  </Pressable>
                  <Pressable accessibilityLabel="Mover o card para baixo" accessibilityRole="button"
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

      </ScrollView>

      <BuscaPanel
        pairing={pairing}
        visible={buscaAberta}
        onClose={() => setBuscaAberta(false)}
        onNavigate={onNavigate}
        onOpenConversation={onOpenConversation}
        onPerguntar={onPerguntar}
        onAbrirPlayer={onOpenPlayer}
        onAbrirCaixa={onAbrirCaixa}
      />
    </View>
  );
}

/**
 * Envelope arrastável. Só responde ao toque no modo de edição — fora dele, o card inteiro
 * continua clicável normalmente, e um gesto de rolagem não deve ser confundido com arrasto.
 */

const styles = StyleSheet.create({
  linhaStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  linhaCfg: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linhaCfgAlvo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  iconeCfg: { paddingHorizontal: 6, paddingVertical: 7 },
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  personalizar: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
});
