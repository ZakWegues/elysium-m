/**
 * Links em texto simples (fase 23): a mensagem que eu mando e os recados da Caixa não passam
 * pelo markdown, mas o link colado tem que abrir — no app certo (YouTube, Instagram…).
 */
export type Parte = { tipo: 'texto'; texto: string } | { tipo: 'link'; texto: string; url: string };

const URL = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+)/gi;

/** Corta a pontuação que gruda no fim do link ("veja https://x.com.") — e o ")" sem par. */
function aparar(u: string): string {
  let s = u.replace(/[.,;:!?'"»]+$/, '');
  if (s.endsWith(')') && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) s = s.slice(0, -1);
  return s;
}

/** Divide o texto em pedaços de texto e de link. Puro. */
export function partesComLinks(texto: string): Parte[] {
  const out: Parte[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(URL)) {
    const bruto = m[0];
    const link = aparar(bruto);
    const ini = m.index ?? 0;
    if (ini > ultimo) out.push({ tipo: 'texto', texto: texto.slice(ultimo, ini) });
    out.push({ tipo: 'link', texto: link, url: /^https?:/i.test(link) ? link : `https://${link}` });
    ultimo = ini + link.length;
  }
  if (ultimo < texto.length) out.push({ tipo: 'texto', texto: texto.slice(ultimo) });
  return out;
}
