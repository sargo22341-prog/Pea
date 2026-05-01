import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "");
  const debugEnabled = (process.env.DEBUG ?? env.DEBUG) === "true";

  return {
    define: {
      __APP_DEBUG__: JSON.stringify(debugEnabled)
    },
    envDir: projectRoot,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true
        },
        "/health": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true
        }
      }
    }
  };
});
