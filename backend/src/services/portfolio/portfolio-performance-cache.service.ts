import type { PositionRangePerformance, RangeKey } from "@pea/shared";
import { db } from "../../db.js";
import { chartConfigService, normalizeStoredRange } from "../market/chart-config.service.js";
import { marketEventsService } from "../market/market-events.service.js";
import { nowMs } from "../shared/cache.service.js";

const cacheTtlMs: Partial<Record<RangeKey, number>> = {
  "1d": 5 * 60 * 1000,
  "1w": 60 * 60 * 1000,
  "1m": 4 * 60 * 60 * 1000,
  ytd: 4 * 60 * 60 * 1000,
  "1y": 4 * 60 * 60 * 1000,
  "5y": 12 * 60 * 60 * 1000,
  "10y": 12 * 60 * 60 * 1000,
  all: 12 * 60 * 60 * 1000
};

interface CacheVersions {
  portfolioVersion: string;
  marketDataVersion: string;
}

type ComputePerformance = () => Promise<PositionRangePerformance[]>;

function cacheKey(userId: string | number, range: RangeKey) {
  return `${userId}:${range}`;
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(",");
}

export class PortfolioPerformanceCacheService {
  private inFlight = new Map<string, Promise<PositionRangePerformance[]>>();

  async getOrCompute(input: { userId: string | number; range: RangeKey; compute: ComputePerformance; allowStale?: boolean }) {
    const userId = String(input.userId);
    const versions = this.versions(userId, input.range);
    const key = cacheKey(userId, input.range);
    const cached = this.read(key);
    const portfolioMatches = cached?.portfolioVersion === versions.portfolioVersion;
    const marketMatches = cached?.marketDataVersion === versions.marketDataVersion;

    if (cached && portfolioMatches && marketMatches && cached.expiresAt > nowMs()) {
      return cached.payload;
    }

    if (cached && portfolioMatches && input.allowStale !== false) {
      this.refreshInBackground({ ...input, userId, versions });
      return cached.payload;
    }

    return this.computeAndStore({ ...input, userId, versions, emitEvents: false });
  }

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

  private refreshInBackground(input: { userId: string; range: RangeKey; versions: CacheVersions; compute: ComputePerformance }) {
    const key = cacheKey(input.userId, input.range);
    if (this.inFlight.has(key)) return;
    marketEventsService.emitToUser(input.userId, "portfolio-performance-refresh-started", { range: input.range, startedAt: new Date().toISOString() });
    void this.computeAndStore({ ...input, emitEvents: true }).catch(() => undefined);
  }

  private computeAndStore(input: { userId: string; range: RangeKey; versions: CacheVersions; compute: ComputePerformance; emitEvents: boolean }) {
    const key = cacheKey(input.userId, input.range);
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = input.compute().then((payload) => {
      const cachedAt = nowMs();
      const versions = this.versions(input.userId, input.range);
      const expiresAt = cachedAt + (cacheTtlMs[input.range] ?? 4 * 60 * 60 * 1000);
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
      ).run(key, input.userId, input.range, versions.portfolioVersion, versions.marketDataVersion, JSON.stringify(payload), cachedAt, expiresAt, new Date(cachedAt).toISOString());
      if (input.emitEvents) {
        marketEventsService.emitToUser(input.userId, "portfolio-performance-updated", { range: input.range, updatedAt: new Date().toISOString() });
      }
      return payload;
    }).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  private read(key: string) {
    const row = db.prepare(
      `SELECT payload, portfolio_version, market_data_version, cached_at, expires_at
       FROM portfolio_positions_performance_cache
       WHERE cache_key = ?`
    ).get(key) as
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

  private versions(userId: string, range: RangeKey): CacheVersions {
    const positionRows = db.prepare("SELECT id, symbol, updated_at FROM positions WHERE user_id = ? ORDER BY id").all(userId) as Array<{ id: number; symbol: string; updated_at: string }>;
    if (!positionRows.length) return { portfolioVersion: "empty", marketDataVersion: "empty" };

    const positionIds = positionRows.map((row) => row.id);
    const symbols = positionRows.map((row) => row.symbol.toUpperCase());
    const txStats = db.prepare(
      `SELECT COUNT(*) AS count, COALESCE(MAX(id), 0) AS max_id, COALESCE(MAX(traded_at), '') AS max_traded_at
       FROM transactions
       WHERE position_id IN (${placeholders(positionIds)})`
    ).get(...positionIds) as { count: number; max_id: number; max_traded_at: string };
    const portfolioVersion = JSON.stringify({
      positions: positionRows.map((row) => `${row.id}:${row.symbol}:${row.updated_at}`),
      txCount: Number(txStats.count ?? 0),
      txMaxId: Number(txStats.max_id ?? 0),
      txMaxTradedAt: String(txStats.max_traded_at ?? "")
    });

    const assetRows = db.prepare(`SELECT id, symbol FROM assets WHERE symbol IN (${placeholders(symbols)})`).all(...symbols) as Array<{ id: number; symbol: string }>;
    const assetIds = assetRows.map((row) => row.id);
    if (!assetIds.length) return { portfolioVersion, marketDataVersion: "no-assets" };

    const snapshotStats = db.prepare(
      `SELECT COALESCE(MAX(updated_at), '') AS updated_at, COALESCE(MAX(last_checked_at), '') AS last_checked_at
       FROM asset_market_snapshots
       WHERE asset_id IN (${placeholders(assetIds)})`
    ).get(...assetIds) as { updated_at: string; last_checked_at: string };
    const storedRange = normalizeStoredRange(range);
    const table = `chart_candles_${storedRange}`;
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const candleStats = db.prepare(
      `SELECT COALESCE(MAX(updated_at), '') AS updated_at, COUNT(*) AS count
       FROM ${table}
       WHERE asset_id IN (${placeholders(assetIds)}) AND interval = ?`
    ).get(...assetIds, interval) as { updated_at: string; count: number };

    return {
      portfolioVersion,
      marketDataVersion: JSON.stringify({
        snapshotsUpdatedAt: String(snapshotStats.updated_at ?? ""),
        snapshotsCheckedAt: String(snapshotStats.last_checked_at ?? ""),
        candleRange: storedRange,
        candleInterval: interval,
        candleUpdatedAt: String(candleStats.updated_at ?? ""),
        candleCount: Number(candleStats.count ?? 0)
      })
    };
  }
}

export const portfolioPerformanceCache = new PortfolioPerformanceCacheService();
