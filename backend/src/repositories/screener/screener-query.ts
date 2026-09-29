import type { ScreenerFilters, ScreenerQuery, ScreenerSortKey } from "@pea/shared";

/**
 * Vue locale du screener : actifs connus de l'instance, enrichis par les snapshots de cotation
 * et le cache fundamentals déjà stockés. Aucune valeur utilisateur n'est concaténée : les filtres
 * passent par des paramètres nommés et le tri par une liste blanche de colonnes.
 */
const SCREENER_VIEW = `
  WITH screened AS (
    SELECT
      a.symbol,
      a.name,
      UPPER(COALESCE(q.quote_type, a.quote_type, '')) AS quote_type,
      COALESCE(q.exchange, a.exchange) AS exchange,
      COALESCE(q.currency, a.currency) AS currency,
      p.sector,
      p.country,
      q.last_price AS price,
      CAST(COALESCE(json_extract(f.payload, '$.price.marketCap'), json_extract(f.payload, '$.summaryDetail.marketCap'), p.market_cap) AS REAL) AS market_cap,
      CAST(json_extract(f.payload, '$.summaryDetail.trailingPE') AS REAL) AS trailing_pe,
      COALESCE(d.dividend_yield, CAST(json_extract(f.payload, '$.summaryDetail.dividendYield') AS REAL), d.trailing_annual_dividend_yield) AS dividend_yield,
      COALESCE(CAST(json_extract(f.payload, '$.defaultKeyStatistics."52WeekChange"') AS REAL), r.fifty_two_week_change_percent / 100.0) AS change_52w,
      CASE WHEN r.fifty_two_week_high > 0 AND q.last_price > 0 THEN MAX(0, 1 - q.last_price / r.fifty_two_week_high) END AS distance_from_high
    FROM assets a
    LEFT JOIN asset_quote_snapshot q ON q.asset_id = a.id
    LEFT JOIN asset_quote_range r ON r.asset_id = a.id
    LEFT JOIN asset_dividend_snapshot d ON d.asset_id = a.id
    LEFT JOIN asset_profiles p ON p.asset_id = a.id
    LEFT JOIN cache_entries f ON f.scope = 'fundamentals' AND f.key = a.symbol
  )
`;

/** Indices, devises et contrats à terme suivis par la page Marchés : jamais proposés au screener. */
const INVESTABLE_CLAUSE = "quote_type NOT IN ('INDEX', 'CURRENCY', 'FUTURE', 'CRYPTOCURRENCY') AND symbol NOT LIKE '^%' AND instr(symbol, '=') = 0";
const ETF_TYPES = "('ETF', 'MUTUALFUND')";

const SORT_COLUMNS: Record<ScreenerSortKey, string> = {
  name: "name COLLATE NOCASE",
  trailingPE: "trailing_pe",
  dividendYield: "dividend_yield",
  marketCap: "market_cap",
  change52w: "change_52w",
  distanceFromHigh: "distance_from_high"
};

type Bound = [keyof ScreenerFilters, string, ">=" | "<="];

/** Filtres numériques : clé, colonne de la vue, comparaison. */
const NUMERIC_BOUNDS: readonly Bound[] = [
  ["minDividendYield", "dividend_yield", ">="],
  ["minTrailingPE", "trailing_pe", ">="],
  ["maxTrailingPE", "trailing_pe", "<="],
  ["minMarketCap", "market_cap", ">="],
  ["maxMarketCap", "market_cap", "<="],
  ["minChange52w", "change_52w", ">="],
  ["maxChange52w", "change_52w", "<="],
  ["maxDistanceFromHigh", "distance_from_high", "<="]
];

export interface ScreenerSql {
  sql: string;
  params: Record<string, string | number>;
}

export function buildScreenerQuery({ filters, sort, direction }: ScreenerQuery): ScreenerSql {
  const clauses = [INVESTABLE_CLAUSE];
  const params: Record<string, string | number> = {};

  if (filters.assetType === "etf") clauses.push(`quote_type IN ${ETF_TYPES}`);
  if (filters.assetType === "stock") clauses.push(`quote_type NOT IN ${ETF_TYPES}`);
  if (filters.sector) {
    clauses.push("lower(sector) = lower(@sector)");
    params["sector"] = filters.sector;
  }
  if (filters.country) {
    clauses.push("lower(country) = lower(@country)");
    params["country"] = filters.country;
  }
  // Un PER négatif ou nul n'est pas significatif : il ne satisfait aucun filtre de PER.
  if (filters.minTrailingPE !== undefined || filters.maxTrailingPE !== undefined) clauses.push("trailing_pe > 0");
  for (const [key, column, operator] of NUMERIC_BOUNDS) {
    const value = filters[key];
    if (typeof value !== "number") continue;
    clauses.push(`${column} ${operator} @${key}`);
    params[key] = value;
  }

  const column = SORT_COLUMNS[sort];
  const order = direction === "asc" ? "ASC" : "DESC";
  return {
    sql: `${SCREENER_VIEW} SELECT * FROM screened WHERE ${clauses.join(" AND ")} ORDER BY (${column} IS NULL), ${column} ${order}, symbol ASC`,
    params
  };
}

/** Secteurs et pays présents dans la vue, pour alimenter les listes de filtres. */
export const SCREENER_OPTIONS_SQL = {
  sectors: `${SCREENER_VIEW} SELECT DISTINCT sector AS value FROM screened WHERE ${INVESTABLE_CLAUSE} AND sector IS NOT NULL AND sector <> '' ORDER BY sector COLLATE NOCASE`,
  countries: `${SCREENER_VIEW} SELECT DISTINCT country AS value FROM screened WHERE ${INVESTABLE_CLAUSE} AND country IS NOT NULL AND country <> '' ORDER BY country COLLATE NOCASE`
};
