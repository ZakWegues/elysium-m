/**
 * A Início mais simples (fase 22). Pura — testada em tests/layoutInicio.test.ts.
 *
 * Eram onze cards ligados de fábrica. Agora são cinco: sugestões, hoje, computador, música e
 * atalhos; os outros continuam em "Personalizar", só nascem desligados. Quem já tinha layout
 * salvo ganha o novo padrão UMA vez (a flag impede de resetar de novo).
 */

export const CARDS_PADRAO_V2 = ['sugestoes', 'hoje', 'computador', 'musica', 'atalhos'] as const;

/** Flag da migração única do layout (AsyncStorage). */
export const CHAVE_LAYOUT_V2 = 'inicio.layoutV2Aplicado';

/**
 * Decide o que fazer com o layout salvo ao abrir a Início.
 * - flag ausente: descarta o salvo (vale o padrão novo) e grava a flag;
 * - flag presente: usa o salvo como sempre.
 */
export function migrarLayout(flag: string | null, salvo: string | null): { usar: string | null; gravarFlag: boolean; apagarSalvo: boolean } {
  if (flag) return { usar: salvo, gravarFlag: false, apagarSalvo: false };
  return { usar: null, gravarFlag: true, apagarSalvo: salvo !== null };
}

/** A linha de estado única da Início: lembretes e clima juntos (o PC vem na frente, do EstadoPcLinha). */
export function resumoDaInicio(lembretes: number, temperatura: number | null): string {
  const partes: string[] = [];
  if (lembretes > 0) partes.push(`${lembretes} lembrete${lembretes > 1 ? 's' : ''}`);
  if (temperatura !== null && Number.isFinite(temperatura)) partes.push(`${Math.round(temperatura)}° lá fora`);
  return partes.length ? ` · ${partes.join(' · ')}` : '';
}
