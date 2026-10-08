import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc } from '../lib/rpc';
import { listSessions } from '../lib/chatHistoryStore';
import { loadCache as lerCaixaLocal } from '../lib/mailboxStore';
import { confirmDestructive } from '../lib/confirm';
import { errMessage } from '../lib/errors';
import { haptica } from '../lib/haptica';
import { ordenarPorConsulta } from '../lib/busca';
import { useTheme } from '../theme';
import { GlassModal, Text, Toque } from '../components/ui';

/**
 * A busca do celular — o mesmo índice do Ctrl+K do desktop (bloco 58), na lupa da Início.
 *
 * Num telefone, digitar um comando inteiro é lento e a voz nem sempre cabe. Três letras
 * numa lupa que já sabe o que o PC pode fazer é o caminho mais curto até "abre o VS Code"
 * ou "cancela o lembrete da reunião". Nada aqui passa pelo modelo: cada item executa por
 * RPC ou navega. O último item, "Perguntar ao ELYSIUM", é o que sobra quando nada casa.
 */

type Grupo = 'nav' | 'acao' | 'preset' | 'app' | 'lembrete' | 'memoria' | 'conversa' | 'recado' | 'chat';

type Item = {
  grupo: Grupo;
  icone: keyof typeof Feather.glyphMap;
  texto: string;
  sub?: string;
  perigo?: boolean;
  /** Outros nomes pelos quais o item pode ser achado (apelidos do `apps.json`). */
  chaves?: string[];
  executar: () => void | Promise<void>;
};

const ROTULO: Record<Grupo, string> = {
  nav: 'Ir para', acao: 'Ações', preset: 'Presets', app: 'Abrir programa',
  lembrete: 'Lembretes', memoria: 'Memória', conversa: 'Conversas', recado: 'Recados da Caixa', chat: 'Perguntar',
};
const ORDEM: Grupo[] = ['nav', 'acao', 'preset', 'app', 'lembrete', 'memoria', 'conversa', 'recado', 'chat'];

// A pontuação mora em lib/busca.ts (bloco 77) — a mesma da paleta do desktop, testada.


export default function BuscaPanel({
  pairing, visible, onClose, onNavigate, onOpenConversation, onPerguntar, onAbrirPlayer, onAbrirCaixa,
}: {
  pairing: Pairing;
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: 'chat' | 'control' | 'rotinas') => void;
  onOpenConversation: (id: string) => void;
  /** Manda o texto para o chat da IA, como se tivesse sido digitado lá. */
  onPerguntar: (texto: string) => void;
  onAbrirPlayer: () => void;
  /** Abre o chat no lado "PC" (a Caixa) — é para onde leva um recado achado na busca. */
  onAbrirCaixa?: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [consulta, setConsulta] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);

  const toast = (msg: string) => Alert.alert('ELYSIUM-M', msg);
  const rpc = (metodo: Parameters<typeof callRpc>[1], params?: Record<string, unknown>, ok?: string, confirmado = false) =>
    async () => {
      try {
        const r = await callRpc(pairing, metodo as never, (params ?? {}) as never, { confirmed: confirmado });
        haptica.sucesso();
        const msg = (r as { message?: string })?.message ?? ok;
        if (msg) toast(msg);
      } catch (err) { haptica.erro(); toast(errMessage(err)); }
    };
  const destrutivo = (titulo: string, aviso: string, metodo: Parameters<typeof callRpc>[1], params: Record<string, unknown>) =>
    async () => {
      haptica.aviso();
      const ok = await confirmDestructive(titulo, aviso);
      if (ok !== 'confirmed') return;
      await rpc(metodo, params, undefined, true)();
    };

  // Monta ao abrir, não na montagem: os dados mudam entre uma abertura e outra, e uma
  // busca que mostra o lembrete já cancelado seria pior que uma que demora meio segundo.
  useEffect(() => {
    if (!visible) return;
    setConsulta('');
    let vivo = true;
    (async () => {
      setCarregando(true);
      const base: Item[] = [
        { grupo: 'nav', icone: 'message-circle', texto: 'Chat com a IA', executar: () => onNavigate('chat') },
        { grupo: 'nav', icone: 'monitor', texto: 'Controle do PC', executar: () => onNavigate('control') },
        { grupo: 'nav', icone: 'calendar', texto: 'Rotinas e lembretes', chaves: ['automações', 'agendar'], executar: () => onNavigate('rotinas') },
        { grupo: 'nav', icone: 'music', texto: 'Player do Spotify', executar: onAbrirPlayer },
        { grupo: 'acao', icone: 'camera', texto: 'Tirar print no PC', sub: 'PNG na Área de Trabalho', chaves: ['screenshot', 'captura de tela'], executar: rpc('screen.screenshot') },
        { grupo: 'acao', icone: 'lock', texto: 'Bloquear a tela', chaves: ['lock', 'travar'], executar: destrutivo('Bloquear o PC?', 'A tela do PC será bloqueada.', 'power.control', { operation: 'lock' }) },
        { grupo: 'acao', icone: 'moon', texto: 'Suspender o PC', executar: destrutivo('Suspender o PC?', 'O PC vai suspender.', 'power.control', { operation: 'sleep' }) },
        { grupo: 'acao', icone: 'rotate-cw', texto: 'Reiniciar o PC', perigo: true, executar: destrutivo('Reiniciar o PC?', 'O PC reinicia em 30 segundos. Trabalho não salvo se perde.', 'power.control', { operation: 'restart' }) },
        { grupo: 'acao', icone: 'power', texto: 'Desligar o PC', perigo: true, executar: destrutivo('Desligar o PC?', 'O PC desliga em 30 segundos. Trabalho não salvo se perde.', 'power.control', { operation: 'shutdown' }) },
        { grupo: 'acao', icone: 'x-circle', texto: 'Cancelar desligamento agendado', executar: destrutivo('Cancelar?', 'O desligamento agendado será abortado.', 'power.control', { operation: 'cancel' }) },
        { grupo: 'acao', icone: 'volume-x', texto: 'Mudo', chaves: ['volume mudo', 'silenciar', 'mute'], executar: rpc('volume.set', { level: 'mute' }, 'Mudo.') },
        { grupo: 'acao', icone: 'volume-2', texto: 'Aumentar o volume', executar: rpc('volume.set', { level: 'up' }, 'Volume +') },
        { grupo: 'acao', icone: 'volume-1', texto: 'Diminuir o volume', executar: rpc('volume.set', { level: 'down' }, 'Volume −') },
        { grupo: 'acao', icone: 'play', texto: 'Tocar / pausar', executar: rpc('media.control', { operation: 'play' }) },
        { grupo: 'acao', icone: 'skip-forward', texto: 'Próxima faixa', executar: rpc('media.control', { operation: 'skip' }) },
      ];
      const lista: Item[] = [...base];
      const fontes = [
        async () => {
          const r = await callRpc(pairing, 'apps.list');
          const porComando = new Map<string, string[]>();
          for (const a of r.apps) {
            if (!porComando.has(a.command)) porComando.set(a.command, []);
            porComando.get(a.command)!.push(a.key);
          }
          for (const apelidos of porComando.values()) {
            const nome = apelidos.slice().sort((x, y) => y.length - x.length)[0];
            lista.push({ grupo: 'app', icone: 'grid', texto: nome, chaves: apelidos, executar: rpc('apps.open', { name: nome }, `Abrindo ${nome}…`) });
          }
        },
        async () => {
          const r = await callRpc(pairing, 'presets.list');
          for (const p of r.presets) lista.push({ grupo: 'preset', icone: 'zap', texto: p.name, sub: p.description, executar: rpc('presets.run', { name: p.name }, `Rodando ${p.name}…`) });
        },
        async () => {
          const r = await callRpc(pairing, 'reminders.list');
          for (const l of r.reminders.filter(x => !x.firedAt)) {
            const hora = new Date(l.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            lista.push({ grupo: 'lembrete', icone: 'bell-off', texto: `Cancelar: ${l.text}`, sub: hora, executar: rpc('reminders.cancel', { id: l.id }, 'Lembrete cancelado.') });
          }
        },
        async () => {
          const r = await callRpc(pairing, 'memory.list');
          for (const f of r.facts) lista.push({ grupo: 'memoria', icone: 'bookmark', texto: `Esquecer: ${f.text}`, executar: rpc('memory.remove', { id: f.id }, 'Esquecido.', true) });
        },
        async () => {
          // Local, de propósito: quem busca uma conversa quer achar algo que já viu, e
          // isso tem que funcionar com o PC desligado.
          const sessoes = await listSessions();
          for (const s of sessoes.slice(0, 30)) lista.push({ grupo: 'conversa', icone: 'message-circle', texto: s.title || 'Conversa', sub: `${s.messages.length} msgs`, executar: () => onOpenConversation(s.id) });
        },
        async () => {
          // Recados da Caixa (bloco 92), também do cache local: o link que você mandou do
          // PC semana passada tem que ser achável com o PC desligado. Os 200 mais novos.
          const { messages } = await lerCaixaLocal();
          const recentes = [...messages].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
          for (const m of recentes) {
            const texto = (m.text ?? '').trim() || m.attachment?.name || '';
            if (!texto) continue;
            const quando = new Date(m.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            lista.push({
              grupo: 'recado', icone: m.attachment ? 'paperclip' : m.kind === 'link' ? 'link' : 'inbox',
              texto: texto.replace(/\s+/g, ' ').slice(0, 90),
              sub: `${m.from === 'pc' ? 'do PC' : 'do celular'} · ${quando}`,
              executar: () => onAbrirCaixa?.(),
            });
          }
        },
      ];
      await Promise.all(fontes.map(f => f().catch(() => {})));
      if (vivo) { setItens(lista); setCarregando(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pairing]);

  const visiveis = useMemo(() => {
    const q = consulta.trim();
    let lista = ordenarPorConsulta(itens, q, ORDEM);
    if (!q) lista = lista.filter(it => it.grupo === 'nav' || it.grupo === 'acao');
    else lista = lista.slice(0, 30);
    if (q.length >= 2) {
      lista.push({ grupo: 'chat', icone: 'cpu', texto: `Perguntar à Ely: “${q}”`, executar: () => onPerguntar(q) });
    }
    return lista;
  }, [consulta, itens]);

  async function executar(it: Item) {
    onClose();
    try { await it.executar(); } catch (err) { toast(errMessage(err)); }
  }

  let grupoAtual: Grupo | null = null;

  return (
    <GlassModal visible={visible} onClose={onClose}>
      <View style={[styles.campo, { borderRadius: tokens.radii.md, borderColor: palette.glassBorder, backgroundColor: palette.glassSurface }]}>
        <Feather name="search" size={17} color={palette.textMuted} />
        <TextInput
          value={consulta}
          onChangeText={setConsulta}
          placeholder="Abrir, rodar, lembrar, perguntar…"
          placeholderTextColor={palette.textMuted}
          autoFocus
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => { const primeiro = visiveis[0]; if (primeiro) executar(primeiro); }}
          style={{ flex: 1, color: palette.text, fontSize: tokens.fontSize.base, paddingVertical: 0 }}
        />
        {carregando && <ActivityIndicator size="small" color={palette.primary} />}
        {!!consulta && (
          <Pressable onPress={() => setConsulta('')} hitSlop={8}>
            <Feather name="x" size={16} color={palette.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={{ marginTop: tokens.spacing.sm }}>
        {visiveis.length === 0 && (
          <Text variant="caption" color={palette.textMuted} style={{ textAlign: 'center', paddingVertical: tokens.spacing.xl }}>
            Nada com esse nome. Continue escrevendo para perguntar à Ely.
          </Text>
        )}
        {visiveis.map((it, i) => {
          const cabecalho = it.grupo !== grupoAtual;
          grupoAtual = it.grupo;
          return (
            <View key={`${it.grupo}-${it.texto}-${i}`}>
              {cabecalho && (
                <Text variant="caption" color={palette.textMuted} style={styles.grupo}>{ROTULO[it.grupo]}</Text>
              )}
              <Toque onPress={() => executar(it)} haptico="leve">
                <View style={[styles.item, { borderRadius: tokens.radii.md }]}>
                  <View style={[styles.iconeItem, { backgroundColor: it.perigo ? palette.errorSoft : palette.primarySoft, borderRadius: tokens.radii.sm }]}>
                    <Feather name={it.icone} size={16} color={it.perigo ? palette.error : palette.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1} color={it.perigo ? palette.error : palette.text}>{it.texto}</Text>
                    {it.sub ? <Text variant="caption" color={palette.textMuted} numberOfLines={1}>{it.sub}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={16} color={palette.textMuted} />
                </View>
              </Toque>
            </View>
          );
        })}
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  campo: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  grupo: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6 },
  iconeItem: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
