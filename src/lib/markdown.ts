/**
 * Markdown mínimo para as bolhas do chat (bloco 130). Puro, para teste.
 *
 * Até aqui a resposta era sempre curta e sem marcação (era escrita para ser falada). Com o
 * chat digitado respondendo como chat, vêm listas, **negrito** e blocos de código — e o
 * celular mostrava os asteriscos crus. Uma lib de markdown para React Native puxaria
 * dependência e estilo próprios; o que o modelo escreve cabe neste subconjunto:
 * parágrafo, título (#..###), lista com marcador ou número, bloco de código e, dentro da
 * linha, negrito, itálico, código e link.
 */

export type Trecho =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrito'; texto: string }
  | { tipo: 'italico'; texto: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'link'; texto: string; url: string };

export type Bloco =
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'titulo'; nivel: number; trechos: Trecho[] }
  | { tipo: 'item'; marcador: string; nivel: number; trechos: Trecho[] }
  | { tipo: 'codigo'; linguagem: string; texto: string };

const INLINE = /(\*\*([^*\n]+)\*\*)|(`([^`\n]+)`)|(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))|((?:^|(?<=\s))(?:\*|_)([^*_\n]+)(?:\*|_)(?=\s|[.,;:!?]|$))|(https?:\/\/[^\s)]+)/g;

export function parseInline(s: string): Trecho[] {
  const out: Trecho[] = [];
  let ultimo = 0;
  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(s); m; m = INLINE.exec(s)) {
    if (m.index > ultimo) out.push({ tipo: 'texto', texto: s.slice(ultimo, m.index) });
    if (m[1]) out.push({ tipo: 'negrito', texto: m[2] });
    else if (m[3]) out.push({ tipo: 'codigo', texto: m[4] });
    else if (m[5]) out.push({ tipo: 'link', texto: m[6], url: m[7] });
    else if (m[8]) out.push({ tipo: 'italico', texto: m[9] });
    else if (m[10]) out.push({ tipo: 'link', texto: m[10], url: m[10] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) out.push({ tipo: 'texto', texto: s.slice(ultimo) });
  return out.length ? out : [{ tipo: 'texto', texto: '' }];
}

export function parseMarkdown(md: string): Bloco[] {
  const linhas = md.replace(/\r\n/g, '\n').split('\n');
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', trechos: parseInline(paragrafo.join(' ')) });
    paragrafo = [];
  };
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const cerca = /^\s*```\s*([\w+-]*)\s*$/.exec(linha);
    if (cerca) {
      fecharParagrafo();
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) corpo.push(linhas[i++]);
      blocos.push({ tipo: 'codigo', linguagem: cerca[1], texto: corpo.join('\n') });
      continue;
    }
    if (!linha.trim()) { fecharParagrafo(); continue; }
    const titulo = /^(#{1,3})\s+(.+)$/.exec(linha);
    if (titulo) { fecharParagrafo(); blocos.push({ tipo: 'titulo', nivel: titulo[1].length, trechos: parseInline(titulo[2]) }); continue; }
    const item = /^(\s*)([-*•]|\d+[.)])\s+(.+)$/.exec(linha);
    if (item) {
      fecharParagrafo();
      const marcador = /\d/.test(item[2]) ? item[2].replace(')', '.') : '•';
      blocos.push({ tipo: 'item', marcador, nivel: Math.min(2, Math.floor(item[1].length / 2)), trechos: parseInline(item[3]) });
      continue;
    }
    paragrafo.push(linha.trim());
  }
  fecharParagrafo();
  return blocos;
}

/** O texto sem marcação — o que vai para a área de transferência e para a voz. */
export function textoPuro(md: string): string {
  return parseMarkdown(md).map(b => {
    if (b.tipo === 'codigo') return b.texto;
    const t = b.trechos.map(x => x.texto).join('');
    return b.tipo === 'item' ? `${b.marcador} ${t}` : t;
  }).join('\n');
}

/**
 * O que FALAR de uma resposta escrita (bloco 130, igual ao `paraFala` do PC): o digitado
 * também sai em voz, e uma resposta de 15 linhas lida inteira é um discurso. Fala o
 * começo, em frases inteiras, e avisa que o resto está na tela.
 */
export function paraFala(md: string, limite = 320): string {
  const limpo = parseMarkdown(md).filter(b => b.tipo !== 'codigo').map(b => {
    const t = (b as { trechos: Trecho[] }).trechos.map(x => x.texto).join('');
    return /[.!?:]$/.test(t) ? t : `${t}.`;
  }).join(' ').replace(/\s+/g, ' ').trim();
  if (limpo.length <= limite) return limpo;
  const frases = limpo.match(/[^.!?:]+[.!?:]+(\s|$)|[^.!?:]+$/g) ?? [limpo];
  let falado = '';
  for (const f of frases) {
    if (falado && (falado + f).length > limite) break;
    falado += f;
  }
  if (!falado) falado = limpo.slice(0, limite);
  return `${falado.trim().replace(/[:;,]$/, '.')} O resto está na tela.`;
}
