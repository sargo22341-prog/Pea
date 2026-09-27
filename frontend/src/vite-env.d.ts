/// <reference types="vite/client" />

declare const __APP_DEBUG__: boolean;

interface ImportMetaEnv {
  /** URL de l'API en developpement (vide : meme origine). */
  readonly VITE_API_BASE_URL?: string;
}

/** Evenements applicatifs diffuses sur window entre pages et composants. */
interface WindowEventMap {
  "asset-icon-updated": CustomEvent<{ symbol: string; version: number }>;
  "profile-icon-updated": CustomEvent<{ cacheBust: number; hasProfileIcon: boolean }>;
}
