import { db } from "../../db.js";
import type { StoredChartRange } from "../../services/market/charts/chart-config.service.js";

export interface DeleteResult {
  table: string;
  rows: number;
}

export interface UnlinkedAssetRow {
  id: number;
  symbol: string;
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(",");
}

function runDelete(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...params);
}

export class MarketDataConstructionRepository {
  clearCachedFundamentals(symbol: string) {
    db.prepare("DELETE FROM cached_fundamentals WHERE symbol = ?").run(symbol.toUpperCase());
  }

  unlinkedAssets(): UnlinkedAssetRow[] {
    return db
      .prepare(
        `SELECT a.id, a.symbol
         FROM assets a
         LEFT JOIN positions p ON p.symbol = a.symbol
         LEFT JOIN watchlist w ON w.symbol = a.symbol
         WHERE p.id IS NULL AND w.id IS NULL
         ORDER BY a.symbol ASC`
      )
      .all() as UnlinkedAssetRow[];
  }

  cleanupUnlinkedAssets(rows: UnlinkedAssetRow[]): DeleteResult[] {
    const deleted: DeleteResult[] = [];
    if (!rows.length) return deleted;
    const ids = rows.map((row) => Number(row.id));
    const symbols = rows.map((row) => String(row.symbol).toUpperCase());
    const idPlaceholders = placeholders(ids);
    const symbolPlaceholders = placeholders(symbols);

    for (const table of ["chart_candles_1d", "chart_candles_1w", "chart_candles_1m", "chart_candles_all", "market_data_finalizations", "asset_market_snapshots", "asset_profiles", "asset_financials", "asset_dividends"]) {
      deleted.push({ table, rows: runDelete(`DELETE FROM ${table} WHERE asset_id IN (${idPlaceholders})`, ...ids) });
    }

    for (const table of ["cached_history", "cached_intraday_history", "asset_article_cache", "asset_icons"]) {
      deleted.push({ table, rows: runDelete(`DELETE FROM ${table} WHERE symbol IN (${symbolPlaceholders})`, ...symbols) });
    }

    deleted.push({ table: "assets", rows: runDelete(`DELETE FROM assets WHERE id IN (${idPlaceholders})`, ...ids) });
    return deleted;
  }

  deleteRanges(input: { ranges: StoredChartRange[]; historicalCacheRanges: string[]; apiRanges: string[] }): DeleteResult[] {
    const deleted: DeleteResult[] = [];
    for (const range of input.ranges) {
      deleted.push({
        table: `chart_candles_${range}`,
        rows: runDelete(`DELETE FROM chart_candles_${range}`)
      });
      deleted.push({
        table: `market_data_finalizations:${range}`,
        rows: runDelete("DELETE FROM market_data_finalizations WHERE range = ?", range)
      });
    }

    if (input.historicalCacheRanges.length) {
      const rangePlaceholders = placeholders(input.historicalCacheRanges);
      deleted.push({
        table: "cached_history",
        rows: runDelete(`DELETE FROM cached_history WHERE range IN (${rangePlaceholders})`, ...input.historicalCacheRanges)
      });
      deleted.push({
        table: "cached_intraday_history",
        rows: runDelete(`DELETE FROM cached_intraday_history WHERE range IN (${rangePlaceholders})`, ...input.historicalCacheRanges)
      });
    }

    if (input.apiRanges.length) {
      const apiPlaceholders = placeholders(input.apiRanges);
      deleted.push({
        table: "portfolio_chart_cache",
        rows: runDelete(`DELETE FROM portfolio_chart_cache WHERE range IN (${apiPlaceholders})`, ...input.apiRanges)
      });
      deleted.push({
        table: "portfolio_positions_performance_cache",
        rows: runDelete(`DELETE FROM portfolio_positions_performance_cache WHERE range IN (${apiPlaceholders})`, ...input.apiRanges)
      });
    }

    deleted.push({
      table: "frontend_block_cache",
      rows: runDelete("DELETE FROM frontend_block_cache")
    });

    return deleted;
  }
}

export const marketDataConstructionRepository = new MarketDataConstructionRepository();
