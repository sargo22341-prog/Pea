/**
 * Role du fichier : supprimer uniquement les donnees marche reconstruites par
 * range avant une reconstruction ciblee. Les utilisateurs, transactions,
 * positions, watchlist, preferences et dividendes utilisateur ne sont pas touches.
 */

import { db } from "../../db.js";
import type { StoredChartRange } from "./chart-config.service.js";
import { assetRepository } from "./asset.repository.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";

export type MarketDataRebuildRange = StoredChartRange | "all_ranges";

const storedRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
const displayRangesByStoredRange: Record<StoredChartRange, string[]> = {
  "1d": ["intraday"],
  "1w": ["1W"],
  "1m": ["1M"],
  all: ["YTD", "1Y", "5Y", "10Y", "ALL", "MAX"]
};
const historicalCacheRangesByStoredRange: Record<StoredChartRange, string[]> = {
  "1d": ["1d"],
  "1w": ["1w"],
  "1m": ["1m"],
  all: ["ytd", "1y", "5y", "10y", "all", "max"]
};

function rangesForRebuild(range: MarketDataRebuildRange): StoredChartRange[] {
  return range === "all_ranges" ? storedRanges : [range];
}

function runDelete(sql: string, ...params: string[]) {
  return db.prepare(sql).run(...params);
}

export class MarketDataCleaner {
  /**
   * Supprime les candles et caches chart d'une range puis planifie sa
   * reconstruction Yahoo pour tous les assets suivis.
   */
  rebuildMarketData(options: { range: MarketDataRebuildRange }) {
    const ranges = rangesForRebuild(options.range);
    const symbols = assetRepository.listTrackedSymbols();
    const deleted = this.deleteRanges(ranges);
    const job = dataConstructionQueue.enqueueMarketDataRebuild(symbols, ranges, { force: true });
    return { ...job, deleted };
  }

  private deleteRanges(ranges: StoredChartRange[]) {
    const displayRanges = ranges.flatMap((range) => displayRangesByStoredRange[range]);
    const historicalCacheRanges = ranges.flatMap((range) => historicalCacheRangesByStoredRange[range]);
    const deleted: Array<{ table: string; rows: number }> = [];

    for (const range of ranges) {
      deleted.push({
        table: `chart_candles:${range}`,
        rows: runDelete("DELETE FROM chart_candles WHERE range = ?", range)
      });
      deleted.push({
        table: `market_data_finalizations:${range}`,
        rows: runDelete("DELETE FROM market_data_finalizations WHERE range = ?", range)
      });
    }

    if (historicalCacheRanges.length) {
      const placeholders = historicalCacheRanges.map(() => "?").join(",");
      deleted.push({
        table: "cached_history",
        rows: runDelete(`DELETE FROM cached_history WHERE range IN (${placeholders})`, ...historicalCacheRanges)
      });
      deleted.push({
        table: "cached_intraday_history",
        rows: runDelete(`DELETE FROM cached_intraday_history WHERE range IN (${placeholders})`, ...historicalCacheRanges)
      });
    }

    if (displayRanges.length) {
      const placeholders = displayRanges.map(() => "?").join(",");
      deleted.push({
        table: "asset_chart_cache",
        rows: runDelete(`DELETE FROM asset_chart_cache WHERE range IN (${placeholders})`, ...displayRanges)
      });
      deleted.push({
        table: "portfolio_chart_cache",
        rows: runDelete(`DELETE FROM portfolio_chart_cache WHERE range IN (${placeholders})`, ...displayRanges)
      });
    }

    return deleted;
  }
}

export const marketDataCleaner = new MarketDataCleaner();
