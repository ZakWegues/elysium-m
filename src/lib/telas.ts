/**
 * Telas inteligentes no celular (Fase 4, 22/10) — a parte pura.
 *
 * O PC manda a tela num frame `{type:"ui", id}` DEPOIS do reply (o id é o do pedido, e é por ele
 * que a tela acha a bolha): `estado:"gerando"` (esqueleto), depois `programa` (OpenUI Lang) ou
 * `falhou`. A tela roda no renderer isolado (assets/ui/render.html) numa WebView; tudo que ela
 * manda passa por `mensagemDaTela` — o espelho do protocolo.ts do ui-render e do telas.js do PC.
 */

import type { Palette } from '../theme/palettes';

export type FrameUi = { id: string; gerando?: true; programa?: string; texto?: string; falhou?: true; cancelada?: true; pergunta?: string; resposta?: string; internet?: boolean };

/**
 * A tela guardada na mensagem (vai para o histórico): programa e o que foi digitado nela; ou, se
 * a geração falhou, o pedido para o "Tentar de novo".
 */
export type TelaDaMensagem = { gerando?: true; desde?: number; programa?: string; estado?: Record<string, unknown>; internet?: boolean; falhou?: { pergunta: string; resposta: string } };

const MAX_PROGRAMA = 200_000;

/** Lê o frame `ui` do PC; null se vier fora do formato. Pura. */
export function lerUi(d: unknown): FrameUi | null {
  if (!d || typeof d !== 'object') return null;
  const x = d as Record<string, unknown>;
  if (x.type !== 'ui' || typeof x.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(x.id)) return null;
  const texto = typeof x.texto === 'string' && x.texto.trim() ? x.texto.slice(0, 500) : undefined;
  const internet = typeof x.internet === 'boolean' ? x.internet : undefined;
  const base = { id: x.id, ...(texto ? { texto } : {}), ...(internet === undefined ? {} : { internet }) };
  if (typeof x.programa === 'string' && x.programa.trim() && x.programa.length <= MAX_PROGRAMA) return { ...base, programa: x.programa };
  if (x.falhou === true) {
    if (x.cancelada === true) return { ...base, falhou: true, cancelada: true };
    const pergunta = typeof x.pergunta === 'string' ? x.pergunta.slice(0, 2000) : undefined;
    const resposta = typeof x.resposta === 'string' ? x.resposta.slice(0, 6000) : undefined;
    return { ...base, falhou: true, ...(pergunta !== undefined ? { pergunta } : {}), ...(resposta !== undefined ? { resposta } : {}) };
  }
  if (x.estado === 'gerando') return { ...base, gerando: true };
  return null;
}

/**
 * Aplica o frame na tela da mensagem: o que fica guardado. `null` = sem tela (cancelada, ou
 * falhou sem como tentar de novo). Falhou com o pedido: fica a faixa "Tentar de novo". Pura.
 */
export function telaDoFrame(f: FrameUi, agora = Date.now()): TelaDaMensagem | null {
  if (f.programa) return { programa: f.programa, ...(f.internet === undefined ? {} : { internet: f.internet }) };
  if (f.gerando) return { gerando: true, desde: agora };
  if (f.falhou && !f.cancelada && f.pergunta !== undefined && f.resposta !== undefined) return { falhou: { pergunta: f.pergunta, resposta: f.resposta } };
  return null;
}

export type MensagemDaTela =
  | { tipo: 'pronta' }
  | { tipo: 'altura'; px: number }
  | { tipo: 'acao'; acao: 'perguntar' | 'abrirLink' | 'copiar'; valor: string }
  | { tipo: 'estado'; vars: Record<string, unknown> }
  | { tipo: 'pedido'; id: number; rota: 'fotos' | 'rota'; params: Record<string, string> }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'rolar'; dy: number };

const ehTexto = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Valida o que veio da WebView (texto JSON). Tudo fora do formato é ignorado. Pura. */
export function mensagemDaTela(bruto: unknown): MensagemDaTela | null {
  let m: unknown = bruto;
  if (typeof bruto === 'string') {
    if (bruto.length > 120_000) return null;
    try { m = JSON.parse(bruto); } catch { return null; }
  }
  if (!m || typeof m !== 'object') return null;
  const x = m as Record<string, unknown>;
  switch (x.tipo) {
    case 'pronta': return { tipo: 'pronta' };
    case 'altura': return Number.isInteger(x.px) && (x.px as number) >= 0 && (x.px as number) <= 20000 ? { tipo: 'altura', px: x.px as number } : null;
    case 'acao':
      return (x.acao === 'perguntar' || x.acao === 'abrirLink' || x.acao === 'copiar') && ehTexto(x.valor, 4000) ? { tipo: 'acao', acao: x.acao, valor: x.valor } : null;
    case 'estado': {
      if (!x.vars || typeof x.vars !== 'object' || Array.isArray(x.vars)) return null;
      const json = JSON.stringify(x.vars);
      return json.length <= 50_000 ? { tipo: 'estado', vars: JSON.parse(json) as Record<string, unknown> } : null;
    }
    case 'pedido': {
      if (!Number.isInteger(x.id) || (x.id as number) < 1 || (x.rota !== 'fotos' && x.rota !== 'rota') || !x.params || typeof x.params !== 'object') return null;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(x.params as Record<string, unknown>).slice(0, 5)) {
        if (!ehTexto(k, 30) || !ehTexto(v, 300)) return null;
        params[k] = v;
      }
      return { tipo: 'pedido', id: x.id as number, rota: x.rota, params };
    }
    case 'erro': return ehTexto(x.mensagem, 1000) ? { tipo: 'erro', mensagem: x.mensagem } : null;
    case 'rolar': return typeof x.dy === 'number' && Number.isFinite(x.dy) && Math.abs(x.dy) <= 2000 ? { tipo: 'rolar', dy: x.dy } : null;
    default: return null;
  }
}

/** Só https, sem usuário/senha na URL. Pura. */
export function linkSeguro(valor: string): string | null {
  try {
    const u = new URL(valor);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function canais(cor: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(cor.trim());
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const rgb = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(cor);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** 0 (preto) a 1 (branco); cor desconhecida conta como escura. Pura. */
export function luminancia(cor: string): number {
  const c = canais(cor);
  return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : 0;
}

/** Cor CSS que o protocolo aceita (sem `;{}<>` nem `url(`); senão a reserva. Pura. */
function cor(v: string | undefined, reserva: string): string {
  return typeof v === 'string' && v.length <= 80 && /^[#a-zA-Z0-9(),.\s%-]+$/.test(v) && !/url\s*\(/i.test(v) ? v : reserva;
}

/** O tema da tela a partir da paleta do app: as mesmas cores da bolha. Pura. */
export function temaDaPaleta(p: Pick<Palette, 'background' | 'surface' | 'text' | 'textMuted' | 'primary'>, reduzirMovimento = false) {
  const escuro = luminancia(p.background) < 0.5;
  const destaque = cor(p.primary, '#8b7cf6');
  return {
    esquema: escuro ? 'escuro' : 'claro',
    vars: {
      '--iui-canvas': cor(p.surface, escuro ? '#131726' : '#ffffff'),
      '--iui-ink': cor(p.text, escuro ? '#eef1f6' : '#14161a'),
      '--iui-muted': cor(p.textMuted, escuro ? '#9aa4b5' : '#5b6574'),
      '--iui-faint': cor(p.textMuted, escuro ? '#9aa4b5' : '#5b6574'),
      '--iui-on-ink': cor(p.background, escuro ? '#0a0c14' : '#ffffff'),
      '--iui-accent': destaque,
      '--iui-on-accent': luminancia(destaque) > 0.5 ? '#111118' : '#ffffff',
    },
    reduzirMovimento,
  } as const;
}

/** O que a WebView recebe: chama a ponte do renderer (window.__elyHost). Pura. */
export function scriptParaTela(m: unknown): string {
  // JSON dentro de JS: `</script>` e U+2028/2029 escapados para não quebrar a injeção.
  const perigosos = new RegExp(`[<${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
  const json = JSON.stringify(m).replace(perigosos, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `window.__elyHost && window.__elyHost(${json}); true;`;
}

type ComTela = { pedidoId?: string; text: string; tela?: TelaDaMensagem };

/** O frame `ui` na mensagem do pedido: tela nova, texto novo da bolha, ou tira a tela (falhou). Pura. */
export function aplicarUi<M extends ComTela>(msgs: M[], f: FrameUi): M[] {
  let i = -1;
  for (let k = msgs.length - 1; k >= 0; k--) if (msgs[k].pedidoId === f.id) { i = k; break; }
  if (i < 0) return msgs;
  const tela = telaDoFrame(f);
  const { tela: _velha, ...resto } = msgs[i];
  const nova = { ...resto, ...(f.texto ? { text: f.texto } : {}), ...(tela ? { tela } : {}) } as M;
  return [...msgs.slice(0, i), nova, ...msgs.slice(i + 1)];
}

/** Tela "gerando" esquecida (o app fechou no meio): depois de 3 min não mostra mais o esqueleto. Pura. */
export function telaVisivel(tela: TelaDaMensagem | undefined, ts: number, agora = Date.now()): boolean {
  if (!tela) return false;
  if (tela.programa || tela.falhou) return true;
  return tela.gerando === true && agora - (tela.desde ?? ts) < 3 * 60_000;
}

// ── Guarda contra o crash da WebView (23/10, depois do "tela cinza" no aparelho) ───────────────

/** Uma tela que estava sendo montada (a WebView subindo). Vai para o disco antes de montar. */
export type MarcaTela = { em: number; tamanho: number };

/** Abertura que morreu há menos que isto, com tela montando, conta como crash da tela. */
export const JANELA_DO_CRASH_MS = 10 * 60_000;

/**
 * A abertura anterior morreu montando uma tela? Lê o que ficou no disco (marcas por id) e
 * devolve a mais recente dentro da janela, ou null. Pura.
 */
export function marcaDoCrash(guardado: unknown, agora = Date.now()): MarcaTela | null {
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return null;
  let melhor: MarcaTela | null = null;
  for (const v of Object.values(guardado as Record<string, unknown>)) {
    const m = v as Partial<MarcaTela> | null;
    if (!m || typeof m.em !== 'number' || !Number.isFinite(m.em)) continue;
    const idade = agora - m.em;
    if (idade < 0 || idade > JANELA_DO_CRASH_MS) continue;
    if (!melhor || m.em > melhor.em) melhor = { em: m.em, tamanho: typeof m.tamanho === 'number' ? m.tamanho : 0 };
  }
  return melhor;
}

/** A linha que vai para o log do PC (`diag.registrar`): sem conteúdo da tela, só o contexto. Pura. */
export function linhaDoCrash(m: MarcaTela, aparelho: { modelo?: string | null; android?: string | number | null }, agora = Date.now()): string {
  const seg = Math.max(0, Math.round((agora - m.em) / 1000));
  return `tela inteligente: o app fechou montando uma tela (programa de ${m.tamanho} caracteres; reaberto ${seg} s depois; aparelho ${aparelho.modelo ?? '?'}, Android ${aparelho.android ?? '?'}). Telas desligadas até religar em Ajustes.`;
}
