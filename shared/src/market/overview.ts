/** Familles de la page Marchés, dans leur ordre d'affichage. */
export const MARKET_OVERVIEW_CATEGORIES = ["indices", "currencies", "commodities", "rates"] as const;
export type MarketOverviewCategory = (typeof MARKET_OVERVIEW_CATEGORIES)[number];

/** Intervalle de rafraîchissement de la page Marchés, aligné sur la fraîcheur du cache des cotations. */
export const MARKETS_REFRESH_INTERVAL_MS = 60_000;

export interface MarketOverviewItem {
  symbol: string;
  category: MarketOverviewCategory;
  /** Clé de traduction de l'instrument (`markets:instruments.<key>`). */
  key: string;
  price?: number | undefined;
  change?: number | undefined;
  changePercent?: number | undefined;
  currency?: string | undefined;
  marketState?: string | undefined;
  /** Clôtures du dernier mois (horodatage ms, valeur), vide si l'historique est indisponible. */
  sparkline: { t: number; v: number }[];
  stale?: boolean | undefined;
}

export interface MarketOverviewResponse {
  items: MarketOverviewItem[];
  updatedAt: string;
}
