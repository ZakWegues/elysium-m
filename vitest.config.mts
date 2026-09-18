import { defineConfig } from "vitest/config";

// Só a lógica pura do celular: busca, deep links, paletas, notificações (com os módulos
// nativos dublados em tests/setup.ts). Telas não entram — sem aparelho, teste de tela é
// teste de mock.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    clearMocks: true,
  },
});
