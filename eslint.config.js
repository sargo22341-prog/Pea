import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/.vite/**",
            "**/coverage/**",
            "**/*.d.ts",
            "scripts/**"
        ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    // 🔥 Pour tout le projet (backend + shared + scripts)
    {
        files: ["**/*.{ts,js}"],
    },

    // ⚛️ Spécifique React (frontend seulement)
    {
        files: ["frontend/**/*.{ts,tsx}"],
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": "warn",
        },
    }
);