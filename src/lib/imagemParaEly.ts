/**
 * Fase 23.2: imagem compartilhada de outro app → pergunta para a Ely (o mesmo `vision.ask` da
 * câmera do chat). O compartilhar chega na raiz do App, mas quem mostra a pergunta e a
 * resposta é o Chat — que pode nem estar montado ainda. Fica pendente aqui até ele pegar.
 */
export type ImagemPendente = { base64: string; pergunta: string };

let pendente: ImagemPendente | null = null;
const ouvintes = new Set<() => void>();

export function pedirSobreImagem(base64: string, pergunta: string): void {
  pendente = { base64, pergunta: pergunta.trim() || 'O que aparece nesta imagem?' };
  ouvintes.forEach(fn => fn());
}

/** Tira da fila (uma vez só): quem pegou é quem responde. */
export function pegarImagemPendente(): ImagemPendente | null {
  const p = pendente;
  pendente = null;
  return p;
}

export function aoChegarImagem(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}
