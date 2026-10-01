import { useEffect, useState } from 'react';

/**
 * Quem está usando o microfone agora (bloco 129).
 *
 * O celular tem um microfone só, e três coisas querem ele: a palavra "Elysium" (o
 * reconhecedor do Android escutando), a mão livre e o segurar-para-falar (o gravador do
 * expo-audio). Dois ao mesmo tempo = um deles grava silêncio ou dá erro de captura. E a
 * fala da resposta também conta: o reconhecedor ouviria a própria voz do ELYSIUM.
 *
 * Um conjunto de "ocupantes" com nome em vez de um booleano: a mão livre termina e libera
 * a dela sem soltar a fala que ainda está tocando.
 */
const ocupantes = new Set<string>();
const ouvintes = new Set<(livre: boolean) => void>();

function avisar() {
  const livre = ocupantes.size === 0;
  ouvintes.forEach(fn => fn(livre));
}

export function ocuparMicrofone(quem: string): void {
  if (ocupantes.has(quem)) return;
  ocupantes.add(quem);
  avisar();
}

export function liberarMicrofone(quem: string): void {
  if (!ocupantes.delete(quem)) return;
  avisar();
}

export function microfoneLivre(): boolean {
  return ocupantes.size === 0;
}

export function useMicrofoneLivre(): boolean {
  const [livre, setLivre] = useState(microfoneLivre());
  useEffect(() => {
    ouvintes.add(setLivre);
    setLivre(microfoneLivre());
    return () => { ouvintes.delete(setLivre); };
  }, []);
  return livre;
}
