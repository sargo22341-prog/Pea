import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "frontend/android/**",
            "**/.vite/**",
            "**/coverage/**",
            "**/*.d.ts"
        ],
    },

    {
        linterOptions: {
            reportUnusedDisableDirectives: "error",
            reportUnusedInlineConfigs: "error",
        },
    },

    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    // Analyse typée : chaque fichier TypeScript est rattaché à son tsconfig.
    {
        languageOptions: {
            parserOptions: {
                project: [
                    "./shared/tsconfig.json",
                    "./backend/tsconfig.json",
                    "./frontend/tsconfig.json",
                    "./frontend/tsconfig.node.json",
                ],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Les nombres s'interpolent sans ambiguïté dans les messages et URL.
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            // Sur les primitives, `||` est volontaire : "" / 0 / false signifient « absent » (nom vide,
            // prix nul, drapeau faux) et doivent declencher le repli. `??` reste exige pour les objets.
            "@typescript-eslint/prefer-nullish-coalescing": ["error", {
                ignorePrimitives: { string: true, number: true, boolean: true, bigint: true },
            }],
            // node:test gère lui-même les promesses retournées par test()/describe().
            "@typescript-eslint/no-floating-promises": ["error", {
                allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "it", "describe", "suite"] }],
            }],
        },
    },

    // Scripts Node (.mjs), configuration JS et service worker : pas d'analyse typée.
    {
        files: ["**/*.{js,mjs}"],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        files: ["scripts/**/*.mjs", "eslint.config.js", "frontend/postcss.config.js"],
        languageOptions: { globals: globals.node },
    },
    {
        files: ["frontend/public/sw.js"],
        languageOptions: { globals: globals.serviceworker },
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
            "react-refresh/only-export-components": "error",
        },
    }
);
