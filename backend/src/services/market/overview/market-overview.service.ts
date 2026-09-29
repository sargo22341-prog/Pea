import type { HistoryPoint, MarketOverviewCategory, MarketOverviewItem, MarketOverviewResponse, Quote } from "@pea/shared";
import { featureFlagsService } from "../../admin/feature-flags.service.js";
import { logger } from "../../shared/logger.service.js";
import { marketDataGateway } from "../data/market-data-gateway.service.js";

/** Symboles suivis par la page Marchés : indices, devise, matières premières et taux de référence. */
const MARKET_OVERVIEW_SYMBOLS: readonly { symbol: string; category: MarketOverviewCategory; key: string }[] = [
  { symbol: "^FCHI", category: "indices", key: "cac40" },
  { symbol: "^STOXX50E", category: "indices", key: "eurostoxx50" },
  { symbol: "^GDAXI", category: "indices", key: "dax" },
  { symbol: "^GSPC", category: "indices", key: "sp500" },
  { symbol: "^IXIC", category: "indices", key: "nasdaq" },
  { symbol: "EURUSD=X", category: "currencies", key: "eurusd" },
  { symbol: "GC=F", category: "commodities", key: "gold" },
  { symbol: "BZ=F", category: "commodities", key: "brent" },
  { symbol: "^TNX", category: "rates", key: "us10y" }
];

/** Période des mini-courbes : un mois, servi par le cache d'historique (frais une heure). */
const SPARKLINE_RANGE = "1m";

function finite(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function sparklinePoints(points: readonly HistoryPoint[]) {
  return points.flatMap((point) => {
    const time = Date.parse(point.date);
    return Number.isFinite(time) && Number.isFinite(point.close) ? [{ t: time, v: point.close }] : [];
  });
}

async function readSparkline(symbol: string) {
  try {
    return sparklinePoints((await marketDataGateway.readHistoryWithCache(symbol, SPARKLINE_RANGE)).data);
  } catch (error) {
    // Une mini-courbe manquante ne doit pas priver la page des cotations.
    logger.warn("market-data", "Mini-courbe Marchés indisponible", { symbol, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

function toOverviewItem(entry: (typeof MARKET_OVERVIEW_SYMBOLS)[number], quote: Quote | undefined, sparkline: MarketOverviewItem["sparkline"]): MarketOverviewItem {
  const price = quote && !quote.unavailable ? finite(quote.price) : undefined;
  return {
    symbol: entry.symbol,
    category: entry.category,
    key: entry.key,
    price: price !== undefined && price > 0 ? price : undefined,
    change: finite(quote?.change),
    changePercent: finite(quote?.changePercent),
    currency: quote?.currency,
    marketState: quote?.marketState,
    sparkline,
    stale: quote?.stale
  };
}

/**
 * Vue d'ensemble des marchés : un seul lot de cotations (cache d'une minute, dédupliqué), puis les
 * mini-courbes. Un symbole que Yahoo ne cote pas est ignoré. 403 sans appel si la page est coupée.
 */
export async function marketOverview(now = new Date()): Promise<MarketOverviewResponse> {
  featureFlagsService.assertEnabled("markets_page");
  const symbols = MARKET_OVERVIEW_SYMBOLS.map((entry) => entry.symbol);
  const quotes = (await marketDataGateway.readQuoteBatchWithCache(symbols)).data;
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  const sparklines = await Promise.all(symbols.map(readSparkline));
  const items = MARKET_OVERVIEW_SYMBOLS
    .map((entry, index) => toOverviewItem(entry, bySymbol.get(entry.symbol.toUpperCase()), sparklines[index] ?? []))
    .filter((item) => item.price !== undefined);
  return { items, updatedAt: now.toISOString() };
}
