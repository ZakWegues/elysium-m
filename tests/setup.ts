/**
 * Dublês dos módulos nativos do Expo/React Native. O que cada teste precisa de específico
 * (uma resposta de RPC, uma notificação agendada) ele mocka por cima; aqui é só o mínimo
 * para os imports não explodirem em Node puro.
 */
import { vi } from "vitest";

// AsyncStorage em memória, com a mesma API que o app usa.
const memoria = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => memoria.get(k) ?? null,
    setItem: async (k: string, v: string) => { memoria.set(k, v); },
    removeItem: async (k: string) => { memoria.delete(k); },
    multiGet: async (ks: string[]) => ks.map(k => [k, memoria.get(k) ?? null]),
    clear: async () => memoria.clear(),
  },
}));
(globalThis as Record<string, unknown>).__asyncStorage = memoria;

vi.mock("expo-constants", () => ({ default: { appOwnership: null, expoConfig: { extra: { eas: { projectId: "teste" } } } } }));

vi.mock("expo-linking", () => ({
  parse: (url: string) => {
    // Só o que `destinoDaUrl` e `parseSharedUrl` usam: hostname, path e query.
    const u = new URL(url.replace(/^elysium:\/\//, "http://x/"));
    const queryParams: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { queryParams[k] = v; });
    const partes = u.pathname.replace(/^\/+/, "").split("/");
    return { hostname: partes[0] || null, path: partes.slice(1).join("/") || null, queryParams };
  },
  getInitialURL: async () => null,
  addEventListener: () => ({ remove() {} }),
}));

vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  Appearance: { getColorScheme: () => "light" },
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
}));
