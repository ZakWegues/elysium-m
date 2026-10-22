/**
 * A folha de compartilhar própria (22/10) — no lugar do `Alert` "Mandar para…" do Android.
 * Aqui só a parte pura (o que mostrar, que ações valem) e o store que a abre e fecha, no
 * mesmo padrão de ouvintes do `mailboxAviso.ts`. Quem faz o envio são os hooks do
 * `shareIntent.ts`; a folha só chama `aoEscolher` e mostra o resultado.
 */

export type ItemCompartilhado = { texto: string | null; arquivo: { uri: string; nome: string; mimeType: string; bytes: number } | null };
export type TipoDaPrevia = 'youtube' | 'link' | 'imagem' | 'arquivo' | 'texto';
export type Acao = 'ely' | 'pc';
/** "confirmar": veio do `elysium://share`, que qualquer site pode abrir — só PC, com aviso. */
export type ModoFolha = 'normal' | 'confirmar';

/** Até onde a Ely olha uma imagem (o modelo de visão). */
export const LIMITE_IMAGEM_ELY = 5 * 1024 * 1024;

/** O id do vídeo em `youtu.be/…`, `watch?v=…`, `shorts/…`, `embed/…`, `live/…`. Puro. */
export function idDoYoutube(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(texto);
  return m ? m[1] : null;
}

/** O primeiro link http(s) do texto. Puro. */
export function linkDoTexto(texto: string | null | undefined): string | null {
  const m = texto ? /https?:\/\/[^\s<>"']+/i.exec(texto) : null;
  return m ? m[0].replace(/[).,;!?]+$/, '') : null;
}

export function tipoDaPrevia(item: ItemCompartilhado): TipoDaPrevia {
  if (item.arquivo) return /^image\//i.test(item.arquivo.mimeType) ? 'imagem' : 'arquivo';
  if (idDoYoutube(item.texto)) return 'youtube';
  const t = (item.texto ?? '').trim();
  return linkDoTexto(t) === t ? 'link' : 'texto';
}

/** "youtube.com" + "/watch?v=…" encurtado — sem buscar a página. Puro. */
export function resumoDoLink(url: string): { dominio: string; caminho: string } {
  try {
    const u = new URL(url);
    const caminho = (u.pathname + u.search).replace(/\/$/, '');
    return { dominio: u.hostname.replace(/^www\./, ''), caminho: caminho.length > 48 ? `${caminho.slice(0, 47)}…` : caminho };
  } catch { return { dominio: url.slice(0, 40), caminho: '' }; }
}

/** As primeiras linhas de um texto, para a prévia. Puro. */
export function primeirasLinhas(texto: string, linhas = 4, max = 240): string {
  const t = texto.trim().split(/\r?\n/).filter(l => l.trim()).slice(0, linhas).join('\n');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Que ações valem para o que chegou. Texto/link: Ely e PC. Imagem: PC, e Ely só até 5 MB.
 * Outro arquivo: só PC. Modo "confirmar": só PC. Puro.
 */
export function acoesPara(item: ItemCompartilhado, modo: ModoFolha = 'normal'): { acoes: Acao[]; aviso: string | null } {
  if (modo === 'confirmar') return { acoes: ['pc'], aviso: 'Um app ou site pediu para mandar isto ao PC. Só confirme se foi você.' };
  if (!item.arquivo) return { acoes: ['ely', 'pc'], aviso: null };
  if (/^image\//i.test(item.arquivo.mimeType)) {
    const grande = item.arquivo.bytes > LIMITE_IMAGEM_ELY;
    return { acoes: grande ? ['pc'] : ['ely', 'pc'], aviso: grande ? 'A Ely olha imagens de até 5 MB; esta vai só para o PC.' : null };
  }
  return { acoes: ['pc'], aviso: null };
}

// ── store ─────────────────────────────────────────────────────────────────────────────

export type ResultadoEnvio = { ok: true; mensagem?: string } | { ok: false; erro: string };
export type PedidoFolha = {
  item: ItemCompartilhado;
  modo: ModoFolha;
  /** Faz o envio. `pergunta` = o "o que você quer saber?" da Ely. `progresso` de 0 a 1. */
  aoEscolher: (acao: Acao, extras: { pergunta: string; progresso: (f: number) => void; signal: AbortSignal }) => Promise<ResultadoEnvio>;
};

type Ouvinte = (p: PedidoFolha | null) => void;
const ouvintes = new Set<Ouvinte>();
let atual: PedidoFolha | null = null;

export function abrirFolha(p: PedidoFolha): void {
  atual = p;
  for (const o of ouvintes) { try { o(p); } catch { /* tela fechando */ } }
}

export function fecharFolha(): void {
  atual = null;
  for (const o of ouvintes) { try { o(null); } catch { /* tela fechando */ } }
}

export function folhaAtual(): PedidoFolha | null { return atual; }

export function aoMudarFolha(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}
