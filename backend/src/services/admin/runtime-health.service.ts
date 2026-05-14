import type { RuntimeHealthDto } from "@pea/shared";
import { db } from "../../db.js";
import { rateLimitStats } from "../../middleware/rate-limit.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { previousOpenMarketDaysCacheStats } from "../market/calendars/marketCalendar.service.js";
import { intradayChartMemoryStats } from "../market/charts/market-chart.helpers.js";
import { marketEventsService } from "../market/events/market-events.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { authFailureTracker } from "../auth/auth-failure-tracker.js";
import { cacheCleanupService } from "../shared/cache-cleanup.service.js";
import { inFlightDeduperStats } from "../shared/inFlightDeduper.js";
import { yahooCircuitBreaker } from "../yahoo/circuit-breaker.js";
import { yahooQuoteMemoryStats } from "../yahoo/quotes/quote.job.js";
import { yahooUsageService } from "../yahoo/yahoo-usage.service.js";
import { marketScheduler } from "../../schedulers/market-scheduler.service.js";

type CountRow = { count: number };
type CacheScopeRow = { scope: string; rows: number; expired_rows: number };

function count(sql: string, ...params: unknown[]) {
  const row = db.prepare(sql).get(...params) as CountRow | undefined;
  return Number(row?.count ?? 0);
}

function ageMs(value?: string | null, nowMs = Date.now()) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, nowMs - time) : undefined;
}

function msToIso(value: number) {
  return value > 0 ? new Date(value).toISOString() : null;
}

export class RuntimeHealthService {
  snapshot(now = new Date()): RuntimeHealthDto {
    const nowMs = now.getTime();
    const queue = dataConstructionQueue.runtimeStats();
    const scheduler = marketScheduler.runtimeStats(now);
    const inFlight = inFlightDeduperStats();
    const yahooMemory = yahooQuoteMemoryStats();
    const breaker = yahooCircuitBreaker.snapshot();
    const yahooUsage = yahooUsageService.stats({ limit: 5 });

    return {
      generatedAt: now.toISOString(),
      cache: this.cacheStats(nowMs),
      memory: {
        ...intradayChartMemoryStats(),
        ...marketSnapshotService.stats(),
        ...previousOpenMarketDaysCacheStats(),
        backendInFlightRequests: inFlight.inFlightRequests,
        yahooSearchCacheEntries: yahooMemory.searchCacheEntries,
        yahooQuoteCombineCacheEntries: yahooMemory.quoteCombineCacheEntries,
        rateLimitBuckets: rateLimitStats().buckets,
        authFailureEntries: authFailureTracker.stats().entries,
        sseClients: marketEventsService.stats().clients
      },
      queue: {
        pending: queue.pending,
        running: queue.running,
        failed: queue.failed,
        completed: queue.completed,
        oldestPendingAgeMs: ageMs(queue.oldest_pending_at, nowMs),
        oldestRunningAgeMs: ageMs(queue.oldest_running_at, nowMs),
        activeWorkers: queue.activeWorkers,
        maxConcurrentTasks: queue.maxConcurrentTasks,
        busySymbols: queue.busySymbols,
        byTypePriority: queue.by_type_priority.map((row) => ({
          type: row.type,
          priority: row.priority,
          pending: row.pending,
          running: row.running,
          failed: row.failed,
          completed: row.completed
        }))
      },
      scheduler: {
        lastTickAt: scheduler.lastTickAt,
        lastTickDurationMs: scheduler.lastTickDurationMs,
        lastSuccessAt: scheduler.lastSuccessAt,
        lastError: scheduler.lastError,
        lockOwner: scheduler.lockOwner,
        heartbeatAgeMs: scheduler.heartbeatAgeMs,
        trackedMarkets: scheduler.trackedMarkets,
        nextTickAt: scheduler.nextTickAt,
        running: scheduler.running,
        status: scheduler.status
      },
      yahoo: {
        circuitBreaker: {
          state: breaker.state,
          failureCount: breaker.consecutiveFailures,
          openedAt: msToIso(breaker.openedAt),
          nextAttemptAt: msToIso(breaker.nextAttemptAt)
        },
        recentCalls24h: yahooUsage.summary.calls24h,
        recentErrors: yahooUsage.recentErrors,
        backendInFlightRequests: inFlight.inFlightRequests,
        searchCacheEntries: yahooMemory.searchCacheEntries,
        quoteCombineCacheEntries: yahooMemory.quoteCombineCacheEntries
      }
    };
  }

  private cacheStats(nowMs: number): RuntimeHealthDto["cache"] {
    const rows = db
      .prepare(
        `SELECT scope,
                COUNT(*) AS rows,
                SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired_rows
         FROM cache_entries
         GROUP BY scope
         ORDER BY scope`
      )
      .all(nowMs) as CacheScopeRow[];

    return {
      cacheEntries: {
        totalRows: count("SELECT COUNT(*) AS count FROM cache_entries"),
        expiredRows: count("SELECT COUNT(*) AS count FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ?", nowMs),
        byScope: rows.map((row) => ({
          scope: row.scope,
          rows: Number(row.rows ?? 0),
          expiredRows: Number(row.expired_rows ?? 0)
        }))
      },
      derivedCaches: {
        portfolioChartCacheRows: count("SELECT COUNT(*) AS count FROM portfolio_chart_cache"),
        portfolioPositionsPerformanceCacheRows: count("SELECT COUNT(*) AS count FROM portfolio_positions_performance_cache"),
        frontendBlockCacheRows: count("SELECT COUNT(*) AS count FROM frontend_block_cache")
      },
      cleanup: cacheCleanupService.stats()
    };
  }
}

export const runtimeHealthService = new RuntimeHealthService();
