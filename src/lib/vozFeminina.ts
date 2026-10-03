/**
 * Voz feminina para a fala do próprio aparelho (02/10).
 *
 * A Ely fala com a voz do PC (Francisca) quando pareada; sem PC cai no `expo-speech`, que
 * usa a voz PADRÃO do Android — em muitos aparelhos, masculina. O Android não diz o gênero
 * das vozes, então a escolha é pelo identificador:
 *   - "female" no nome (alguns motores escrevem);
 *   - Google: `pt-br-x-afs-*` e `pt-br-x-pte-*` são as femininas do pacote pt-BR;
 *   - Samsung: `…SMTf…` (f = feminina, m = masculina).
 * Entre duas iguais, a "local" ganha da "network": não depende de rede e começa antes.
 * Sem nenhuma reconhecida, `null` — o chamador fica com a padrão e só sobe um pouco o tom.
 */

export type VozDoAparelho = { identifier: string; language: string; name?: string };

const SINAIS = [/female/i, /-x-afs-/i, /-x-pte-/i, /smtf/i];

export function escolherVozFeminina(vozes: VozDoAparelho[]): string | null {
  const pt = vozes.filter(v => /^pt[-_]br/i.test(v.language));
  for (const sinal of SINAIS) {
    const achadas = pt.filter(v => sinal.test(v.identifier) || sinal.test(v.name ?? ''));
    if (achadas.length) {
      const local = achadas.find(v => /local/i.test(v.identifier));
      return (local ?? achadas[0]).identifier;
    }
  }
  return null;
}
