import type { PositionRangePerformance, RangeKey } from "@pea/shared";
import { db } from "../../db.js";

export interface PortfolioPerformanceCacheRow {
  payload: PositionRangePerformance[];
  portfolioVersion: string;
  marketDataVersion: string;
  cachedAt: number;
  expiresAt: number;
}

export interface PortfolioVersionPositionRow {
  id: number;
  symbol: string;
  updated_at: string;
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(",");
}

export class PortfolioPerformanceCacheRepository {
  invalidate(input: { userId?: string | number; range?: RangeKey }) {
    if (input.userId && input.range) {
      db.prepare("DELETE FROM portfolio_positions_performance_cache WHERE user_id = ? AND range = ?").run(String(input.userId), input.range);
      return;
    }
    if (input.userId) {
      db.prepare("DELETE FROM portfolio_positions_performance_cache WHERE user_id = ?").run(String(input.userId));
      return;
    }
    if (input.range) {
      db.prepare("DELETE FROM portfolio_positions_performance_cache WHERE range = ?").run(input.range);
      return;
    }
    db.prepare("DELETE FROM portfolio_positions_performance_cache").run();
  }

  read(cacheKey: string): PortfolioPerformanceCacheRow | undefined {
    const row = db.prepare(
      `SELECT payload, portfolio_version, market_data_version, cached_at, expires_at
       FROM portfolio_positions_performance_cache
       WHERE cache_key = ?`
    ).get(cacheKey) as
      | { payload: string; portfolio_version: string; market_data_version: string; cached_at: number; expires_at: number }
      | undefined;
    if (!row) return undefined;
    return {
      payload: JSON.parse(row.payload) as PositionRangePerformance[],
      portfolioVersion: row.portfolio_version,
      marketDataVersion: row.market_data_version,
      cachedAt: Number(row.cached_at),
      expiresAt: Number(row.expires_at)
    };
  }

  upsert(input: {
    cacheKey: string;
    userId: string;
    range: RangeKey;
    portfolioVersion: string;
    marketDataVersion: string;
    payload: PositionRangePerformance[];
    cachedAt: number;
    expiresAt: number;
  }) {
    db.prepare(
      `INSERT INTO portfolio_positions_performance_cache (
        cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        portfolio_version = excluded.portfolio_version,
        market_data_version = excluded.market_data_version,
        payload = excluded.payload,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`
    ).run(
      input.cacheKey,
      input.userId,
      input.range,
      input.portfolioVersion,
      input.marketDataVersion,
      JSON.stringify(input.payload),
      input.cachedAt,
      input.expiresAt,
      new Date(input.cachedAt).toISOString()
    );
  }

  listPortfolioVersionPositions(userId: string): PortfolioVersionPositionRow[] {
    return db.prepare("SELECT id, symbol, updated_at FROM positions WHERE user_id = ? ORDER BY id").all(userId) as PortfolioVersionPositionRow[];
  }

  transactionVersionStats(positionIds: number[]) {
    return db.prepare(
      `SELECT COUNT(*) AS count, COALESCE(MAX(id), 0) AS max_id, COALESCE(MAX(traded_at), '') AS max_traded_at
       FROM transactions
       WHERE position_id IN (${placeholders(positionIds)})`
    ).get(...positionIds) as { count: number; max_id: number; max_traded_at: string };
  }

  assetRows(symbols: string[]) {
    return db.prepare(`SELECT id, symbol FROM assets WHERE symbol IN (${placeholders(symbols)})`).all(...symbols) as Array<{ id: number; symbol: string }>;
  }

  snapshotStats(assetIds: number[]) {
    return db.prepare(
      `SELECT COALESCE(MAX(updated_at), '') AS updated_at, COALESCE(MAX(last_checked_at), '') AS last_checked_at
       FROM asset_market_snapshots
       WHERE asset_id IN (${placeholders(assetIds)})`
    ).get(...assetIds) as { updated_at: string; last_checked_at: string };
  }

  candleStats(input: { table: string; assetIds: number[]; interval: string }) {
    return db.prepare(
      `SELECT COALESCE(MAX(updated_at), '') AS updated_at, COUNT(*) AS count
       FROM ${input.table}
       WHERE asset_id IN (${placeholders(input.assetIds)}) AND interval = ?`
    ).get(...input.assetIds, input.interval) as { updated_at: string; count: number };
  }
}

export const portfolioPerformanceCacheRepository = new PortfolioPerformanceCacheRepository();
