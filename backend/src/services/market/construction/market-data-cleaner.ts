import type { StoredChartRange } from "../charts/chart-config.service.js";
import { assetRepository } from "../../../repositories/market/asset.repository.js";
import { marketDataConstructionRepository } from "../../../repositories/market/construction.repository.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";
import { logger } from "../../shared/logger.service.js";

export type MarketDataRebuildRange = StoredChartRange | "all_ranges";

const storedRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
const apiRangesByStoredRange: Record<StoredChartRange, string[]> = {
  "1d": ["1d"],
  "1w": ["1w"],
  "1m": ["1m"],
  all: ["ytd", "1y", "5y", "10y", "all"]
};
const historicalCacheRangesByStoredRange: Record<StoredChartRange, string[]> = {
  "1d": ["1d"],
  "1w": ["1w"],
  "1m": ["1m"],
  all: ["ytd", "1y", "5y", "10y", "all"]
};

function rangesForRebuild(range: MarketDataRebuildRange): StoredChartRange[] {
  return range === "all_ranges" ? storedRanges : [range];
}

function nowIso() {
  return new Date().toISOString();
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

  /**
   * Supprime les assets explores qui ne sont ni en portefeuille ni en watchlist.
   * Les positions, transactions, preferences utilisateur et assets suivis sont
   * exclus de la selection avant toute suppression.
   */
  cleanupUnlinkedAssets() {
    const rows = marketDataConstructionRepository.unlinkedAssets();
    const deleted = marketDataConstructionRepository.cleanupUnlinkedAssets(rows);
    if (rows.length) {
      const symbols = rows.map((row) => String(row.symbol).toUpperCase());
      logger.info("market-data", "unlinked assets cleaned", { assets: symbols, deleted });
    }

    const timestamp = nowIso();
    return {
      id: `cleanup-unlinked-assets-${Date.now()}`,
      totalTasks: rows.length,
      completedTasks: rows.length,
      failedTasks: 0,
      pendingTasks: 0,
      status: "success" as const,
      progressPercent: 100,
      currentMessage: rows.length
        ? `${rows.length} asset(s) non lies supprimes`
        : "Aucun asset non lie a supprimer",
      errors: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted,
      symbols: rows.map((row) => row.symbol)
    };
  }

  private deleteRanges(ranges: StoredChartRange[]) {
    const apiRanges = [...new Set(ranges.flatMap((range) => apiRangesByStoredRange[range]))];
    const historicalCacheRanges = ranges.flatMap((range) => historicalCacheRangesByStoredRange[range]);
    return marketDataConstructionRepository.deleteRanges({ ranges, historicalCacheRanges, apiRanges });
  }
}

export const marketDataCleaner = new MarketDataCleaner();
