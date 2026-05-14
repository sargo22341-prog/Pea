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
    resolve: {
      alias: {
        react: path.resolve(projectRoot, "node_modules/react"),
        "react/jsx-runtime": path.resolve(projectRoot, "node_modules/react/jsx-runtime.js"),
        "react/jsx-dev-runtime": path.resolve(projectRoot, "node_modules/react/jsx-dev-runtime.js"),
        "react-dom/client": path.resolve(projectRoot, "node_modules/react-dom/client.js"),
        "react-dom": path.resolve(projectRoot, "node_modules/react-dom")
      },
      dedupe: ["react", "react-dom"]
    },
    build: {
      rollupOptions: {
        output: {
          // Isole recharts dans un chunk séparé pour deux raisons :
          // 1. Le chunk principal est plus léger → premier affichage plus rapide.
          // 2. recharts change rarement → son chunk est mis en cache navigateur longtemps.
          // Vite 8 / rolldown requiert une fonction plutôt qu'un objet pour manualChunks.
          manualChunks: (id: string) => {
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
              return "recharts";
            }
            return undefined;
          }
        }
      }
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      cors: {
        origin: true,
        credentials: true
      },
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
