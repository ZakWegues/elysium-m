import type { Tarefa } from './rpc';

/**
 * As contas da lista de tarefas no celular (fase 18, 08/10) — puras, testadas em
 * tests/tarefasUi.test.ts. A tela cheia agrupa como o Todoist (Atrasadas / Hoje / Amanhã /
 * Próximos / Sem data / Feitas), e o campo de hora aceita "1430" virando "14:30".
 */

export type Secao = { chave: 'atrasadas' | 'hoje' | 'amanha' | 'proximos' | 'semData' | 'feitas'; titulo: string; data: Tarefa[] };

const inicioDoDia = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** Sem hora (compromisso "dia todo") só atrasa depois que o dia acaba — igual ao PC. */
export function fimDoPrazo(t: Pick<Tarefa, 'prazo' | 'semHora'>): number | undefined {
  if (t.prazo === undefined) return undefined;
  return t.semHora ? inicioDoDia(t.prazo) + 86_400_000 - 1 : t.prazo;
}

export function atrasada(t: Tarefa, agora = Date.now()): boolean {
  const fim = fimDoPrazo(t);
  return !t.feita && fim !== undefined && fim < agora;
}

/** As seções, só as que têm algo. Dentro de cada uma: estrela primeiro, depois por prazo. */
export function agruparTarefas(ts: Tarefa[], agora = Date.now()): Secao[] {
  const hoje = inicioDoDia(agora);
  const amanha = hoje + 86_400_000;
  const depois = amanha + 86_400_000;
  const ordem = (a: Tarefa, b: Tarefa) =>
    (a.prioridade === 'alta' ? 0 : 1) - (b.prioridade === 'alta' ? 0 : 1) || (a.prazo ?? Infinity) - (b.prazo ?? Infinity) || a.criadaEm - b.criadaEm;
  const grupos: Record<Secao['chave'], Tarefa[]> = { atrasadas: [], hoje: [], amanha: [], proximos: [], semData: [], feitas: [] };
  for (const t of ts) {
    if (t.feita) grupos.feitas.push(t);
    else if (t.prazo === undefined) grupos.semData.push(t);
    else if (atrasada(t, agora)) grupos.atrasadas.push(t);
    else if (t.prazo < amanha) grupos.hoje.push(t);
    else if (t.prazo < depois) grupos.amanha.push(t);
    else grupos.proximos.push(t);
  }
  grupos.feitas.sort((a, b) => (b.feitaEm ?? 0) - (a.feitaEm ?? 0));
  const titulos: Record<Secao['chave'], string> = { atrasadas: 'ATRASADAS', hoje: 'HOJE', amanha: 'AMANHÃ', proximos: 'PRÓXIMOS', semData: 'SEM DATA', feitas: 'FEITAS' };
  return (Object.keys(grupos) as Secao['chave'][])
    .filter(k => grupos[k].length)
    .map(k => ({ chave: k, titulo: titulos[k], data: k === 'feitas' ? grupos[k] : grupos[k].sort(ordem) }));
}

/** "hoje 16:00", "amanhã 08:00", "sáb 10:00", "25/12 16:00"; sem hora: "sex · dia todo". */
export function quandoTarefa(ms: number, semHora = false, agora = Date.now()): string {
  const d = new Date(ms);
  const hoje = inicioDoDia(agora);
  const dia = inicioDoDia(ms);
  const dias = Math.round((dia - hoje) / 86_400_000);
  const hora = semHora ? 'dia todo' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sep = semHora ? ' · ' : ' ';
  if (dias === 0) return `hoje${sep}${hora}`;
  if (dias === 1) return `amanhã${sep}${hora}`;
  if (dias === -1) return `ontem${sep}${hora}`;
  if (dias > 1 && dias < 7) return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]}${sep}${hora}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}${sep}${hora}`;
}

/** Máscara do campo de hora (teclado numérico): "1430" → "14:30", "9" → "9", "930" → "9:30". */
export function mascaraHora(entrada: string): string {
  const d = entrada.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return d.length === 3 ? `${d[0]}:${d.slice(1)}` : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** "9:30" / "09:30" / "14:00" válidos; devolve "HH:MM" ou null. Vazio é válido (sem hora) → "". */
export function validarHora(h: string): string | null {
  const t = h.trim();
  if (!t) return '';
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** O `quando` do RPC: "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM". Sem dia e sem hora → undefined. Hora sem dia = hoje. */
export function montarQuando(dia: Date | null, hora: string, agora = new Date()): string | undefined {
  if (!dia && !hora) return undefined;
  const d = dia ?? agora;
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return hora ? `${ymd}T${hora}` : ymd;
}

/** Os próximos N dias para os chips do editor: [{rótulo, data}] começando hoje. */
export function proximosDias(n = 14, agora = new Date()): { rotulo: string; data: Date }[] {
  const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Array.from({ length: n }, (_, i) => {
    const data = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const rotulo = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][data.getDay()]} ${data.getDate()}`;
    return { rotulo, data };
  });
}

/** Filtro de texto da busca: sem acento, em texto e ressalva. */
export function filtrarTarefas(ts: Tarefa[], busca: string): Tarefa[] {
  const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = sem(busca.trim());
  if (!q) return ts;
  return ts.filter(t => sem(`${t.texto} ${t.ressalva ?? ''}`).includes(q));
}
