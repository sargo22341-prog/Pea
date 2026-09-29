/**
 * Screener PEA maison : filtrage local des actifs connus de l'instance (aucun appel Yahoo).
 * Rendements, variations et distances sont des fractions (0,04 = 4 %).
 */
export const SCREENER_SORT_KEYS = ["name", "trailingPE", "dividendYield", "marketCap", "change52w", "distanceFromHigh"] as const;
export type ScreenerSortKey = (typeof SCREENER_SORT_KEYS)[number];

export const SCREENER_ASSET_TYPES = ["all", "stock", "etf"] as const;
export type ScreenerAssetType = (typeof SCREENER_ASSET_TYPES)[number];

/** Bornes acceptées pour chaque filtre numérique (au-delà : requête refusée). */
export const SCREENER_LIMITS = {
  trailingPE: { min: 0, max: 1000 },
  dividendYield: { min: 0, max: 1 },
  marketCap: { min: 0, max: 1e14 },
  change52w: { min: -1, max: 100 },
  distanceFromHigh: { min: 0, max: 1 }
} as const;

/** Nombre maximal de lignes renvoyées ; au-delà, la réponse est marquée tronquée. */
export const SCREENER_MAX_RESULTS = 200;
export const SCREENER_PRESET_NAME_MAX_LENGTH = 60;
export const SCREENER_MAX_PRESETS_PER_USER = 20;
export const SCREENER_TEXT_FILTER_MAX_LENGTH = 80;

export interface ScreenerFilters {
  peaOnly?: boolean | undefined;
  assetType?: ScreenerAssetType | undefined;
  sector?: string | undefined;
  country?: string | undefined;
  minDividendYield?: number | undefined;
  maxTrailingPE?: number | undefined;
  minTrailingPE?: number | undefined;
  /** Capitalisations en euros (converties au cours approximatif de la devise de cotation). */
  minMarketCap?: number | undefined;
  maxMarketCap?: number | undefined;
  minChange52w?: number | undefined;
  maxChange52w?: number | undefined;
  /** Distance maximale au plus haut 52 semaines (0,1 = au plus 10 % sous le plus haut). */
  maxDistanceFromHigh?: number | undefined;
}

export interface ScreenerQuery {
  filters: ScreenerFilters;
  sort: ScreenerSortKey;
  direction: "asc" | "desc";
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  isEtf: boolean;
  peaEligible: boolean;
  sector?: string | undefined;
  country?: string | undefined;
  currency?: string | undefined;
  price?: number | undefined;
  trailingPE?: number | undefined;
  dividendYield?: number | undefined;
  marketCap?: number | undefined;
  change52w?: number | undefined;
  /** Écart au plus haut 52 semaines, positif (0,08 = 8 % sous le plus haut). */
  distanceFromHigh?: number | undefined;
}

export interface ScreenerResponse {
  rows: ScreenerRow[];
  /** Lignes correspondant aux filtres, avant la limite `SCREENER_MAX_RESULTS`. */
  total: number;
  truncated: boolean;
}

export interface ScreenerOptions {
  sectors: string[];
  countries: string[];
}

export interface ScreenerPreset {
  id: number;
  name: string;
  filters: ScreenerFilters;
  createdAt: string;
}
