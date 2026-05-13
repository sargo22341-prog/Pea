import type { PositionRangePerformance, RangeKey } from "@pea/shared";
import { portfolioPerformanceCacheRepository } from "../../repositories/portfolio/portfolio-performance-cache.repository.js";
import { chartConfigService, normalizeStoredRange } from "../market/charts/chart-config.service.js";
import { marketEventsService } from "../market/events/market-events.service.js";
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

export class PortfolioPerformanceCacheService {
  private inFlight = new Map<string, Promise<PositionRangePerformance[]>>();

  async getOrCompute(input: { userId: string | number; range: RangeKey; compute: ComputePerformance; allowStale?: boolean }) {
    const userId = String(input.userId);
    const versions = this.versions(userId, input.range);
    const key = cacheKey(userId, input.range);
    const cached = this.read(key);
    const hasMiniCharts = cached?.payload.every((item) => item.miniChart && Array.isArray(item.miniChart.points)) ?? false;
    const portfolioMatches = cached?.portfolioVersion === versions.portfolioVersion;
    const marketMatches = cached?.marketDataVersion === versions.marketDataVersion;

    if (cached && hasMiniCharts && portfolioMatches && marketMatches && cached.expiresAt > nowMs()) {
      return cached.payload;
    }

    if (cached && hasMiniCharts && portfolioMatches && input.allowStale !== false) {
      this.refreshInBackground({ ...input, userId, versions });
      return cached.payload;
    }

    return this.computeAndStore({ ...input, userId, versions, emitEvents: false });
  }

  invalidate(input: { userId?: string | number; range?: RangeKey }) {
    portfolioPerformanceCacheRepository.invalidate(input);
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
      portfolioPerformanceCacheRepository.upsert({
        cacheKey: key,
        userId: input.userId,
        range: input.range,
        portfolioVersion: versions.portfolioVersion,
        marketDataVersion: versions.marketDataVersion,
        payload,
        cachedAt,
        expiresAt
      });
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
    return portfolioPerformanceCacheRepository.read(key);
  }

  private versions(userId: string, range: RangeKey): CacheVersions {
    const positionRows = portfolioPerformanceCacheRepository.listPortfolioVersionPositions(userId);
    if (!positionRows.length) return { portfolioVersion: "empty", marketDataVersion: "empty" };

    const positionIds = positionRows.map((row) => row.id);
    const symbols = positionRows.map((row) => row.symbol.toUpperCase());
    const txStats = portfolioPerformanceCacheRepository.transactionVersionStats(positionIds);
    const portfolioVersion = JSON.stringify({
      positions: positionRows.map((row) => `${row.id}:${row.symbol}:${row.updated_at}`),
      txCount: Number(txStats.count ?? 0),
      txMaxId: Number(txStats.max_id ?? 0),
      txMaxTradedAt: String(txStats.max_traded_at ?? "")
    });

    const assetRows = portfolioPerformanceCacheRepository.assetRows(symbols);
    const assetIds = assetRows.map((row) => row.id);
    if (!assetIds.length) return { portfolioVersion, marketDataVersion: "no-assets" };

    const snapshotStats = portfolioPerformanceCacheRepository.snapshotStats(assetIds);
    const storedRange = normalizeStoredRange(range);
    const table = `chart_candles_${storedRange}`;
    const interval = chartConfigService.getIntervalForRange(storedRange);
    const candleStats = portfolioPerformanceCacheRepository.candleStats({ table, assetIds, interval });

    return {
      portfolioVersion,
      marketDataVersion: JSON.stringify({
        snapshotsUpdatedAt: String(snapshotStats.updated_at ?? ""),
        snapshotsCheckedAt: String(snapshotStats.last_checked_at ?? ""),
        candleRange: storedRange,
        candleInterval: interval,
        candleUpdatedAt: String(candleStats.updated_at ?? ""),
        candleCount: Number(candleStats.count ?? 0),
        positionRangeFormula: "snapshot-day-change-v5-mini-chart"
      })
    };
  }
}

export const portfolioPerformanceCache = new PortfolioPerformanceCacheService();
