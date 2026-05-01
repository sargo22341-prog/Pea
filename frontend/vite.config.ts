import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.resolve(projectRoot, "frontend");

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
        react: path.resolve(frontendRoot, "node_modules/react"),
        "react/jsx-runtime": path.resolve(frontendRoot, "node_modules/react/jsx-runtime.js"),
        "react/jsx-dev-runtime": path.resolve(frontendRoot, "node_modules/react/jsx-dev-runtime.js"),
        "react-dom/client": path.resolve(frontendRoot, "node_modules/react-dom/client.js"),
        "react-dom": path.resolve(frontendRoot, "node_modules/react-dom")
      },
      dedupe: ["react", "react-dom"]
    },
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
