/**
 * Fonctionnalités activables par l'administrateur. Chacune coûte des appels Yahoo : désactivée,
 * elle ne déclenche aucun appel et son bloc est masqué.
 */
export const APP_FEATURE_KEYS = ["extended_fundamentals", "quarterly_statements", "insights", "similar_assets"] as const;
export type AppFeatureKey = (typeof APP_FEATURE_KEYS)[number];

export interface AppFeatureFlag {
  key: AppFeatureKey;
  enabled: boolean;
  defaultEnabled: boolean;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
}

/** Famille fonctionnelle d'un appel Yahoo, pour le suivi « appels / 24 h par fonctionnalité ». */
export const YAHOO_USAGE_FEATURES = [
  "quotes",
  "charts",
  "dividends",
  "fundamentals",
  "annual-statements",
  "quarterly-statements",
  "insights",
  "similar-assets",
  "news",
  "search",
  "screeners",
  "asset-icons",
  "other"
] as const;
export type YahooUsageFeature = (typeof YAHOO_USAGE_FEATURES)[number];
