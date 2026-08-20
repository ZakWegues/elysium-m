import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Pairing } from '../lib/pairing';
import { callRpc, PresetEntry } from '../lib/rpc';
import { errMessage } from '../lib/errors';
import { animarProximoLayout } from '../lib/motion';
import { useTheme } from '../theme';
import { Text } from '../components/ui';

/**
 * Presets, agora pelo RPC.
 *
 * A TELA ANTIGA NÃO CHAMAVA RPC NENHUM. Ela montava a frase "executa o preset X" e mandava
 * para o LLM em /api/command — porque, apesar de o `presetsStore` existir no desktop desde
 * o começo, **não havia métodos `presets.*` na superfície RPC**. Dos 52 métodos, zero eram
 * de preset.
 *
 * Com `presets.list/run/save/delete` no lugar, isto virou instantâneo e determinístico:
 * rodar um preset é uma chamada com um nome, não uma frase que o modelo precisa
 * interpretar certo. Mesmo argumento que criou o RPC na §9 do handoff.
 *
 * De quebra dá para CRIAR a partir do que está aberto agora, cruzando `apps.list` (o
 * catálogo de programas conhecidos) com `system.processes` (o que está rodando).
 */
export default function PresetsPopover({
  pairing,
  onFechar,
}: {
  pairing: Pairing;
  onFechar: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [presets, setPresets] = useState<PresetEntry[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try { setPresets((await callRpc(pairing, 'presets.list')).presets); }
    catch { setPresets([]); }
  }, [pairing]);

  useEffect(() => { carregar(); }, [carregar]);

  async function rodar(nome: string) {
    setOcupado(true);
    try {
      const r = await callRpc(pairing, 'presets.run', { name: nome });
      onFechar();
      Alert.alert('ELYSIUM-M', r.reply);
    } catch (e) { Alert.alert('Preset', errMessage(e)); }
    finally { setOcupado(false); }
  }

  async function apagar(nome: string) {
    try {
      await callRpc(pairing, 'presets.delete', { name: nome });
      animarProximoLayout();
      await carregar();
    } catch (e) { Alert.alert('Preset', errMessage(e)); }
  }

  if (criando) {
    return <CriarPreset pairing={pairing} onPronto={async () => { setCriando(false); await carregar(); }} onCancelar={() => setCriando(false)} />;
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="label" color={palette.textMuted}>Presets</Text>

      {presets === null && <ActivityIndicator color={palette.primary} />}
      {presets?.length === 0 && (
        <Text variant="caption" color={palette.textMuted}>Nenhum preset ainda.</Text>
      )}

      {presets?.map(p => (
        <View key={p.name} style={styles.linha}>
          <Pressable
            onPress={() => rodar(p.name)}
            disabled={ocupado}
            style={[styles.rodar, { borderRadius: tokens.radii.md, backgroundColor: palette.primarySoft, opacity: ocupado ? 0.5 : 1 }]}
          >
            <Feather name={(p.icon as keyof typeof Feather.glyphMap) ?? 'sliders'} size={14} color={palette.primary} />
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{p.description || p.name}</Text>
            <Text variant="caption" color={palette.textMuted}>
              {p.actions} {p.actions === 1 ? 'ação' : 'ações'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('Apagar preset', `Apagar "${p.name}"?`, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Apagar', style: 'destructive', onPress: () => apagar(p.name) },
            ])}
            hitSlop={6}
            style={styles.apagar}
          >
            <Feather name="x" size={15} color={palette.textMuted} />
          </Pressable>
        </View>
      ))}

      <Pressable
        onPress={() => { animarProximoLayout(); setCriando(true); }}
        style={[styles.novo, { borderRadius: tokens.radii.md, borderColor: palette.glassBorder }]}
      >
        <Feather name="plus" size={14} color={palette.primary} />
        <Text variant="caption" color={palette.primary}>Criar com o que está aberto</Text>
      </Pressable>
    </View>
  );
}

function CriarPreset({
  pairing, onPronto, onCancelar,
}: {
  pairing: Pairing;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const { palette, tokens } = useTheme();
  const [nome, setNome] = useState('');
  const [abertos, setAbertos] = useState<string[] | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [ra, rp] = await Promise.all([
          callRpc(pairing, 'apps.list'),
          callRpc(pairing, 'system.processes'),
        ]);
        // `apps.list` é o catálogo do que o ELYSIUM sabe abrir; `system.processes` é o que
        // está rodando, com nome de executável. Só o cruzamento dá uma lista que faz
        // sentido oferecer — senão o preset nasceria com uma ação que falha.
        const normalizar = (x: string) => x.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
        const rodando = new Set(rp.processes.filter(p => !p.isSystem).map(p => normalizar(p.name)));
        const lista = ra.apps.map(a => a.key).filter(k => rodando.has(normalizar(k)));
        setAbertos(lista);
        setMarcados(lista);
      } catch { setAbertos([]); }
    })();
  }, [pairing]);

  async function salvar() {
    if (!nome.trim()) { Alert.alert('Preset', 'Dê um nome ao preset.'); return; }
    if (!marcados.length) { Alert.alert('Preset', 'Escolha ao menos um programa.'); return; }
    try {
      await callRpc(pairing, 'presets.save', {
        name: nome.trim(),
        description: nome.trim(),
        icon: 'sliders',
        actions: marcados.map(app => ({ action: 'open_app', app_name: app })),
      });
      onPronto();
    } catch (e) { Alert.alert('Preset', errMessage(e)); }
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="label" color={palette.textMuted}>Novo preset</Text>
      <TextInput
        value={nome}
        onChangeText={setNome}
        placeholder="Nome do preset"
        placeholderTextColor={palette.textMuted}
        style={[styles.campo, { color: palette.text, borderColor: palette.glassBorder, borderRadius: tokens.radii.md }]}
      />

      {abertos === null && <ActivityIndicator color={palette.primary} />}
      {abertos?.length === 0 && (
        <Text variant="caption" color={palette.textMuted}>Não reconheci nenhum programa aberto.</Text>
      )}
      {abertos?.map(app => {
        const on = marcados.includes(app);
        return (
          <Pressable
            key={app}
            onPress={() => setMarcados(on ? marcados.filter(x => x !== app) : [...marcados, app])}
            style={styles.check}
          >
            <Feather name={on ? 'check-square' : 'square'} size={15} color={on ? palette.primary : palette.textMuted} />
            <Text variant="body">{app}</Text>
          </Pressable>
        );
      })}

      <View style={styles.acoes}>
        <Pressable onPress={onCancelar} style={[styles.botao, { borderRadius: tokens.radii.md, borderColor: palette.glassBorder }]}>
          <Text variant="caption" color={palette.textMuted}>Cancelar</Text>
        </Pressable>
        <Pressable onPress={salvar} style={[styles.botao, { borderRadius: tokens.radii.md, borderColor: palette.glassBorder, backgroundColor: palette.primarySoft }]}>
          <Text variant="caption" color={palette.primary}>Salvar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rodar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 11 },
  apagar: { paddingHorizontal: 6, paddingVertical: 8 },
  novo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', marginTop: 4 },
  campo: { paddingVertical: 9, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 13 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  acoes: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  botao: { paddingVertical: 8, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth },
});
