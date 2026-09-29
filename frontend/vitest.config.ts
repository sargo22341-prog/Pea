import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  // Constante injectée par Vite au build (`vite.config.ts`) : journaux de debug coupés en test.
  define: {
    __APP_DEBUG__: "false"
  },
  resolve: {
    alias: {
      "@pea/shared": path.resolve(projectRoot, "shared/src/index.ts")
    },
    dedupe: ["react", "react-dom"]
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "vmThreads",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
