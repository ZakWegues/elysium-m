import { useEffect } from 'react';
import * as Linking from 'expo-linking';

/**
 * Deep links de navegação (bloco 73): `elysium://busca`, `elysium://chat`, `elysium://pc`,
 * `elysium://rotinas`, `elysium://inicio` (widget de Clima, bloco 90). Quem os dispara são os widgets da tela inicial; o compartilhamento
 * (`elysium://share?text=`) continua em `shareIntent.ts` e não passa por aqui.
 *
 * Mesma armadilha do compartilhamento: trata o app já aberto (evento) E o app aberto
 * pelo link (URL inicial) — o segundo é o caso real do widget com o app fechado.
 */
export type Destino = 'busca' | 'chat' | 'pc' | 'rotinas' | 'inicio' | 'hoje' | 'falar' | 'tarefas';

export function destinoDaUrl(url: string): Destino | null {
  try {
    const p = Linking.parse(url);
    const alvo = (p.hostname || p.path || '').replace(/^\/+|\/+$/g, '');
    if (alvo === 'busca' || alvo === 'chat' || alvo === 'pc' || alvo === 'rotinas' || alvo === 'inicio' || alvo === 'hoje' || alvo === 'falar' || alvo === 'tarefas') return alvo;
    return null;
  } catch {
    return null;
  }
}

export function useDeepLinks(aoChegar: (destino: Destino, url: string) => void) {
  useEffect(() => {
    let cancelado = false;
    const tratar = (url: string | null) => {
      if (!url || cancelado) return;
      const d = destinoDaUrl(url);
      if (d) aoChegar(d, url);
    };
    Linking.getInitialURL().then(tratar);
    const sub = Linking.addEventListener('url', (e) => tratar(e.url));
    return () => { cancelado = true; sub.remove(); };
  }, [aoChegar]);
}
