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
  | { tipo: 'codigo'; linguagem: string; texto: string }
  | { tipo: 'tabela'; cabecalho: Trecho[][]; linhas: Trecho[][][] };

/**
 * "| a | b |" → ["a", "b"]. As barras das pontas são opcionais no markdown. Uma barra
 * escapada (`\|`) ou dentro de código (`a|b`) é texto, não divisória — o split simples
 * deslocava as células da linha inteira.
 */
export function celulas(linha: string): string[] {
  const t = linha.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const out: string[] = [];
  let atual = '';
  let emCodigo = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '\\' && t[i + 1] === '|') { atual += '|'; i++; continue; }
    if (ch === '`') emCodigo = !emCodigo;
    if (ch === '|' && !emCodigo) { out.push(atual.trim()); atual = ''; continue; }
    atual += ch;
  }
  out.push(atual.trim());
  return out;
}

/** A linha "|---|:---:|" que separa o cabeçalho. Exige ao menos uma barra: "---" sozinho é régua. */
export function ehSeparadorDeTabela(linha: string): boolean {
  return linha.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(linha);
}

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
    // Tabela (02/10): a Ely gera tabela no chat escrito (comparações, horários), e sem isto
    // ela chegava como um parágrafo de barras. Precisa da linha "|---|---|" logo abaixo.
    if (linha.includes('|') && i + 1 < linhas.length && ehSeparadorDeTabela(linhas[i + 1])) {
      fecharParagrafo();
      const cabecalho = celulas(linha).map(parseInline);
      const corpo: Trecho[][][] = [];
      i += 2;
      while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim()) corpo.push(celulas(linhas[i++]).map(parseInline));
      i--;
      blocos.push({ tipo: 'tabela', cabecalho, linhas: corpo });
      continue;
    }
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
  const celula = (c: Trecho[]) => c.map(x => x.texto).join('');
  return parseMarkdown(md).map(b => {
    if (b.tipo === 'codigo') return b.texto;
    if (b.tipo === 'tabela') return [b.cabecalho, ...b.linhas].map(l => l.map(celula).join(' | ')).join('\n');
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
  // Código e tabela não se leem em voz alta: ficam na tela — e então a fala avisa, mesmo
  // curta ("Veja a tabela:" sozinho deixava quem só ouve sem saber que havia mais).
  const blocos = parseMarkdown(md);
  const pulou = blocos.some(b => b.tipo === 'codigo' || b.tipo === 'tabela');
  const limpo = blocos.filter(b => b.tipo !== 'codigo' && b.tipo !== 'tabela').map(b => {
    const t = (b as { trechos: Trecho[] }).trechos.map(x => x.texto).join('');
    return /[.!?:]$/.test(t) ? t : `${t}.`;
  }).join(' ').replace(/\s+/g, ' ').trim();
  if (limpo.length <= limite) return pulou ? `${limpo.replace(/[:;,]$/, '.')} O resto está na tela.`.trim() : limpo;
  const frases = limpo.match(/[^.!?:]+[.!?:]+(\s|$)|[^.!?:]+$/g) ?? [limpo];
  let falado = '';
  for (const f of frases) {
    if (falado && (falado + f).length > limite) break;
    falado += f;
  }
  if (!falado) falado = limpo.slice(0, limite);
  return `${falado.trim().replace(/[:;,]$/, '.')} O resto está na tela.`;
}
