import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import type { Pairing } from './pairing';
import { callRpc } from './rpc';
import { openTelemetryStream, type TelemetryFrame, type TelemetryStatus } from './telemetry';

/**
 * O Modo Mesa (25/11): o celular apoiado ao lado do PC vira a central de controle dele. O que toca e o
 * volume chegam ao vivo pelo WebSocket (`{type:"mesa"}`, só quando mudam); CPU e RAM pela telemetria.
 */

export type MidiaMesa = {
  app: string; nomeApp: string; titulo: string; artista: string; album: string;
  tocando: boolean; pos: number; posEm: number; dur: number;
  podeVoltar: boolean; podeAvancar: boolean; podePular?: boolean; capa: string; capaUrl: string; cor: string;
};
export type SomMesa = { volume: number; mudo: boolean; micMudo: boolean | null };
export type EstadoMesa = { midia: MidiaMesa | null; som: SomMesa };

export type TipoAtalho = 'acao' | 'app' | 'preset' | 'rotina' | 'teclas' | 'link';
export type Atalho = { id: string; tipo: TipoAtalho; rotulo: string; icone: string; valor: string };
export const ACOES: { valor: string; rotulo: string; icone: string }[] = [
  { valor: 'bloquear', rotulo: 'Bloquear', icone: 'lock' },
  { valor: 'microfone', rotulo: 'Microfone', icone: 'mic-off' },
  { valor: 'print', rotulo: 'Print', icone: 'camera' },
  { valor: 'area', rotulo: 'Área de trabalho', icone: 'monitor' },
  { valor: 'youtube', rotulo: 'YouTube', icone: 'youtube' },
  { valor: 'foco', rotulo: 'Foco 25 min', icone: 'target' },
  { valor: 'timer', rotulo: 'Timer 5 min', icone: 'clock' },
  { valor: 'copiar', rotulo: 'Copiar do PC', icone: 'download' },
  { valor: 'colar', rotulo: 'Colar no PC', icone: 'upload' },
  { valor: 'janelas', rotulo: 'Janelas', icone: 'layers' },
];
/** Os ícones que dá para escolher num atalho (Feather). */
export const ICONES = ['zap', 'copy', 'clipboard', 'rotate-ccw', 'layers', 'maximize', 'activity', 'target', 'clock', 'globe', 'terminal', 'code', 'music', 'film', 'youtube', 'message-circle', 'mail', 'folder', 'chrome', 'command', 'monitor', 'moon', 'sun', 'coffee', 'book', 'shopping-cart', 'star', 'heart', 'camera', 'mic', 'headphones', 'lock'] as const;

/** Onde a música está agora (segundos), andando o relógio enquanto toca. Pura. */
export function posicaoAgora(m: Pick<MidiaMesa, 'pos' | 'posEm' | 'dur' | 'tocando'>, agora = Date.now()): number {
  const andou = m.tocando && m.posEm > 0 ? Math.max(0, (agora - m.posEm) / 1000) : 0;
  return m.dur > 0 ? Math.min(m.dur, m.pos + andou) : m.pos + andou;
}

/** 3:07 / 1:02:09. Pura. */
export function tempo(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), seg = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}` : `${m}:${String(seg).padStart(2, '0')}`;
}

/** Se divide em duas metades, pelo tamanho da tela. A grade é sempre 4 × 4 (quatro grupos). Pura. */
export function layoutDaMesa(largura: number, altura: number): { deitado: boolean; colunas: number } {
  return { deitado: largura > altura, colunas: 4 };
}

export const POR_PAGINA = 16;

/**
 * O tamanho das teclas para a página de 4 × 4 caber inteira no espaço (sem rolar). Em pé a altura é
 * livre (`altura` 0): a tecla fica quase quadrada, no máximo 84. Pura.
 */
export function teclaQueCabe(largura: number, altura: number, gap: number): { lado: number; alto: number } {
  const lado = Math.max(0, Math.floor((largura - gap * 3) / 4));
  const alto = altura > 0 ? Math.max(44, Math.floor((altura - gap * 3) / 4)) : Math.min(84, Math.round(lado * 0.86));
  return { lado, alto };
}

/** Navegador tocando (YouTube etc.): aí entram os ±10 s e a tela cheia. Pura. */
export function ehNavegador(app: string | undefined): boolean {
  return /chrome|msedge|edge|brave|firefox|opera|vivaldi/i.test(app ?? '');
}

/** A cor da capa vira o destaque, se der para ler o botão nela; escura demais, fica a do tema. Pura. */
export function acentoDaCapa(cor: string | undefined, padrao: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(cor ?? '');
  if (!m) return padrao;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 70 ? padrao : cor!;
}

/** Matiz (0–360) de um #rrggbb. Pura. */
export function matiz(cor: string): number {
  const n = parseInt(cor.slice(1, 7), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const distancia = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * As quatro cores das fileiras da grade (26/11): a primeira é o acento; as outras, a do tema e
 * depois as da lista, pulando a que ficar perto demais (< 60°) de uma já escolhida — no Glass
 * Âmbar o detalhe do tema é o mesmo âmbar fixo que a 4ª fileira usava, e as duas repetiam. Pura.
 */
export function coresDosGrupos(acento: string, detalhe: string): string[] {
  const candidatas = [detalhe, '#4ade80', '#5fb4ff', '#b58cff', '#ff7a9a', '#f2c14e', '#3fe0c8'];
  const escolhidas = [acento];
  while (escolhidas.length < 4) {
    const longe = (c: string) => Math.min(...escolhidas.map((e) => distancia(matiz(e), matiz(c))));
    const livres = candidatas.filter((c) => !escolhidas.includes(c));
    escolhidas.push(livres.find((c) => longe(c) >= 60) ?? livres.reduce((m, c) => (longe(c) > longe(m) ? c : m)));
  }
  return escolhidas;
}

/** Nome curto da saída: "SAMSUNG (NVIDIA High Definition Audio)" → "SAMSUNG". Pura. */
export function nomeCurto(nome: string): string {
  return nome.replace(/\s*\(.*\)\s*$/, '').trim() || nome;
}

/** Um atalho tipo "teclas" (ctrl+shift+esc) em lista de teclas. Pura. */
export function teclasDoAtalho(valor: string): string[] {
  return valor.split('+').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
}

/** Faz o atalho. Devolve a frase curta para o aviso, ou lança com o erro. */
export async function executarAtalho(p: Pairing, a: Atalho, som: SomMesa | null): Promise<string> {
  switch (a.tipo) {
    case 'app': await callRpc(p, 'apps.open', { name: a.valor }, { timeoutMs: 15000 }); return `Abrindo ${a.rotulo}`;
    case 'preset': await callRpc(p, 'presets.run', { name: a.valor }, { timeoutMs: 30000 }); return a.rotulo;
    case 'rotina': await callRpc(p, 'rotinas.run', { id: a.valor }, { timeoutMs: 30000 }); return a.rotulo;
    case 'teclas': await callRpc(p, 'input.combo', { keys: teclasDoAtalho(a.valor) }); return a.rotulo;
    case 'link': await callRpc(p, 'mesa.abrir', { url: a.valor }); return `Abrindo ${a.rotulo}`;
    case 'acao': break;
  }
  switch (a.valor) {
    // Bloquear é o que o widget já faz sem biometria: só tranca, não desliga nem apaga nada.
    case 'bloquear': await callRpc(p, 'power.control', { operation: 'lock' }, { confirmed: true, timeoutMs: 8000 }); return 'PC bloqueado';
    case 'microfone': {
      const mudo = !(som?.micMudo ?? false);
      await callRpc(p, 'microfone.mudo', { mudo });
      return mudo ? 'Microfone mudo' : 'Microfone ligado';
    }
    case 'print': return (await callRpc(p, 'screen.screenshot', {}, { timeoutMs: 20000 })).message || 'Print salvo';
    case 'area': await callRpc(p, 'input.combo', { keys: ['win', 'd'] }); return 'Área de trabalho';
    case 'youtube': await callRpc(p, 'mesa.abrir', { url: 'https://www.youtube.com' }); return 'Abrindo o YouTube';
    case 'foco': await callRpc(p, 'foco.start', { minutos: 25 }, { timeoutMs: 8000 }); return 'Foco de 25 min';
    case 'timer': await callRpc(p, 'timers.start', { minutos: 5 }, { timeoutMs: 8000 }); return 'Timer de 5 min';
    case 'copiar': {
      const { text } = await callRpc(p, 'clipboard.get');
      await Clipboard.setStringAsync(text ?? '');
      return text ? 'Copiado para o celular' : 'A área de transferência do PC está vazia';
    }
    case 'colar': {
      const texto = await Clipboard.getStringAsync();
      if (!texto) return 'Nada copiado no celular';
      await callRpc(p, 'clipboard.set', { text: texto.slice(0, 20000) });
      return 'Na área de transferência do PC';
    }
    default: return a.rotulo;
  }
}

export type AoVivo = { estado: EstadoMesa | null; telemetria: TelemetryFrame | null; status: TelemetryStatus };

/** Liga o ao vivo enquanto `ligado` (o modo aberto e o app na frente). */
export function useMesaAoVivo(pairing: Pairing, ligado: boolean): AoVivo & { atualizar: () => void } {
  const [estado, setEstado] = useState<EstadoMesa | null>(null);
  const [telemetria, setTelemetria] = useState<TelemetryFrame | null>(null);
  const [status, setStatus] = useState<TelemetryStatus>('connecting');
  const atualizar = useCallback(() => {
    callRpc(pairing, 'mesa.estado', {}, { timeoutMs: 10000 }).then((r) => { if (r.estado) setEstado(r.estado as EstadoMesa); }).catch(() => {});
  }, [pairing]);
  useEffect(() => {
    if (!ligado) return;
    atualizar();
    return openTelemetryStream(pairing, setTelemetria, setStatus, { mesa: (f) => setEstado({ midia: (f.midia ?? null) as MidiaMesa | null, som: f.som as SomMesa }) });
  }, [ligado, pairing.activeIp, pairing.port, pairing.token]); // eslint-disable-line react-hooks/exhaustive-deps
  return { estado, telemetria, status, atualizar };
}

/** Descanso: `ms` sem toque e a central escurece. `tocou()` acorda e conta de novo. */
export function useDescanso(ms: number, ligado: boolean): { descansando: boolean; tocou: () => void } {
  const [descansando, setDescansando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tocou = useCallback(() => {
    setDescansando(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDescansando(true), ms);
  }, [ms]);
  useEffect(() => {
    if (!ligado) { if (timer.current) clearTimeout(timer.current); setDescansando(false); return; }
    tocou();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [ligado, tocou]);
  return { descansando, tocou };
}

// ── "pôr no PC": os últimos pedidos ──────────────────────────────────────────

const CHAVE_RECENTES = 'elysium.mesa.recentes';
export async function lerRecentes(): Promise<string[]> {
  try { const v = JSON.parse((await AsyncStorage.getItem(CHAVE_RECENTES)) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : []; } catch { return []; }
}
export async function guardarRecente(texto: string): Promise<string[]> {
  const t = texto.trim();
  const lista = [t, ...(await lerRecentes()).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
  try { await AsyncStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista)); } catch { /* fica só nesta vez */ }
  return lista;
}
