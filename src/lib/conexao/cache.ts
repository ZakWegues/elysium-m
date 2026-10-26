import AsyncStorage from '@react-native-async-storage/async-storage';
import { chavePorPc } from '../pcAtivo';

/**
 * Modo offline (26/10, pedido do Zak): o último estado que veio do PC fica no aparelho, por PC.
 * As telas mostram o guardado na hora, buscam de novo por trás e trocam quando chega — sem o PC,
 * o app continua navegável e diz "atualizado há 3 min".
 */
export type Lembrado<T> = { dados: T; em: number };

export async function lembrar<T>(chave: string, dados: T): Promise<void> {
  try { await AsyncStorage.setItem(chavePorPc(`elysium:cache:${chave}`), JSON.stringify({ dados, em: Date.now() })); }
  catch { /* sem espaço: só não fica guardado */ }
}

export async function lembrado<T>(chave: string): Promise<Lembrado<T> | null> {
  try {
    const bruto = await AsyncStorage.getItem(chavePorPc(`elysium:cache:${chave}`));
    if (!bruto) return null;
    const v = JSON.parse(bruto) as Lembrado<T>;
    return v && typeof v.em === 'number' ? v : null;
  } catch { return null; }
}
