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
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },

    {
        files: ["frontend/public/sw.js"],
        languageOptions: {
            globals: {
                caches: "readonly",
                fetch: "readonly",
                self: "readonly",
                URL: "readonly",
            },
        },
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
            "react-hooks/purity": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/use-memo": "off",
        },
    }
);
