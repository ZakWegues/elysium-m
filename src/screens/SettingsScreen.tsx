import { useCallback, useEffect, useState } from 'react';
import * as Application from 'expo-application';
import AvisoAtualizacao from '../components/AvisoAtualizacao';
import { versaoInstalada } from '../lib/atualizacao';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import { aplicarOta, procurarOta } from '../lib/atualizacaoOta';
import { MOV } from '../lib/motion';
import { haptica } from '../lib/haptica';
import { definirNotificacoesAtivas, notificacoesAtivas, pedirPermissao } from '../lib/notificacoes';
import { listarPcs, Pairing } from '../lib/pairing';
import { callRpc, Perfil, PushCategory, PushPrefs } from '../lib/rpc';
import { pushAvailability, registerForPush } from '../lib/pushNotifications';
import { errMessage } from '../lib/errors';
import { useTheme, palettes, getPalette, ROTULO_FAMILIA, FamiliaEscolha, ThemeName } from '../theme';
import { Button, Card, Text, Toque } from '../components/ui';
import { falaAntecipadaLigada, falar, lerRespostasEscritas, ligarFalaAntecipada, ligarLerRespostasEscritas, ligarVozDoPc, vozDoPcLigada } from '../lib/falar';
import { ligarPalavra, palavraLigada, useEstadoPalavra } from '../lib/palavraNoCelular';

/**
 * As duas famílias, mais "seguir o aparelho".
 *
 * Eram "Claro / Escuro / Sistema", o que descrevia o brilho e escondia a escolha real:
 * as duas famílias são desenhos diferentes, não o mesmo desenho com o brilho trocado.
 * Agora a pergunta é a mesma que o desktop faz, com o mesmo vocabulário.
 */
const FAMILIA_OPTIONS: { value: FamiliaEscolha; label: string; icon: keyof typeof Feather.glyphMap; nota: string }[] = [
  { value: 'stark', label: ROTULO_FAMILIA.stark, icon: 'cpu', nota: 'HUD escuro, azul de reator — o padrão da Ely' },
  { value: 'lg', label: ROTULO_FAMILIA.lg, icon: 'droplet', nota: 'Vidro translúcido, fundo claro' },
  { value: 'ely', label: ROTULO_FAMILIA.ely, icon: 'moon', nota: 'Noite azul com luz dourada e feixes de luz' },
  { value: 'auto', label: 'Seguir o aparelho', icon: 'smartphone', nota: 'Vidro no modo claro, ELYSIUM no escuro' },
];

/**
 * Ajustes em azulejos (bloco 91) — o mesmo desenho que o desktop ganhou no bloco 65. Era
 * uma lista corrida: estilo, cor, voz, notificações e "Sobre" um embaixo do outro, e
 * "Desparear" no fim de tudo. Agora a gaveta abre num hub; cada azulejo mostra o valor que
 * está valendo e abre a seção, com uma seta para voltar.
 */
type Secao = 'aparencia' | 'voz' | 'conversa' | 'avisos' | 'pareamento' | 'sobre';

export default function SettingsScreen({ pairing, onUnpair, onTrocarPc, onAdicionarPc }: { pairing: Pairing; onUnpair: () => void; onTrocarPc: (id: string) => void; onAdicionarPc: () => void }) {
  const { palette, tokens, familiaResolvida, name } = useTheme();
  const [secao, setSecao] = useState<Secao | null>(null);
  const [vozPc, setVozPc] = useState(true);
  const [avisos, setAvisos] = useState(false);
  useEffect(() => { vozDoPcLigada().then(setVozPc); notificacoesAtivas().then(setAvisos); }, [secao]);

  const cor = getPalette(name, familiaResolvida);
  const azulejos: { id: Secao; titulo: string; icone: keyof typeof Feather.glyphMap; resumo: string }[] = [
    { id: 'aparencia', titulo: 'Aparência', icone: 'droplet', resumo: `${ROTULO_FAMILIA[familiaResolvida]} · ${cor.rotulo}` },
    { id: 'voz', titulo: 'Voz', icone: 'volume-2', resumo: vozPc ? 'Voz do PC' : 'Voz do celular' },
    { id: 'conversa', titulo: 'Jeito de responder', icone: 'message-circle', resumo: 'Tamanho e instruções' },
    { id: 'avisos', titulo: 'Notificações', icone: 'bell', resumo: avisos ? 'Avisando neste celular' : 'Desligadas' },
    { id: 'pareamento', titulo: 'Pareamento', icone: 'wifi', resumo: `${pairing.activeIp}:${pairing.port}` },
    { id: 'sobre', titulo: 'Sobre', icone: 'info', resumo: `Versão ${versaoInstalada()} · atualizações` },
  ];

  if (!secao) {
    return (
      <View style={styles.hub}>
        {azulejos.map((a, i) => (
          <Animated.View key={a.id} style={styles.celula} entering={FadeInDown.delay(i * 30).duration(MOV.base).reduceMotion(ReduceMotion.System)}>
            <Toque onPress={() => setSecao(a.id)} style={{ flex: 1 }}>
              <Card glass style={styles.azulejo}>
                <View style={[styles.iconeAzulejo, { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.md }]}>
                  <Feather name={a.icone} size={19} color={palette.primary} />
                </View>
                <Text variant="label" numberOfLines={1}>{a.titulo}</Text>
                <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{a.resumo}</Text>
              </Card>
            </Toque>
          </Animated.View>
        ))}
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(MOV.base).reduceMotion(ReduceMotion.System)} style={{ gap: tokens.spacing.lg }}>
      <Pressable onPress={() => setSecao(null)} hitSlop={10} style={styles.voltar}>
        <Feather name="chevron-left" size={18} color={palette.primary} />
        <Text variant="label" color={palette.primary}>{azulejos.find(a => a.id === secao)?.titulo}</Text>
      </Pressable>
      {secao === 'aparencia' && <SecaoAparencia />}
      {secao === 'voz' && <VozSection pairing={pairing} />}
      {secao === 'conversa' && <SecaoConversa pairing={pairing} />}
      {secao === 'avisos' && (
        <View style={{ gap: tokens.spacing.lg }}>
          <AvisosLocais />
          <PushSection pairing={pairing} />
        </View>
      )}
      {secao === 'pareamento' && <SecaoPareamento pairing={pairing} onUnpair={onUnpair} onTrocarPc={onTrocarPc} onAdicionarPc={onAdicionarPc} />}
      {secao === 'sobre' && <SecaoSobre pairing={pairing} />}
    </Animated.View>
  );
}

/**
 * Jeito de responder (bloco 134): o tamanho das respostas e as instruções em texto livre.
 * Mora na config do PC (dado pessoal fica nos dados do app, não no código) — o celular
 * só lê e grava pelo RPC.
 */
function SecaoConversa({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [tratamento, setTratamento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    callRpc(pairing, 'perfil.get')
      .then((p) => { setPerfil(p); setRascunho(p.instrucoesPessoais); setTratamento(p.tratamento ?? ''); })
      .catch((e) => setErro(`O PC não respondeu (ou é anterior à 1.8.0): ${errMessage(e)}`));
  }, [pairing]);
  async function gravar(patch: Partial<Perfil>) {
    setSalvando(true);
    try { setPerfil(await callRpc(pairing, 'perfil.set', patch)); haptica.leve(); }
    catch (e) { Alert.alert('Jeito de responder', errMessage(e)); }
    finally { setSalvando(false); }
  }
  if (erro) return <Text variant="caption" color={palette.textMuted}>{erro}</Text>;
  if (!perfil) return <ActivityIndicator color={palette.primary} />;
  const estilos: { valor: Perfil['estiloResposta']; rotulo: string; nota: string }[] = [
    { valor: 'direto', rotulo: 'Direto', nota: 'O mínimo que resolve' },
    { valor: 'equilibrado', rotulo: 'Equilibrado', nota: 'Conforme a pergunta' },
    { valor: 'detalhado', rotulo: 'Detalhado', nota: 'Com o porquê e exemplos' },
  ];
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="subheading">Tamanho das respostas</Text>
      {estilos.map(o => {
        const sel = perfil.estiloResposta === o.valor;
        return (
          <Pressable key={o.valor} disabled={salvando} onPress={() => gravar({ estiloResposta: o.valor })}
            style={[styles.familiaBtn, { borderRadius: tokens.radii.md, backgroundColor: sel ? palette.primarySoft : 'transparent', borderColor: sel ? palette.primary : palette.border }]}>
            <View style={{ flex: 1 }}>
              <Text variant="body" color={sel ? palette.primary : palette.text}>{o.rotulo}</Text>
              <Text variant="caption" color={palette.textMuted}>{o.nota}</Text>
            </View>
            {sel && <Feather name="check" size={16} color={palette.primary} />}
          </Pressable>
        );
      })}
      {/* Fase 16: a persona chama o dono pelo tratamento ("chefe"). PC antigo não tem o campo. */}
      {perfil.tratamento !== undefined && (
        <>
          <Text variant="subheading" style={{ marginTop: tokens.spacing.md }}>Como a Ely te chama</Text>
          <Text variant="caption" color={palette.textMuted}>Ex.: chefe, senhor, o seu nome. Vazio = sem tratamento.</Text>
          <TextInput
            value={tratamento}
            onChangeText={setTratamento}
            onEndEditing={() => { if (tratamento.trim() !== (perfil.tratamento ?? '')) gravar({ tratamento: tratamento.trim() }); }}
            maxLength={30}
            placeholder="chefe"
            placeholderTextColor={palette.textMuted}
            style={{ color: palette.text, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: tokens.radii.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }}
          />
        </>
      )}
      <Text variant="subheading" style={{ marginTop: tokens.spacing.md }}>Como a Ely responde</Text>
      <Text variant="caption" color={palette.textMuted}>
        Em texto livre: como você quer ser tratado, o que evitar, o que sempre incluir. Vale no PC e aqui.
      </Text>
      <TextInput
        value={rascunho}
        onChangeText={setRascunho}
        multiline
        maxLength={1500}
        placeholder="Ex.: sem emoji; preço sempre em reais; me corrija se eu estiver errado."
        placeholderTextColor={palette.textMuted}
        style={{ minHeight: 110, textAlignVertical: 'top', color: palette.text, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: tokens.radii.md, padding: 12, fontSize: 14 }}
      />
      <Button title={salvando ? 'Salvando…' : 'Salvar instruções'} disabled={salvando || rascunho === perfil.instrucoesPessoais} onPress={() => gravar({ instrucoesPessoais: rascunho })} />
    </View>
  );
}

function SecaoPareamento({ pairing, onUnpair, onTrocarPc, onAdicionarPc }: { pairing: Pairing; onUnpair: () => void; onTrocarPc: (id: string) => void; onAdicionarPc: () => void }) {
  const { palette, tokens } = useTheme();
  // Vários PCs (bloco 121): a lista, o ativo marcado, trocar com um toque.
  const [pcs, setPcs] = useState<{ id: string; nome: string; ativo: boolean }[]>([]);
  useEffect(() => { listarPcs().then(setPcs).catch(() => setPcs([])); }, [pairing]);
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.xs }}>
        <Text variant="subheading">PCs pareados</Text>
        {pcs.map(p => (
          <Pressable key={p.id} onPress={() => !p.ativo && onTrocarPc(p.id)} style={styles.linhaEndereco} disabled={p.ativo}>
            <Feather name={p.ativo ? 'check-circle' : 'monitor'} size={15} color={p.ativo ? palette.success : palette.textMuted} />
            <Text variant="body" style={{ flex: 1 }}>{p.nome}</Text>
            <Text variant="caption" color={p.ativo ? palette.success : palette.primary}>{p.ativo ? 'em uso' : 'usar este'}</Text>
          </Pressable>
        ))}
        <Button title="Parear outro PC" variant="secondary" onPress={onAdicionarPc} />
        <Text variant="caption" color={palette.textMuted}>
          Cada PC tem as próprias conversas e recados neste celular. Até 5 PCs.
        </Text>
      </View>
      <Card glass style={{ gap: tokens.spacing.md, flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={[
            styles.pairedIcon,
            { backgroundColor: palette.primarySoft, borderRadius: tokens.radii.full },
          ]}
        >
          <Feather name="wifi" size={18} color={palette.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Pareado</Text>
          <Text variant="body" color={palette.textMuted}>
            {pairing.activeIp}:{pairing.port}
          </Text>
          {pairing.endpoints.length > 1 && (
            <Text variant="caption" color={palette.textMuted}>
              {pairing.endpoints.length} endereços conhecidos
              {pairing.hostname ? ` · ${pairing.hostname}` : ''}
            </Text>
          )}
        </View>
      </Card>
      <View style={{ gap: tokens.spacing.xs }}>
        <Text variant="subheading">Endereços do PC</Text>
        <Text variant="caption" color={palette.textMuted}>
          O app tenta todos e fica no que responde. O do túnel é o que vale fora de casa.
        </Text>
        {pairing.endpoints.map(ip => (
          <View key={ip} style={styles.linhaEndereco}>
            <Feather name={ip === pairing.activeIp ? 'check-circle' : 'circle'} size={14} color={ip === pairing.activeIp ? palette.success : palette.textMuted} />
            <Text variant="body" style={{ flex: 1 }}>{ip}</Text>
            {/^100\./.test(ip) && <Text variant="caption" color={palette.textMuted}>túnel</Text>}
          </View>
        ))}
      </View>
      <Button title={pcs.length > 1 ? 'Esquecer este PC' : 'Desparear'} variant="destructive" onPress={onUnpair} />
    </View>
  );
}

function SecaoAparencia() {
  const { name, palette, tokens, familia, familiaResolvida, setTheme, setFamilia } = useTheme();
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="subheading">Estilo</Text>
        <Text variant="caption" color={palette.textMuted}>
          As duas famílias visuais do ELYSIUM desktop.
        </Text>
        {FAMILIA_OPTIONS.map((opt) => {
          const selected = opt.value === familia;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setFamilia(opt.value)}
              style={[
                styles.familiaBtn,
                {
                  borderRadius: tokens.radii.md,
                  backgroundColor: selected ? palette.primarySoft : 'transparent',
                  borderColor: selected ? palette.primary : palette.border,
                },
              ]}
            >
              <Feather
                name={opt.icon}
                size={17}
                color={selected ? palette.primary : palette.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text variant="body" color={selected ? palette.primary : palette.text}>
                  {opt.label}
                </Text>
                <Text variant="caption" color={palette.textMuted}>{opt.nota}</Text>
              </View>
              {selected && <Feather name="check" size={16} color={palette.primary} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="subheading">Cor</Text>
        <Text variant="caption" color={palette.textMuted}>
          Três variações dentro da família {ROTULO_FAMILIA[familiaResolvida]}. São
          exatamente as seis do desktop: cada cor tem um nome próprio em cada família.
        </Text>
        <View style={styles.swatchRow}>
          {(Object.keys(palettes) as ThemeName[]).map((key) => {
            // Do modo ATUAL, não das paletas claras: as duas caras de um tema são bem
            // diferentes, e mostrar a clara no escuro faria a amostra mentir sobre o que
            // vai acontecer ao tocar nela.
            const p = getPalette(key, familiaResolvida);
            const selected = key === name;
            return (
              <Pressable
                key={key}
                onPress={() => setTheme(key)}
                style={[
                  styles.swatch,
                  {
                    borderRadius: tokens.radii.lg,
                    borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                    borderColor: selected ? p.primary : palette.border,
                    backgroundColor: palette.surface,
                  },
                ]}
              >
                <View style={styles.swatchDots}>
                  <View style={[styles.dot, { backgroundColor: p.primary }]} />
                  <View style={[styles.dot, { backgroundColor: p.accent }]} />
                </View>
                {/* O nome do desktop, não o interno: na família Vidro, "Elísio" chama-se
                    "Vidro — Âmbar", e mostrar o nome interno faria as duas telas do mesmo
                    ecossistema divergirem no vocabulário. */}
                <Text variant="label">{p.rotulo}</Text>
                {selected && <Feather name="check" size={16} color={p.primary} />}
              </Pressable>
            );
          })}
        </View>
      </View>

    </View>
  );
}

/** O interruptor que antes morava só na aba Rotinas: avisos locais neste aparelho. */
function AvisosLocais() {
  const { palette, tokens } = useTheme();
  const [ligado, setLigado] = useState(false);
  useEffect(() => { notificacoesAtivas().then(setLigado); }, []);
  async function alternar(v: boolean) {
    if (v && !(await pedirPermissao())) {
      Alert.alert('Permissão negada', 'Libere as notificações do ELYSIUM-M nas configurações do Android.');
      return;
    }
    await definirNotificacoesAtivas(v);
    setLigado(v);
    haptica.leve();
  }
  return (
    <Card glass style={{ gap: tokens.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
        <Feather name="smartphone" size={18} color={palette.primary} />
        <Text variant="body" style={{ flex: 1 }}>Avisar neste celular</Text>
        <Switch value={ligado} onValueChange={alternar} trackColor={{ true: palette.primary }} />
      </View>
      <Text variant="caption" color={palette.textMuted}>
        Rotinas e lembretes do PC viram notificação aqui — pela rede ou pelo túnel, sem nuvem.
        Lembretes tocam mesmo sem rede (ficam agendados no aparelho).
      </Text>
    </Card>
  );
}

/** "Procurar atualização" do app (OTA): diz o que achou em vez de calar (07/10). */
function BotaoProcurarOta() {
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { isUpdatePending } = Updates.useUpdates();
  async function procurar() {
    setOcupado(true);
    const r = await procurarOta(true);
    setOcupado(false);
    setEstado(r === 'baixada' ? 'Baixada. Toque em Reiniciar.' : r === 'nada' ? 'Este celular já está com a última.' : r === 'desligado' ? 'Atualização pelo ar desligada nesta versão.' : 'Não consegui procurar agora (sem internet?).');
  }
  if (isUpdatePending) return <Button title="Reiniciar e atualizar" onPress={() => aplicarOta()} />;
  return (
    <View style={{ gap: 6 }}>
      <Button title={ocupado ? 'Procurando…' : 'Procurar atualização do app'} variant="secondary" onPress={procurar} disabled={ocupado} />
      {estado ? <Text variant="caption">{estado}</Text> : null}
    </View>
  );
}

/** Versão, atualização pelo ar e um diagnóstico que dá para colar numa conversa. */
function SecaoSobre({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [pc, setPc] = useState<string>('…');
  useEffect(() => {
    callRpc(pairing, 'pairing.endpoints', {}, { timeoutMs: 5000 })
      .then(r => setPc(`${r.hostname ?? 'PC'} · ${r.endpoints.length} endereço(s)${r.hasTunnel ? ' · túnel' : ''}`))
      .catch(() => setPc('fora de alcance'));
  }, [pairing]);
  const linhas: [string, string][] = [
    // A versão NATIVA: um OTA traz o app.json novo por cima de um APK velho (bloco 95).
    ['Versão do app', `${versaoInstalada()} (${Application.nativeBuildVersion ?? '?'})`],
    ['Runtime', String(Updates.runtimeVersion ?? '—').slice(0, 12)],
    ['Canal', String(Updates.channel ?? '—')],
    ['Atualização', Updates.updateId ? `${Updates.updateId.slice(0, 8)} · ${Updates.createdAt ? Updates.createdAt.toLocaleDateString('pt-BR') : ''}` : 'a do APK'],
    ['PC', pc],
    ['Endereço ativo', `${pairing.activeIp}:${pairing.port}`],
  ];
  async function copiar() {
    const doCelular = ['ELYSIUM-M — diagnóstico', ...linhas.map(([k, v]) => `${k}: ${v}`), `Em: ${new Date().toLocaleString('pt-BR')}`].join('\n');
    // O do PC vem junto quando ele responde (bloco 97): versão, modelos, log — o que
    // precisa para entender um problema que atravessa os dois lados.
    let doPc = '';
    try { doPc = (await callRpc(pairing, 'system.diagnostico', {}, { timeoutMs: 15000 })).texto; } catch { doPc = '(PC fora de alcance — só o do celular)'; }
    await Clipboard.setStringAsync(`${doCelular}\n\n${doPc}`);
    haptica.sucesso();
    Alert.alert('Copiado', 'O diagnóstico do celular e o do PC estão na área de transferência.');
  }
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <AvisoAtualizacao pairing={pairing} modo="sobre" />
      <Card glass style={{ gap: tokens.spacing.sm }}>
        {linhas.map(([k, v]) => (
          <View key={k} style={styles.linhaEndereco}>
            <Text variant="caption" color={palette.textMuted} style={{ width: 110 }}>{k}</Text>
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </Card>
      <BotaoProcurarOta />
      <Button title="Copiar diagnóstico" variant="secondary" onPress={copiar} />
      <Text variant="caption" color={palette.textMuted}>
        ELYSIUM-M é o companheiro do assistente ELYSIUM do PC. Conversa, voz, controle
        remoto, rotinas e a caixa de recados falam com o servidor do PC na rede de casa, ou
        pelo túnel fora dela.
      </Text>
    </View>
  );
}

/** Voz das respostas: a neural do PC (bloco 85) ou a do aparelho. */
function VozSection({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [doPc, setDoPc] = useState(true);
  const [palavra, setPalavra] = useState(true);
  const [ler, setLer] = useState(true);
  const [antecipada, setAntecipada] = useState(true);
  const estado = useEstadoPalavra();
  useEffect(() => { vozDoPcLigada().then(setDoPc); palavraLigada().then(setPalavra); lerRespostasEscritas().then(setLer); falaAntecipadaLigada().then(setAntecipada); }, []);
  const opcoes: { valor: boolean; rotulo: string; nota: string; icone: keyof typeof Feather.glyphMap }[] = [
    { valor: true, rotulo: 'Voz do PC', nota: 'A mesma voz neural da caixa de som do PC (escolhida em Ajustes → Voz lá). Sem PC, cai na do celular.', icone: 'monitor' },
    { valor: false, rotulo: 'Voz do celular', nota: 'A voz do Android. Funciona sem o PC, mas soa mais robótica.', icone: 'smartphone' },
  ];
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {/* Bloco 129: a palavra de ativação do celular. Vale na hora (aoMudarPalavra). */}
      <View style={[styles.familiaBtn, { borderRadius: tokens.radii.md, borderColor: palette.border }]}>
        <Feather name="mic" size={17} color={palavra ? palette.primary : palette.textMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="body">Ouvir “Ely”</Text>
          <Text variant="caption" color={palette.textMuted}>
            Com o app aberto na Início ou no Chat, diga “Ely” e o seu pedido (ou “Ely, pausa a música”). Ela responde uma vez; para outro pedido, diga “Ely” de novo. Só com o app na tela — nada escuta em segundo plano.
          </Text>
        </View>
        <Switch value={palavra} onValueChange={(v) => { setPalavra(v); ligarPalavra(v); }} trackColor={{ true: palette.primary }} />
      </View>
      <View style={[styles.familiaBtn, { borderRadius: tokens.radii.md, borderColor: palette.border }]}>
        <Feather name="volume-2" size={17} color={ler ? palette.primary : palette.textMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="body">Ler respostas digitadas</Text>
          <Text variant="caption" color={palette.textMuted}>
            Quando você digita, ela também fala o começo da resposta. Pedidos por voz sempre respondem falando.
          </Text>
        </View>
        <Switch value={ler} onValueChange={(v) => { setLer(v); ligarLerRespostasEscritas(v); }} trackColor={{ true: palette.primary }} accessibilityLabel="Ler respostas digitadas" />
      </View>
      <View style={[styles.familiaBtn, { borderRadius: tokens.radii.md, borderColor: palette.border }]}>
        <Feather name="fast-forward" size={17} color={antecipada ? palette.primary : palette.textMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="body">Começar a falar antes de terminar</Text>
          <Text variant="caption" color={palette.textMuted}>
            No pedido por voz, ela fala a primeira frase assim que fica pronta. Se a fala picotar, desligue.
          </Text>
        </View>
        <Switch value={antecipada} onValueChange={(v) => { setAntecipada(v); ligarFalaAntecipada(v); }} trackColor={{ true: palette.primary }} accessibilityLabel="Começar a falar antes de terminar" />
      </View>
      {palavra && (
        <Text variant="caption" color={estado.fase === 'falhou' ? palette.error : palette.textMuted}>
          {estado.fase === 'ouvindo' ? `Agora: escutando ${estado.offline ? 'no próprio celular' : 'pelo Google (online)'}.`
            : estado.fase === 'falhou' ? `Agora: não está escutando — ${estado.motivo}.`
            : 'Agora: pausado (escuta só com a Início ou o Chat na tela, e para enquanto Ajustes está aberto).'}
        </Text>
      )}
      <Text variant="subheading">Voz das respostas</Text>
      {opcoes.map(o => {
        const sel = o.valor === doPc;
        return (
          <Pressable
            key={o.rotulo}
            onPress={async () => { setDoPc(o.valor); await ligarVozDoPc(o.valor); falar('Assim fica a minha voz.', pairing); }}
            style={[styles.familiaBtn, { borderRadius: tokens.radii.md, backgroundColor: sel ? palette.primarySoft : 'transparent', borderColor: sel ? palette.primary : palette.border }]}
          >
            <Feather name={o.icone} size={17} color={sel ? palette.primary : palette.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="body" color={sel ? palette.primary : palette.text}>{o.rotulo}</Text>
              <Text variant="caption" color={palette.textMuted}>{o.nota}</Text>
            </View>
            {sel && <Feather name="check" size={16} color={palette.primary} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const CATEGORY_LABEL: Record<PushCategory, string> = {
  reminder: 'Lembretes',
  anomaly: 'Alertas do PC',
  mailbox: 'Caixa de recados',
  pc: 'ELYSIUM fechou ou PC desligou',
};

function PushSection({ pairing }: { pairing: Pairing }) {
  const { palette, tokens } = useTheme();
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const availability = pushAvailability();

  const load = useCallback(async () => {
    try {
      setPrefs(await callRpc(pairing, 'push.getPrefs'));
    } catch {
      // PC fora do ar não deve impedir o resto dos Ajustes de aparecer.
      setPrefs(null);
    }
  }, [pairing]);

  useEffect(() => { load(); }, [load]);

  async function enable() {
    setBusy(true);
    try {
      const result = await registerForPush(pairing);
      if (result.status === 'denied') {
        Alert.alert(
          'Permissão negada',
          'Libere as notificações do ELYSIUM-M nas configurações do Android para receber lembretes.'
        );
      } else if (result.status === 'unsupported') {
        Alert.alert('Não disponível', result.reason);
      } else {
        Alert.alert('Pronto', 'Este aparelho vai receber notificações do PC.');
        await load();
      }
    } catch (err) {
      Alert.alert('Falha ao registrar', errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(category: PushCategory) {
    if (!prefs) return;
    const muted = prefs.muted.includes(category)
      ? prefs.muted.filter(c => c !== category)
      : [...prefs.muted, category];
    try {
      setPrefs(await callRpc(pairing, 'push.setPrefs', { muted }));
    } catch (err) {
      Alert.alert('Falha ao salvar', errMessage(err));
    }
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="subheading">Notificações</Text>
      <Text variant="caption" color={palette.textMuted}>
        Chegam pela nuvem da Expo, então funcionam mesmo fora da sua rede.
      </Text>

      <Card glass style={{ gap: tokens.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <Feather name="bell" size={18} color={palette.primary} />
          <Text variant="body" style={{ flex: 1 }}>
            {prefs ? `${prefs.deviceCount} aparelho(s) registrado(s)` : 'PC indisponível'}
          </Text>
          {busy && <ActivityIndicator size="small" color={palette.primary} />}
        </View>

        {availability.available ? (
          <Button title="Registrar este aparelho" variant="secondary" onPress={enable} loading={busy} />
        ) : (
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'flex-start' }}>
            <Feather name="info" size={16} color={palette.textMuted} style={{ marginTop: 2 }} />
            <Text variant="caption" color={palette.textMuted} style={{ flex: 1 }}>
              {availability.reason}
            </Text>
          </View>
        )}

        {prefs && (Object.keys(CATEGORY_LABEL) as PushCategory[]).map(category => {
          const on = !prefs.muted.includes(category);
          return (
            <Pressable
              key={category}
              onPress={() => toggleCategory(category)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}
            >
              <Feather
                name={on ? 'check-square' : 'square'}
                size={18}
                color={on ? palette.primary : palette.textMuted}
              />
              <Text variant="body" color={on ? palette.text : palette.textMuted}>
                {CATEGORY_LABEL[category]}
              </Text>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  hub: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  celula: { width: '48%' },
  azulejo: { gap: 6, paddingVertical: 14 },
  iconeAzulejo: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  linhaEndereco: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  familiaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 11, paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  schemeRow: { flexDirection: 'row', gap: 8 },
  schemeBtn: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pairedIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: '47%',
    padding: 14,
    gap: 8,
    alignItems: 'flex-start',
  },
  swatchDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
