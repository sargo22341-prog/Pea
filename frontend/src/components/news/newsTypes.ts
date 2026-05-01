/**
 * Role du fichier : partager les types internes de la page Actualite entre le
 * hook de donnees et les composants d'affichage dedies.
 */

import type { NewsArticle } from "@pea/shared";

export type NewsMode = "assets" | "global";

export interface AsyncNewsState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface AssetNewsCacheEntry {
  articles: NewsArticle[];
  loadedOffsets: Set<number>;
  totalAssets: number | null;
  fullyLoaded: boolean;
}
