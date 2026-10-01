/**
 * Busca DENTRO das conversas salvas (bloco 133). Pura, para teste. Mesma regra do
 * `buscaConversas.ts` do PC — aqui sobre as conversas guardadas no próprio celular.
 *
 * A paleta Ctrl+K só achava conversa pelo título — "aquela vez que ele explicou SSD" não
 * aparecia se o título fosse "oi". Aqui a busca é no texto das mensagens: todas as
 * palavras da consulta precisam aparecer (sem acento, sem caixa), uma linha por conversa
 * (a mensagem mais recente que casou), com o trecho em volta do primeiro termo.
 */

export interface MensagemBuscavel { from: string; text: string; ts: number }
export interface SessaoBuscavel { id: string; title: string; updatedAt: number; messages: MensagemBuscavel[] }
export interface AchadoConversa { sessaoId: string; titulo: string; trecho: string; em: number; deQuem: "eu" | "elysium" }

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function buscarNasConversas(sessoes: SessaoBuscavel[], consulta: string, maximo = 12): AchadoConversa[] {
  const termos = semAcento(consulta).split(/\s+/).filter(t => t.length >= 2);
  if (!termos.length) return [];
  const achados: AchadoConversa[] = [];
  for (const s of sessoes) {
    const msgs = [...(s.messages ?? [])].filter(m => m.from === "me" || m.from === "reply").sort((a, b) => b.ts - a.ts);
    for (const m of msgs) {
      const plano = semAcento(m.text);
      if (!termos.every(t => plano.includes(t))) continue;
      achados.push({ sessaoId: s.id, titulo: s.title || "Conversa", trecho: trecho(m.text, plano.indexOf(termos[0])), em: m.ts, deQuem: m.from === "me" ? "eu" : "elysium" });
      break;
    }
  }
  return achados.sort((a, b) => b.em - a.em).slice(0, maximo);
}

/** ~130 caracteres em volta da posição, sem quebrar palavra nas pontas. */
function trecho(texto: string, pos: number): string {
  const limpo = texto.replace(/[*_`#>]/g, "").replace(/\s+/g, " ");
  // A posição veio do texto sem acento, que tem o mesmo comprimento do original (NFD
  // remove só as marcas combinantes, que NFC não tinha); a limpeza de markdown pode
  // deslocar um pouco — por isso a janela é folgada.
  const ini = Math.max(0, pos - 50);
  let t = limpo.slice(ini, ini + 130);
  if (ini > 0) t = "…" + t.replace(/^\S*\s/, "");
  if (ini + 130 < limpo.length) t = t.replace(/\s\S*$/, "") + "…";
  return t.trim();
}
