/**
 * Modo live no celular (fase 21, bloco 217) — as mesmas frases do PC (`services/live.ts` lá).
 * Conversa contínua em turnos: ela responde e o Chat volta a gravar sozinho, até "tchau",
 * um toque no X da faixa ou um minuto sem ouvir nada. Só em memória.
 */

export const SILENCIO_LIVE_MS = 60_000;

function norm(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^(ely|elysium) /, '').replace(/ (ely|elysium)$/, '');
}

/** "modo live", "vamos conversar"… Pura. */
export function ehEntradaDoLive(texto: string): boolean {
  return /^(liga |ativa |entra no |abre o )?(o )?modo (live|ao vivo|conversa)$|^vamos conversar( um pouco)?$|^conversa comigo$|^bora conversar$/.test(norm(texto));
}

/** "tchau", "sai do modo live", "chega"… Pura. */
export function ehSaidaDoLive(texto: string): boolean {
  return /^(tchau|tchau tchau|ate mais|ate logo|falou|valeu tchau|obrigad[oa] tchau|chega|chega por hoje|encerra(r)?( a)? conversa|para de ouvir|pode parar de ouvir|sai(r)? do modo (live|ao vivo|conversa)|desliga( o)? modo (live|ao vivo|conversa)|fim do modo (live|conversa))$/.test(norm(texto));
}
