/**
 * Role du fichier : supprimer uniquement les donnees marche reconstruites par
 * range avant une reconstruction ciblee. Les utilisateurs, transactions,
 * positions, watchlist, preferences et dividendes utilisateur ne sont pas touches.
 */

import { db } from "../../db.js";
import type { StoredChartRange } from "./chart-config.service.js";
import { assetRepository } from "./asset.repository.js";
import { dataConstructionQueue } from "./data-construction-queue.service.js";
import { logger } from "../shared/logger.service.js";

export type MarketDataRebuildRange = StoredChartRange | "all_ranges";

const storedRanges: StoredChartRange[] = ["1d", "1w", "1m", "all"];
const displayRangesByStoredRange: Record<StoredChartRange, string[]> = {
  "1d": ["intraday"],
  "1w": ["1W"],
  "1m": ["1M"],
  all: ["YTD", "1Y", "5Y", "10Y", "ALL"]
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

function runDelete(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...params);
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
    const rows = db
      .prepare(
        `SELECT a.id, a.symbol
         FROM assets a
         LEFT JOIN positions p ON p.symbol = a.symbol
         LEFT JOIN watchlist w ON w.symbol = a.symbol
         WHERE p.id IS NULL AND w.id IS NULL
         ORDER BY a.symbol ASC`
      )
      .all() as Array<{ id: number; symbol: string }>;

    const deleted: Array<{ table: string; rows: number }> = [];
    if (rows.length) {
      const ids = rows.map((row) => Number(row.id));
      const symbols = rows.map((row) => String(row.symbol).toUpperCase());
      const idPlaceholders = ids.map(() => "?").join(",");
      const symbolPlaceholders = symbols.map(() => "?").join(",");

      for (const table of ["chart_candles_1d", "chart_candles_1w", "chart_candles_1m", "chart_candles_all", "market_data_finalizations", "asset_market_snapshots", "asset_profiles", "asset_financials", "asset_dividends"]) {
        deleted.push({ table, rows: runDelete(`DELETE FROM ${table} WHERE asset_id IN (${idPlaceholders})`, ...ids) });
      }

      for (const table of ["cached_history", "cached_intraday_history", "asset_static_cache", "asset_market_cache", "asset_chart_cache", "asset_dividend_cache", "asset_article_cache", "asset_icons"]) {
        deleted.push({ table, rows: runDelete(`DELETE FROM ${table} WHERE symbol IN (${symbolPlaceholders})`, ...symbols) });
      }

      deleted.push({ table: "assets", rows: runDelete(`DELETE FROM assets WHERE id IN (${idPlaceholders})`, ...ids) });
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
    const displayRanges = ranges.flatMap((range) => displayRangesByStoredRange[range]);
    const historicalCacheRanges = ranges.flatMap((range) => historicalCacheRangesByStoredRange[range]);
    const deleted: Array<{ table: string; rows: number }> = [];

    for (const range of ranges) {
      deleted.push({
        table: `chart_candles_${range}`,
        rows: runDelete(`DELETE FROM chart_candles_${range}`)
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
