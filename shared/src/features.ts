/**
 * Fonctionnalités activables par l'administrateur. La plupart coûtent des appels Yahoo : désactivée,
 * une fonctionnalité ne déclenche aucun appel et son bloc est masqué. Les alertes n'en coûtent pas
 * mais peuvent être coupées pour alléger le rafraîchissement live d'une instance chargée.
 */
export const APP_FEATURE_KEYS = ["extended_fundamentals", "quarterly_statements", "insights", "similar_assets", "markets_page", "alerts"] as const;
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

/** Filtres du suivi des appels Yahoo (section administration), partagés par l'API et son client. */
export interface YahooUsageStatsQuery {
  id?: number | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  method?: string | undefined;
  module?: string | undefined;
  ticker?: string | undefined;
  source?: string | undefined;
  feature?: YahooUsageFeature | undefined;
  success?: boolean | undefined;
  groupBy?: "hour" | "day" | "method" | "module" | "ticker" | undefined;
  limit?: number | undefined;
}
