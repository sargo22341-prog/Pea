import type { TrackedMarketDto, TrackedMarketsSettingsDto } from "@pea/shared";
import { logger } from "../services/shared/logger.service.js";
import { config } from "../config.js";
import { chartConfigService } from "../services/market/charts/chart-config.service.js";
import { liveMarketRefreshTask } from "../jobs/market/live-market-refresh.task.js";
import { marketOpenTask } from "../jobs/market/market-open.task.js";
import { marketCloseTask } from "../jobs/market/market-close.task.js";
import { marketLogRepository } from "../repositories/market/market-log.repository.js";
import { marketRunRepository, type MarketDailyRunRow } from "../repositories/market/market-run.repository.js";
import { schedulerLockRepository } from "../repositories/market/scheduler-lock.repository.js";
import { schedulerHealthRepository } from "../repositories/market/scheduler-health.repository.js";
import { trackedMarketRepository, type TrackedMarketRow } from "../repositories/market/tracked-market.repository.js";
import { weeklyRefreshTask } from "../jobs/market/weekly-refresh.task.js";
import { CLOSE_BUFFER_MINUTES, expectedTimes, isWeekend, localTradingDate, minutesAfter, type MarketSchedule } from "./market-task.utils.js";
import { runWithYahooUsageSource } from "../services/yahoo/yahoo-usage-context.js";

const schedulerName = "market-scheduler";
const tickIntervalMs = 5 * 60 * 1000;
const tickLockTtlMs = 4 * 60 * 1000;

export class MarketSchedulerService {
  private timer?: NodeJS.Timeout;
  private running = false;

  start() {
    if (this.timer) return;
    trackedMarketRepository.syncFromTrackedAssets();
    this.timer = setInterval(() => void this.tick(), tickIntervalMs);
    void this.tick();
    logger.info("market-data", "market scheduler started", {
      intervalMs: tickIntervalMs,
      liveRefreshEnabled: config.enableMarketLiveRefresh,
      snapshotsIntervalMs: chartConfigService.getSnapshotRefreshIntervalMs(),
      portfolioChartsIntervalMs: chartConfigService.getPortfolioChartRefreshIntervalMs()
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(now = new Date()) {
    if (this.running) return;
    const lease = schedulerLockRepository.acquire(`${schedulerName}:tick`, tickLockTtlMs, now.getTime());
    if (!lease) {
      logger.debug("market-data", "market scheduler tick skipped because lock is held");
      return;
    }
    this.running = true;
    schedulerHealthRepository.markTick(schedulerName, now);
    try {
      const groups = trackedMarketRepository.syncFromTrackedAssets();
      for (const group of groups.values()) {
        await runWithYahooUsageSource(`tache scheduler: market-open:${group.marketKey}`, () => marketOpenTask.run(group, now));
        await runWithYahooUsageSource(`tache scheduler: market-close:${group.marketKey}`, () => marketCloseTask.run(group, now));
      }
      await runWithYahooUsageSource("tache scheduler: live-market-refresh", () => liveMarketRefreshTask.run(groups.values(), now));
      await runWithYahooUsageSource("tache scheduler: weekly-refresh", () => weeklyRefreshTask.run(now));
      marketLogRepository.cleanupOlderThan(90, now);
      schedulerHealthRepository.markSuccess(schedulerName, now);
    } catch (error) {
      schedulerHealthRepository.markError(schedulerName, error, now);
      logger.error("market-data", "market scheduler tick failed", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.running = false;
      schedulerLockRepository.release(lease);
    }
  }

  getSettings(now = new Date()): TrackedMarketsSettingsDto {
    trackedMarketRepository.syncFromTrackedAssets();
    const markets = trackedMarketRepository.listAll();
    const runs = new Map(marketRunRepository.listLatest().map((run) => [run.market_key, run]));
    const marketDtos = markets.map((market) => this.toDto(market, runs.get(market.market_key), now));
    return {
      nextTask: this.computeNextTask(markets, runs, now),
      markets: marketDtos,
      health: schedulerHealthRepository.get(schedulerName) ?? {
        scheduler_name: schedulerName,
        last_tick_at: null,
        last_successful_tick_at: null,
        last_error: null,
        updated_at: new Date(0).toISOString()
      }
    };
  }

  private toDto(market: TrackedMarketRow, run: MarketDailyRunRow | undefined, now: Date): TrackedMarketDto {
    const currentRun = this.visibleRun(market, run, now);
    return {
      marketKey: market.market_key,
      displayName: market.display_name,
      timezone: market.timezone,
      tradingDate: currentRun?.trading_date ?? "",
      assetsCount: market.assets_count,
      enabled: Boolean(market.enabled),
      openExpectedAt: currentRun?.open_expected_at ?? null,
      openConfirmedAt: currentRun?.open_confirmed_at ?? null,
      openLastCheckedAt: currentRun?.open_last_checked_at ?? null,
      nextOpenCheckAt: currentRun?.next_open_check_at ?? null,
      openStatus: currentRun?.open_status ?? "pending",
      openMessage: currentRun?.open_status_message ?? currentRun?.open_last_error ?? null,
      openAttempts: currentRun?.open_attempts ?? 0,
      closeExpectedAt: currentRun?.close_expected_at ?? null,
      closeConfirmedAt: currentRun?.close_confirmed_at ?? null,
      closeLastCheckedAt: currentRun?.close_last_checked_at ?? null,
      nextCloseCheckAt: currentRun?.next_close_check_at ?? null,
      closeStatus: currentRun?.close_status ?? "pending",
      closeMessage: currentRun?.close_status_message ?? currentRun?.close_last_error ?? null,
      closeAttempts: currentRun?.close_attempts ?? 0
    };
  }

  private visibleRun(market: TrackedMarketRow, run: MarketDailyRunRow | undefined, now: Date): MarketDailyRunRow {
    if (run) return run;
    const local = localTradingDate(now, market.timezone);
    const weekend = isWeekend(local.weekday);
    const sessions = JSON.parse(market.sessions_json);
    const overrides = market.overrides_json ? JSON.parse(market.overrides_json) : undefined;
    const syntheticCalendar: MarketSchedule = {
      timezone: market.timezone,
      sessions,
      dayOverrides: overrides
    };
    const times = expectedTimes(syntheticCalendar, local.isoDate);
    const skippedNoAssets = market.assets_count === 0;
    const openStatus = weekend ? "skipped_weekend" : skippedNoAssets ? "skipped_no_assets" : "pending";
    const closeStatus = weekend ? "skipped_weekend" : skippedNoAssets ? "skipped_no_assets" : "pending";
    return {
      id: 0,
      market_key: market.market_key,
      trading_date: local.isoDate,
      timezone: market.timezone,
      open_expected_at: times.openExpectedAt?.toISOString() ?? null,
      open_status: openStatus,
      open_confirmed_at: null,
      open_attempts: 0,
      open_last_error: null,
      open_last_checked_at: null,
      next_open_check_at: null,
      open_status_message: null,
      open_job_id: null,
      close_expected_at: times.closeExpectedAt?.toISOString() ?? null,
      close_status: closeStatus,
      close_confirmed_at: null,
      close_attempts: 0,
      close_last_error: null,
      close_last_checked_at: null,
      next_close_check_at: null,
      close_status_message: null,
      close_job_id: null,
      assets_count: market.assets_count,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString()
    };
  }

  private computeNextTask(markets: TrackedMarketRow[], runs: Map<string, MarketDailyRunRow>, now: Date): TrackedMarketsSettingsDto["nextTask"] {
    const candidates: NonNullable<TrackedMarketsSettingsDto["nextTask"]>[] = [];
    for (const market of markets) {
      if (!market.enabled || market.assets_count <= 0) continue;
      const run = this.visibleRun(market, runs.get(market.market_key), now);
      if (run.next_open_check_at) {
        candidates.push({
          type: "open",
          marketKey: market.market_key,
          marketName: market.display_name,
          marketTimezone: market.timezone,
          runAt: run.next_open_check_at
        });
      } else if (run.open_expected_at && !["confirmed_open", "confirmed_open_partial", "holiday_suspected", "missed_open_window", "skipped_weekend", "skipped_no_assets"].includes(run.open_status)) {
        candidates.push({
          type: "open",
          marketKey: market.market_key,
          marketName: market.display_name,
          marketTimezone: market.timezone,
          runAt: run.open_expected_at
        });
      }

      if (run.next_close_check_at) {
        candidates.push({
          type: "close",
          marketKey: market.market_key,
          marketName: market.display_name,
          marketTimezone: market.timezone,
          runAt: run.next_close_check_at
        });
      } else if (run.close_expected_at && !["confirmed_closed", "confirmed_closed_partial", "close_not_confirmed", "skipped_weekend", "skipped_no_assets"].includes(run.close_status)) {
        candidates.push({
          type: "close",
          marketKey: market.market_key,
          marketName: market.display_name,
          marketTimezone: market.timezone,
          runAt: minutesAfter(new Date(run.close_expected_at), CLOSE_BUFFER_MINUTES).toISOString()
        });
      }
    }
    return candidates.filter((task) => new Date(task.runAt).getTime() >= now.getTime() - 60_000).sort((a, b) => a.runAt.localeCompare(b.runAt))[0] ?? null;
  }

  async runWeeklyRefresh(now = new Date()) {
    return weeklyRefreshTask.run(now);
  }
}

export const marketScheduler = new MarketSchedulerService();
