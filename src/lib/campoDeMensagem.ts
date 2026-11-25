/** As contas do campo de escrever do Chat (25/11). Puras — testadas em tests/chatDoDia.test.ts. */

export const LINHA_DO_CAMPO = 22;
export const PADDING_DO_CAMPO = 10;
const MAX_LINHAS = 7;

/** `medida`: a altura do texto espelho. `aberta`: a altura da meia tela, quando ele abriu. */
export function alturaDoCampo(medida: number, aberta: number | null): { altura: number; linhas: number } {
  const linhas = Math.max(1, Math.round(medida / LINHA_DO_CAMPO));
  const conteudo = Math.min(linhas, MAX_LINHAS) * LINHA_DO_CAMPO + PADDING_DO_CAMPO * 2;
  return { altura: aberta === null ? conteudo : Math.max(conteudo, aberta), linhas };
}

/** Com quantas letras o campo virou cartão (null = uma linha). Só volta quando encurta de verdade. */
export function proximoTamanho(virouCom: number | null, letras: number, linhas: number): number | null {
  if (virouCom === null) return linhas > 1 ? letras : null;
  return linhas <= 1 && letras < virouCom - 2 ? null : virouCom;
}

/** Quantas letras faltam, só perto do limite. */
export function perto(usadas: number, max: number): number | null {
  return usadas > max * 0.9 ? max - usadas : null;
}

const DIA = 86_400_000;
const inicioDoDia = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** "Hoje 19:20", "Ontem 08:05", "seg, 23 de nov 10:00". */
export function rotuloDaHora(ts: number, agora = Date.now()): string {
  const hora = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(ts)) / DIA);
  if (dias === 0) return `Hoje ${hora}`;
  if (dias === 1) return `Ontem ${hora}`;
  return `${new Date(ts).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')} ${hora}`;
}

/** Mostra a hora antes desta mensagem? Dia novo, ou meia hora parado. */
export function separaAntes(ts: number, anterior: number | undefined): boolean {
  if (!ts) return false;
  if (!anterior) return true;
  return inicioDoDia(ts) !== inicioDoDia(anterior) || ts - anterior > 30 * 60_000;
}

/** Quantas conversas cabem no aparelho: 40, ou até ~900 mil letras (o limite do armazenamento). */
export function cabem<T>(conversas: T[], max = 40, letras = 900_000): T[] {
  const saida: T[] = [];
  let total = 0;
  for (const c of conversas.slice(0, max)) {
    total += JSON.stringify(c).length;
    if (total > letras && saida.length >= 5) break;
    saida.push(c);
  }
  return saida;
}
