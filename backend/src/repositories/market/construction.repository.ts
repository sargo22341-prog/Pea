import { db } from "../../db.js";
import type { StoredChartRange } from "../../services/market/charts/chart-config.service.js";
import { unifiedCacheRepository, type CacheScope } from "../cache/unified-cache.repository.js";

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
    const key = symbol.toUpperCase();
    unifiedCacheRepository.deleteEntry("fundamentals", key);
    // Les sous-clés dérivées (`${key}:annual-financials`) tombent aussi.
    unifiedCacheRepository.deleteKeysWithPrefix("fundamentals", `${key}:`);
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

    // cached_intraday_history reste séparé (logique sliding window par trading_day).
    deleted.push({ table: "cached_intraday_history", rows: runDelete(`DELETE FROM cached_intraday_history WHERE symbol IN (${symbolPlaceholders})`, ...symbols) });
    deleted.push({ table: "asset_icons", rows: runDelete(`DELETE FROM asset_icons WHERE symbol IN (${symbolPlaceholders})`, ...symbols) });

    // cache_entries : purger toutes les clés qui matchent le symbole (quote/dividends/news/fundamentals/asset_article)
    // ainsi que les clés history qui commencent par `${symbol}:`.
    const directScopes: CacheScope[] = ["quote", "dividends", "news", "fundamentals", "asset_article"];
    const directlyDeleted = unifiedCacheRepository.deleteKeysInScopes(directScopes, symbols);
    let prefixedDeleted = 0;
    for (const symbol of symbols) {
      const prefix = `${symbol}:`;
      prefixedDeleted += unifiedCacheRepository.deleteKeysWithPrefix("history", prefix);
      prefixedDeleted += unifiedCacheRepository.deleteKeysWithPrefix("fundamentals", prefix);
    }
    deleted.push({ table: "cache_entries", rows: directlyDeleted + prefixedDeleted });

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
      // Purge ciblée des clés `cache_entries` scope=history dont la clé contient `:${range}:`.
      // Format des clés : `${SYMBOL}:${range}:${interval}`.
      let historyDeleted = 0;
      for (const range of input.historicalCacheRanges) {
        historyDeleted += db.prepare("DELETE FROM cache_entries WHERE scope = 'history' AND key LIKE ?").run(`%:${range}:%`);
      }
      deleted.push({ table: "cache_entries:history", rows: historyDeleted });

      const rangePlaceholders = placeholders(input.historicalCacheRanges);
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
